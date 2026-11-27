import { db } from "./db";
import { documentAmountDue } from "./trade";

export async function invoiceSettlements(invoices: { id: string; total: bigint }[]) {
  const ids = invoices.map(({ id }) => id);
  const result = new Map<string, { received: bigint; paid: bigint; credited: bigint; refunded: bigint; adjusted: bigint;
    applied: bigint; transferred: bigint; availableCredit: bigint; balance: bigint; notes: {id:string;number:string}[] }>();
  if (!ids.length) return result;

  const receiptTotals = db.allocation.groupBy({ by: ["documentId"],
    where: { documentId: { in: ids }, releasedAt: null, payment: { reversedAt: null } }, _sum: { amount: true } });
  const creditTotals = db.customerCreditUse.groupBy({ by:["invoiceId"], where:{ invoiceId:{in:ids},reversedAt:null }, _sum:{amount:true} });
  const [receipts, credits, applications] = await db.$transaction([
    receiptTotals,
    db.document.findMany({ where: { sourceId: { in: ids }, kind: "credit", status: "posted" }, select: {
      id:true, number:true, sourceId: true, total: true,
      allocations: { where: { releasedAt: null, payment: { kind: "refund", reversedAt: null } }, select: { amount: true } },
      creditUses: { where:{reversedAt:null},select:{amount:true} },
    }}),
    creditTotals,
  ], { isolationLevel: "RepeatableRead" });
  const received = new Map(receipts.map((row) => [row.documentId, row._sum.amount ?? 0n]));
  const appliedByInvoice = new Map(applications.map((row)=>[row.invoiceId,row._sum.amount ?? 0n]));
  const adjustments = new Map<string | null, { credited: bigint; refunded: bigint; transferred:bigint; notes:{id:string;number:string}[] }>();
  for (const credit of credits) {
    const prior = adjustments.get(credit.sourceId) ?? { credited: 0n, refunded: 0n, transferred:0n, notes:[] };
    prior.credited += credit.total;
    prior.refunded += credit.allocations.reduce((sum, entry) => sum + entry.amount, 0n);
    prior.transferred += credit.creditUses.reduce((sum,entry)=>sum+entry.amount,0n);
    prior.notes.push({id:credit.id,number:credit.number});
    adjustments.set(credit.sourceId, prior);
  }
  for (const invoice of invoices) {
    const settled = received.get(invoice.id) ?? 0n;
    const { credited, refunded, transferred, notes } = adjustments.get(invoice.id) ?? { credited: 0n, refunded: 0n, transferred:0n, notes:[] };
    const adjusted=invoice.total-credited;
    const applied=appliedByInvoice.get(invoice.id) ?? 0n;
    const available=settled+applied-adjusted-refunded-transferred;
    result.set(invoice.id, { received: settled, paid: settled - refunded, credited, refunded, adjusted, applied, transferred, notes,
      availableCredit:available>0n?available:0n, balance: documentAmountDue(invoice.total, settled+applied, credited) });
  }
  return result;
}

export function invoicePaymentType(balance: bigint | string, paid: bigint | string) {
  return BigInt(balance) > 0n ? "On credit" : BigInt(paid) > 0n ? "Paid" : "Settled";
}
