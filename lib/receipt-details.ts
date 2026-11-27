import { db } from "./db";
import type { payments } from "./views";
import { invoiceSettlements } from "./invoice-settlement";

type Receipt = Awaited<ReturnType<typeof payments>>[number];
type Snapshot = { invoiceBalances?: Record<string, unknown> };

function minorUnitsInSnapshot(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
}

export async function receiptDetails(row: Receipt) {
  if (row.kind !== "receipt") return null;
  const snapshot = row.snapshot as Snapshot;
  const savedBalance = (id: string) => minorUnitsInSnapshot(snapshot?.invoiceBalances?.[id]);
  const postedAllocations = row.allocations.filter((allocation) => savedBalance(allocation.id) !== null);
  const byDocument = new Map<string, Receipt["allocations"]>();
  for (const allocation of postedAllocations.length ? postedAllocations : row.allocations) {
    const entries = byDocument.get(allocation.documentId) ?? [];
    entries.push(allocation);
    byDocument.set(allocation.documentId, entries);
  }
  const documents = byDocument.size ? await db.document.findMany({
    where: { id: { in: [...byDocument.keys()] } }, include: { lines: { orderBy: { position: "asc" } } },
    orderBy: [{ at: "asc" }, { number: "asc" }],
  }) : [];
  const bills = documents.map((document) => {
    const allocations = byDocument.get(document.id) ?? [];
    const received = allocations.reduce((sum, allocation) =>
      postedAllocations.length || !allocation.releasedAt ? sum + BigInt(allocation.amount) : sum, 0n);
    const endingBalances = allocations.map((allocation) => savedBalance(allocation.id));
    // Each allocation lowers the balance, so the smallest snapshot is the balance after the whole receipt.
    const after = endingBalances.length && endingBalances.every((balance) => balance !== null)
      ? endingBalances.reduce((least, balance) => balance < least ? balance : least) : null;
    return { document, received, after, before: after === null ? null : after + received,
      released: allocations.some((allocation) => allocation.releasedAt),
      discount: document.lines.reduce((sum, line) => sum + line.discount, 0n) };
  });
  const balances = await invoiceSettlements(bills.flatMap(({ document, after }) =>
    after === null && document.kind === "invoice" && document.status === "posted" ? [document] : []));
  const paid = BigInt(row.amount);
  const showReceiptAmount = bills.length !== 1 || bills[0].received !== paid;
  return { bills: bills.map((bill) => ({ ...bill, settlement: balances.get(bill.document.id) })), paid, showReceiptAmount };
}
