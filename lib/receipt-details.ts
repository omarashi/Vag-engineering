import { db } from "./db";
import type { payments } from "./views";

type Receipt = Awaited<ReturnType<typeof payments>>[number];
type Snapshot = { receiptTotal?: unknown };

function minorUnitsInSnapshot(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
}

export async function receiptDetails(row: Receipt) {
  if (row.kind !== "receipt") return null;
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
  const bills = documents.map((document) => ({
    document, released: !byDocument.get(document.id)?.some((allocation) => !allocation.releasedAt),
  }));
  const amount = BigInt(row.amount);
  const total = minorUnitsInSnapshot(snapshot?.receiptTotal)
    ?? (documents.length ? documents.reduce((sum, document) => sum + document.total, 0n) : amount);
  const discount = documents.reduce((sum, document)=>sum+document.lines.reduce((lineSum,line)=>lineSum+line.discount,0n),0n);
  return { bills, discount, total, paid: amount };
}
