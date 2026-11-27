import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if(!process.env.DATABASE_URL)throw Error("Set DATABASE_URL to the database to reconcile.");
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
try{
  const report=await db.$transaction(async(tx)=>{
    const [{hasCreditLedger}]=await tx.$queryRaw`SELECT to_regclass('"CustomerCreditUse"') IS NOT NULL AS "hasCreditLedger"`;
    const ledger=hasCreditLedger?Prisma.sql`SELECT "creditId", "receiptId", "invoiceId", "payoutId", amount FROM "CustomerCreditUse" WHERE "reversedAt" IS NULL`:
      Prisma.sql`SELECT NULL::text AS "creditId", NULL::text AS "receiptId", NULL::text AS "invoiceId", NULL::text AS "payoutId", 0::bigint AS amount WHERE false`;
    const rows=await tx.$queryRaw`
      WITH uses AS (${ledger}),
      allocations AS (
        SELECT a."documentId", a."paymentId", a.amount FROM "Allocation" a JOIN "Payment" p ON p.id=a."paymentId"
        WHERE a."releasedAt" IS NULL AND p."reversedAt" IS NULL
      ), allocated AS (SELECT "documentId", SUM(amount) AS amount FROM allocations GROUP BY "documentId"),
      from_payment AS (SELECT "paymentId", SUM(amount) AS amount FROM allocations GROUP BY "paymentId"),
      to_invoice AS (SELECT "invoiceId", SUM(amount) AS amount FROM uses GROUP BY "invoiceId"),
      from_receipt AS (SELECT "receiptId", SUM(amount) AS amount FROM uses GROUP BY "receiptId"),
      from_note AS (SELECT "creditId", SUM(amount) AS amount FROM uses GROUP BY "creditId"),
      notes AS (
        SELECT c.id, c.number, c.total, c."sourceId", i.total-COALESCE(a.amount,0)-COALESCE(u.amount,0) AS headroom,
          SUM(c.total) OVER(PARTITION BY c."sourceId" ORDER BY c."createdAt", c.number) AS cumulative
        FROM "Document" c JOIN "Document" i ON i.id=c."sourceId"
        LEFT JOIN allocated a ON a."documentId"=i.id LEFT JOIN to_invoice u ON u."invoiceId"=i.id
        WHERE c.status='posted' AND c.kind='credit'
      ), note_positions AS (
        SELECT c.id,c.number,c.total,c."sourceId", GREATEST(0,c.cumulative-c.headroom)-GREATEST(0,c.cumulative-c.total-c.headroom)
          -COALESCE(a.amount,0)-COALESCE(u.amount,0) AS available
        FROM notes c LEFT JOIN allocated a ON a."documentId"=c.id LEFT JOIN from_note u ON u."creditId"=c.id
      ), receipt_positions AS (
        SELECT p.id, p.number, p.amount-COALESCE(a.amount,0) AS unallocated,
          p.amount-COALESCE(a.amount,0)-COALESCE(u.amount,0) AS available
        FROM "Payment" p LEFT JOIN from_payment a ON a."paymentId"=p.id LEFT JOIN from_receipt u ON u."receiptId"=p.id
        WHERE p.kind='receipt' AND p."reversedAt" IS NULL
      ), debt_positions AS (
        SELECT i.number,i.total,i.total-COALESCE(c.total,0)-COALESCE(a.amount,0)-COALESCE(u.amount,0) AS position
        FROM "Document" i LEFT JOIN (SELECT "sourceId",SUM(total) AS total FROM notes GROUP BY "sourceId") c ON c."sourceId"=i.id
        LEFT JOIN allocated a ON a."documentId"=i.id LEFT JOIN to_invoice u ON u."invoiceId"=i.id
        WHERE i.kind IN ('invoice','customerOpening') AND i.status='posted'
      )
      SELECT 'activeInvoiceAndOpeningValue' AS category, NULL::text AS reference, COALESCE(SUM(total),0)::text AS value FROM debt_positions
      UNION ALL SELECT 'outstandingDebt',NULL,COALESCE(SUM(GREATEST(0,position)),0)::text FROM debt_positions
      UNION ALL SELECT 'postedCreditNoteValue',NULL,COALESCE(SUM(total),0)::text FROM notes
      UNION ALL SELECT 'availableCredit',NULL,(COALESCE((SELECT SUM(GREATEST(0,available)) FROM note_positions),0)+
        COALESCE((SELECT SUM(GREATEST(0,available)) FROM receipt_positions),0))::text
      UNION ALL SELECT 'netReceiptCash',NULL,COALESCE(SUM(c.amount),0)::text FROM "CashMovement" c JOIN "Payment" p ON p.id=c."paymentId" WHERE p.kind='receipt'
      UNION ALL SELECT 'netRefundCash',NULL,(0-COALESCE(SUM(c.amount),0))::text FROM "CashMovement" c JOIN "Payment" p ON p.id=c."paymentId" WHERE p.kind='refund'
      UNION ALL SELECT 'review_unallocated_receipt',number,unallocated::text FROM receipt_positions WHERE unallocated>0
      UNION ALL SELECT 'review_invoice_wide_credit',d.number,d.total::text FROM "Document" d
        WHERE d.kind='credit' AND d.status='posted' AND NOT EXISTS(SELECT 1 FROM "Line" l WHERE l."documentId"=d.id)
      UNION ALL SELECT 'error_credit_note_overspent',number,available::text FROM note_positions WHERE available<0
      UNION ALL SELECT 'error_receipt_overspent',number,available::text FROM receipt_positions WHERE available<0
      UNION ALL SELECT 'error_customer_mismatch',d.number,a.amount::text FROM allocations a JOIN "Document" d ON d.id=a."documentId"
        JOIN "Payment" p ON p.id=a."paymentId" WHERE p.kind IN ('receipt','refund') AND p."partyId" IS DISTINCT FROM d."partyId"
      UNION ALL SELECT 'error_credit_application_customer_mismatch',d.number,u.amount::text
        FROM uses u JOIN "Document" d ON d.id=u."invoiceId" LEFT JOIN "Document" c ON c.id=u."creditId" LEFT JOIN "Payment" p ON p.id=u."receiptId"
        WHERE d."partyId" IS DISTINCT FROM COALESCE(c."partyId",p."partyId")
      ORDER BY category,reference`;
    return {hasCreditLedger,totals:Object.fromEntries(rows.filter((row)=>row.reference===null).map((row)=>[row.category,row.value])),
      review:rows.filter((row)=>row.category.startsWith("review_")),issues:rows.filter((row)=>row.category.startsWith("error_"))};
  },{isolationLevel:"RepeatableRead"});
  console.log(JSON.stringify(report,null,2));
  if(report.issues.length)process.exitCode=1;
}finally{await db.$disconnect();}
