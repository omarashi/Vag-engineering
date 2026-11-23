import { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { document, snapshot, validParty, type LineData } from "./documents";
import { cents, date, extended, needed, requireRule, today, units } from "./rules";
import { payment } from "./cash";
import { move } from "./stock";
import type { Actor, Change } from "./transaction";
import type { Input } from "./masters";
import { visitParts, visitWork, workshopIntake } from "./visit-items";
import { parseMoney } from "./decimal-input";
import { serviceName } from "./services";
import { recordedDeliveryDate } from "./visits";

async function billingSource(tx: Tx, input: Input) {
  const visit = await tx.document.findFirst({
    where: { id: needed(input.visitId), kind: { in: ["visit", "job"] }, status: { not: "cancelled" } },
  });
  requireRule(visit?.partyId && visit.vehicleId, "invalidDocument");
  const existing = await tx.document.findFirst({ where: { sourceId: visit.id, kind: "invoice", status: "posted" } });
  return { visit, existing };
}

async function billVisit(tx: Tx, actor: Actor, visit: Awaited<ReturnType<typeof billingSource>>["visit"], input: Input, at: Date) {
  const intake = workshopIntake(visit.metadata);
  requireRule(visit.kind === "visit" || intake, "invalidDocument");
  requireRule(!intake || visit.status === "delivered", "finishBeforeBilling");
  const invoiceDay = today(at);
  const serviceDay = recordedDeliveryDate(visit) || today(visit.at);
  requireRule(invoiceDay >= serviceDay && invoiceDay <= today(), "invalidInvoiceDate");
  requireRule(input.visitVersion === undefined || input.visitVersion === visit.version, "stale", 409);
  const work = visitWork(visit);
  const prices = input.servicePrices;
  requireRule(work.length > 0, "needServices");
  requireRule(prices !== null && typeof prices === "object" && !Array.isArray(prices) && Object.keys(prices).length === work.length, "needServicePrices");
  const servicePrices = prices as Record<string, unknown>;
  const serviceLines = work.map(({ service }, position): LineData => {
    const price = parseMoney(servicePrices[service]);
    requireRule(price !== null && price >= 0n, "needServicePrices");
    return {
      kind: "service", description: serviceName("en", service), partId: null, quantity: new Prisma.Decimal(1),
      price, discount: 0n, total: price, position,
    };
  });
  await validParty(tx, visit.partyId, "customer");
  const parts = visitParts(visit.metadata);
  const stock = await tx.part.findMany({ where: { id: { in: parts.map((part) => part.partId) }, archived: false }, select: { id: true, cost: true } });
  const costs = new Map(stock.map((item) => [item.id, item.cost]));
  const partsLines = parts.map((item, index): LineData & { partId: string } => {
    const cost = costs.get(item.partId);
    requireRule(cost !== undefined, "missingPart");
    const quantity = units(item.quantity);
    const price = BigInt(item.unitPrice);
    return {
      kind: "part", partId: item.partId, description: item.code + " · " + item.name,
      quantity, price, discount: 0n, total: extended(quantity, price),
      costTotal: extended(quantity, cost), stockQty: quantity, position: work.length + index,
    };
  });
  const lines = [...serviceLines, ...partsLines];
  requireRule(lines.some((line) => line.total > 0n), "amountMismatch");
  const billed = await document(tx, actor, "invoice", {
    partyId: visit.partyId, vehicleId: visit.vehicleId, sourceId: visit.id, at, title: visit.title, status: "posted",
    note: visit.note,
    metadata: {
      itemizedVisit: true,
      services: work.map((item) => item.service),
      serviceDetails: Object.fromEntries(work.map(({ service, detail }) => [service, detail])),
    },
    snapshot: await snapshot(tx, visit.partyId, visit.vehicleId),
  }, lines);
  for (const row of partsLines) {
    await move(tx, actor, {
      partId: row.partId, kind: "sale", quantity: row.quantity.negated(), documentId: billed.id, at, totalCost: row.costTotal,
    });
  }
  return billed;
}

export async function visitInvoice(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const { visit, existing } = await billingSource(tx, input);
  requireRule(!existing, "alreadyPosted", 409);
  const after = await billVisit(tx, actor, visit, input, date(input.at));
  return { id: after.id, entity: "document", after };
}

export async function visitReceipt(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const { visit, existing } = await billingSource(tx, input);
  const amount = cents(input.amount);
  requireRule(amount > 0n, "amountMismatch");
  const at = date(input.at);
  if (existing) requireRule(input.servicePrices === undefined, "alreadyPosted", 409);
  const invoice = existing ?? await billVisit(tx, actor, visit, input, at);
  const paid = await payment(tx, {
    kind: "receipt", invoiceId: invoice.id, amount: input.amount, accountId: input.accountId, method: input.method, at: input.at,
    note: input.note, cashTendered: input.cashTendered,
  }, actor);
  return { ...paid, after: { invoiceId: invoice.id, createdInvoice: !existing, payment: paid.after } };
}

