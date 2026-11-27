import { Prisma } from "@prisma/client";
import type { Tx } from "./db";

export type DebtDocument = {
  id: string; number: string; at: Date; total: bigint;
  kind: "invoice" | "customerOpening"; balance: bigint; paid: bigint; credited: bigint; applied: bigint;
};
type CustomerBalance = { id: string; name: string; phone: string; archived: boolean; balance: bigint };

function debtDocuments(customerFilter: Prisma.Sql) {
  return Prisma.sql`
    SELECT d.id, d."partyId", d.number, d.at, d.total, d.kind::text AS kind,
      COALESCE(paid.total, 0)::bigint AS paid, COALESCE(credits.total, 0)::bigint AS credited, COALESCE(applied.total, 0)::bigint AS applied,
      (d.total - COALESCE(paid.total, 0) - COALESCE(credits.total, 0) - COALESCE(applied.total, 0))::bigint AS balance
    FROM "Document" d
    LEFT JOIN LATERAL (
      SELECT SUM(a.amount) AS total FROM "Allocation" a
      JOIN "Payment" p ON p.id = a."paymentId"
      WHERE a."documentId" = d.id AND a."releasedAt" IS NULL AND p."reversedAt" IS NULL
    ) paid ON true
    LEFT JOIN LATERAL (
      SELECT SUM(c.total) AS total FROM "Document" c
      WHERE c."sourceId" = d.id AND c.status = 'posted' AND c.kind IN ('credit', 'supplierCredit')
    ) credits ON true
    LEFT JOIN LATERAL (
      SELECT SUM(u.amount) AS total FROM "CustomerCreditUse" u WHERE u."invoiceId"=d.id AND u."reversedAt" IS NULL
    ) applied ON true
    WHERE d.status = 'posted' AND d.kind IN ('invoice', 'customerOpening') AND ${customerFilter}
  `;
}

export function openCustomerDebts(tx: Tx, partyId: string) {
  return tx.$queryRaw<DebtDocument[]>`
    SELECT id, number, at, total, kind, balance, paid, credited, applied
    FROM (${debtDocuments(Prisma.sql`d."partyId" = ${partyId}`)}) AS debt
    WHERE balance > 0
    ORDER BY at, number
  `;
}

export function customerDebtList(tx: Tx, q: string, skip: number, take: number, sort: "name" | "balance" = "name") {
  const search = q ? Prisma.sql`AND (strpos(lower(name), lower(${q})) > 0 OR strpos(phone, ${q}) > 0)` : Prisma.empty;
  const priority = sort === "balance" ? Prisma.sql`balances.balance DESC,` : Prisma.empty;
  return tx.$queryRaw<CustomerBalance[]>`
    WITH customers AS (
      SELECT id, name, phone, archived FROM "Party" WHERE kind = 'customer' ${search}
    ), balances AS (
      SELECT "partyId", SUM(balance)::bigint AS balance
      FROM (${debtDocuments(Prisma.sql`d."partyId" IN (SELECT id FROM customers)`)}) AS debt
      WHERE balance > 0 GROUP BY "partyId"
    )
    SELECT customers.*, balances.balance FROM customers JOIN balances ON balances."partyId" = customers.id
    ORDER BY ${priority} lower(customers.name), customers.id LIMIT ${take} OFFSET ${skip}
  `;
}
