import { db } from "./db";
import { due } from "./trade";
import type { payments } from "./views";

type Receipt = Awaited<ReturnType<typeof payments>>[number];
type Snapshot = { invoiceBalances?: Record<string, unknown>; customerDebtAfter?: unknown };

function balanceInSnapshot(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
}

export async function receiptDetails(row: Receipt) {
  if (row.kind !== "receipt") return { bills: [], customerDebtAfter: null };
  const snapshot = row.snapshot as Snapshot;
  const byDocument = new Map<string, Receipt["allocations"]>();
  for (const allocation of row.allocations) {
    const entries = byDocument.get(allocation.documentId) ?? [];
    entries.push(allocation);
    byDocument.set(allocation.documentId, entries);
  }
  const documents = byDocument.size ? await db.document.findMany({
    where: { id: { in: [...byDocument.keys()] } }, include: { lines: { orderBy: { position: "asc" } } },
    orderBy: [{ at: "asc" }, { number: "asc" }],
  }) : [];
  const bills = await Promise.all(documents.map(async (document) => {
    const allocations = byDocument.get(document.id) ?? [];
    const active = allocations.filter((allocation) => !allocation.releasedAt);
    const applied = active.length ? active : allocations;
    const saved = applied.map((allocation) => balanceInSnapshot(snapshot?.invoiceBalances?.[allocation.id]));
    // Multiple allocations from the same receipt can target one invoice. The lowest stored balance is the last application.
    const atPayment = saved.length && saved.every((amount) => amount !== null)
      ? saved.reduce((min, amount) => amount < min ? amount : min, saved[0]) : null;
    const current = !row.reversedAt && active.length && document.status === "posted" && atPayment === null ? await due(db, document) : null;
    return {
      document, applied: applied.reduce((sum, allocation) => sum + BigInt(allocation.amount), 0n),
      released: !active.length, atPayment, current,
    };
  }));
  return { bills, customerDebtAfter: balanceInSnapshot(snapshot?.customerDebtAfter) };
}
