import type { CustomerCreditUse, Document } from "@prisma/client";
import { db, type Tx } from "./db";
import { postPayment } from "./cash";
import { validParty } from "./documents";
import type { Input } from "./masters";
import { cents, choice, date, list, needed, requireRule, today } from "./rules";
import { allocated, credit, creditEntitlement, due, protectSettledCredits, usedCredit } from "./trade";
import { audit, type Actor, type Change } from "./transaction";

type CreditSource = { creditId: string } | { receiptId: string };

async function receiptAllocated(tx: Tx, receiptId: string) {
  return (await tx.allocation.aggregate({ where: { paymentId: receiptId, releasedAt: null }, _sum: { amount: true } }))._sum.amount ?? 0n;
}

async function sourcePosition(tx: Tx, source: CreditSource, partyId: string) {
  if ("creditId" in source) {
    const note = await tx.document.findFirst({ where: { id: source.creditId, status: "posted", kind: "credit", partyId } });
    requireRule(note, "invalidDocument");
    return { at: note.at, available: await due(tx, note) };
  }
  const receipt = await tx.payment.findFirst({ where: { id: source.receiptId, kind: "receipt", reversedAt: null, partyId } });
  requireRule(receipt, "invalidDocument");
  return { at: receipt.at, available: receipt.amount - await receiptAllocated(tx, receipt.id) - await usedCredit(tx, source) };
}

function readSource(input: Input): CreditSource {
  requireRule(Boolean(input.creditId) !== Boolean(input.receiptId), "selectCreditSource");
  return input.creditId ? { creditId: needed(input.creditId) } : { receiptId: needed(input.receiptId) };
}

async function applyCredit(tx: Tx, actor: Actor, partyId: string, source: CreditSource, invoiceId: string, amount: bigint, at: Date) {
  const invoice = await tx.document.findFirst({ where: { id: invoiceId, partyId, kind: "invoice", status: "posted" } });
  requireRule(invoice, "selectDebtInvoice");
  const position = await sourcePosition(tx, source, partyId);
  requireRule(today(at) >= today(position.at) && today(at) >= today(invoice.at) && today(at) <= today(), "invalidDate");
  requireRule(amount > 0n && amount <= position.available, "creditUnavailable", 409);
  requireRule(amount <= await due(tx, invoice), "debtOverpayment");
  const entry = await tx.customerCreditUse.create({ data: { ...source, invoiceId, amount, at, actorId: actor.id } });
  await audit(tx, actor.id, "applyCustomerCredit", "customerCreditUse", entry.id, null, entry);
  return entry;
}

export async function customerCreditApply(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const partyId = await validParty(tx, input.partyId, "customer");
  const source = readSource(input);
  const allocations = input.allocations === undefined ? [{ documentId: input.invoiceId, amount: input.amount }] : list(input.allocations, 30);
  requireRule(allocations.length > 0 && new Set(allocations.map((row) => row.documentId)).size === allocations.length, "selectDebtInvoice");
  const at = date(input.at);
  const entries = [];
  for (const entry of allocations) entries.push(await applyCredit(tx, actor, partyId, source, needed(entry.documentId), cents(entry.amount), at));
  return { id: entries[0].id, entity: "customerCreditUse", after: entries };
}

async function refundPayment(tx: Tx, input: Input, actor: Actor, partyId: string, amount: bigint,
  allocations: { documentId: string; amount: bigint }[], fromReceipt = false) {
  return postPayment(tx, { kind: "refund", partyId, at: input.at, amount: moneyText(amount), accountId: input.accountId,
    paymentChannel: input.paymentChannel, method: input.method, note: input.reason,
    allocations: allocations.map((row) => ({ ...row, amount: moneyText(row.amount) })) }, actor, undefined, fromReceipt);
}

function moneyText(amount: bigint) {
  return (amount / 100n).toString() + "." + (amount % 100n).toString().padStart(2, "0");
}

export async function customerCreditPayout(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const partyId = await validParty(tx, input.partyId, "customer");
  const source = readSource(input);
  const amount = cents(input.amount);
  const at = date(input.at);
  const position = await sourcePosition(tx, source, partyId);
  requireRule(amount > 0n && amount <= position.available, "creditUnavailable", 409);
  requireRule(today(at) >= today(position.at) && today(at) <= today(), "invalidDate");
  const payout = await refundPayment(tx, input, actor, partyId, amount, "creditId" in source ? [{ documentId: source.creditId, amount }] : [], "receiptId" in source);
  if ("receiptId" in source) {
    const entry = await tx.customerCreditUse.create({ data: { ...source, payoutId: payout.id, amount, at, actorId: actor.id } });
    await audit(tx, actor.id, "customerCreditPayout", "customerCreditUse", entry.id, null, entry);
  }
  return { ...payout, entity: "payment" };
}

export async function reverseCustomerCredit(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const id = needed(input.id);
  const before = await tx.customerCreditUse.findFirst({ where: { id, reversedAt: null, invoiceId: { not: null } } });
  requireRule(before?.invoiceId, "invalidDocument");
  const reversedAt = date(input.at);
  requireRule(today(reversedAt) >= today(before.at) && today(reversedAt) <= today(), "invalidDate");
  const after = await tx.customerCreditUse.update({ where: { id }, data: { reversedAt, reversedBy: actor.id, reverseReason: needed(input.reason, 1000) } });
  await protectSettledCredits(tx, before.invoiceId);
  return { id, entity: "customerCreditUse", before, after };
}

export async function customerRefund(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const partyId = await validParty(tx, input.partyId, "customer");
  const entries = list(input.invoices, 20);
  requireRule(entries.length > 0 && new Set(entries.map((row) => row.invoiceId)).size === entries.length, "selectDebtInvoice");
  const at = date(input.at);
  requireRule(today(at) <= today(), "invalidDate");
  const reason = needed(input.reason, 2000);
  const settlement = choice(input.settlement, ["keep", "apply", "payout"] as const);
  const batch = await tx.refundBatch.create({ data: { partyId, at, actorId: actor.id, reason, settlement } });
  const noteIds: string[] = [];
  const sources: { documentId: string; amount: bigint }[] = [];
  let available = 0n;
  let total = 0n;
  for (const entry of entries) {
    const sourceId = needed(entry.invoiceId);
    requireRule(await tx.document.findFirst({ where: { id: sourceId, partyId, kind: "invoice", status: "posted" }, select: { id: true } }), "invalidDocument");
    const change = await credit(tx, { sourceId, at: input.at, reason, lines: entry.lines, full: entry.full, amount: entry.amount }, actor, batch.id);
    const note = change.after as Document;
    noteIds.push(note.id);
    total+=note.total;
    const amount = await due(tx, note);
    if (amount > 0n) sources.push({ documentId: note.id, amount });
    available += amount;
    await audit(tx, actor.id, "credit", "document", note.id, null, note);
  }
  let payout: string | undefined;
  const applied: CustomerCreditUse[] = [];
  requireRule(input.expectedTotal===String(total) && input.expectedAvailable===String(available),"staleRefund",409);
  if (settlement !== "keep") requireRule(available > 0n, "creditUnavailable", 409);
  if (settlement === "payout") {
    requireRule(input.paidOut===true,"confirmRefundPayout");
    const result = await refundPayment(tx, input, actor, partyId, available, sources);
    payout = result.id;
    await audit(tx, actor.id, "customerCreditPayout", "payment", payout, null, result.after);
  }
  if (settlement === "apply") {
    const invoiceId = needed(input.destinationId);
    requireRule(!entries.some((row)=>row.invoiceId===invoiceId),"selectDebtInvoice");
    for (const { documentId, amount } of sources) applied.push(await applyCredit(tx, actor, partyId, { creditId: documentId }, invoiceId, amount, at));
  }
  return { id: batch.id, entity: "refundBatch", after: { ...batch, noteIds, payout, applied } };
}

export async function customerCredits(partyId: string, tx: Tx = db) {
  const [notes, receipts] = await Promise.all([
    tx.document.findMany({ where: { partyId, kind: "credit", status: "posted" }, orderBy: [{ at: "desc" }, { number: "desc" }], include: {
      source: { select: { id: true, number: true } },
      allocations: { where: { payment: { kind: "refund" } }, include: { payment: true } },
      creditUses: { include: { invoice: { select: { id: true, number: true } }, payout: true } },
    }}),
    tx.payment.findMany({ where: { partyId, kind: "receipt" }, orderBy: [{ at: "desc" }, { number: "desc" }], include: {
      allocations: { select: { amount: true, releasedAt: true } },
      creditUses: { include: { invoice: { select: { id: true, number: true } }, payout: true } },
    }}),
  ]);
  const amounts = (uses: typeof notes[number]["creditUses"]) => uses.reduce((sum, row) => row.reversedAt ? sum : sum + row.amount, 0n);
  const creditNotes = await Promise.all(notes.map(async (note) => {
    const original = await creditEntitlement(tx, note);
    const refunded = note.allocations.reduce((sum, row) => row.releasedAt || row.payment.reversedAt ? sum : sum + row.amount, 0n);
    return { creditId: note.id, receiptId: null, at: note.at, number: note.number, source: note.source, original,
      refunded, applied: amounts(note.creditUses), uses: note.creditUses, payouts: note.allocations.map((row) => row.payment),
      available: original - refunded - amounts(note.creditUses) };
  }));
  const overpayments = receipts.map((entry) => {
    const original = entry.reversedAt ? 0n : entry.amount - entry.allocations.reduce((sum, row) => row.releasedAt ? sum : sum + row.amount, 0n);
    const refunded = amounts(entry.creditUses.filter((row) => row.payoutId));
    const applied = amounts(entry.creditUses.filter((row) => row.invoiceId));
    return { creditId: null, receiptId: entry.id, at: entry.at, number: entry.number, source: null, original,
      refunded, applied, uses: entry.creditUses, payouts: [], available: original - refunded - applied };
  });
  const sources = [...creditNotes, ...overpayments].filter((row) => row.original !== 0n || row.uses.length || row.payouts.length);
  return { sources, available: sources.reduce((sum, row) => sum + (row.available > 0n ? row.available : 0n), 0n) };
}
