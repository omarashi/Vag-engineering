import { Prisma } from "@prisma/client";
import { json, type Tx } from "./db";
import { document, snapshot, validParty, type LineData } from "./documents";
import { cents, date, extended, needed, record, requireRule, text, today, units } from "./rules";
import { payment } from "./cash";
import { move } from "./stock";
import type { Actor, Change } from "./transaction";
import type { Input } from "./masters";
import { visitParts, visitWork, workshopIntake } from "./visit-items";
import { divideHalfUp, parseMoney } from "./decimal-input";
import { requiresServicePrice, serviceName } from "./services";
import { recordedDeliveryDate } from "./visits";
import { billingMetadata, hasBillingInput, workshopBillingData, workshopBillingLines } from "./workshop-billing-lines";
import { billingSelection, chargeTypes, savedBillingSelection, workshopChargeInputs, workshopCharges, workshopMetadata } from "./workshop-charges";

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
  const pricedWork = work.filter(({ service }) => requiresServicePrice(service));
  const prices = input.servicePrices === undefined && !pricedWork.length ? {} : input.servicePrices;
  requireRule(work.length > 0 || billingSelection(visit.metadata).length > 0, "needServices");
  requireRule(prices !== null && typeof prices === "object" && !Array.isArray(prices) &&
    Object.keys(prices).length === pricedWork.length, "needServicePrices");
  const servicePrices = prices as Record<string, unknown>;
  // Keep the original work positions so receipt rows can find their saved service details.
  const serviceLines = work.flatMap(({ service }, position): LineData[] => {
    if (!requiresServicePrice(service)) return [];
    const price = parseMoney(servicePrices[service]);
    requireRule(price !== null && price >= 0n, "needServicePrices");
    return [{
      kind: "service", description: serviceName("en", service), partId: null, quantity: new Prisma.Decimal(1),
      price, discount: 0n, total: price, position,
    }];
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
  const billing = await workshopBillingData(tx, visit.metadata, input);
  const checklist = savedBillingSelection(visit.metadata);
  if (checklist) {
    const requestedCharges = input.workshopCharges === undefined ? workshopCharges(visit.metadata) : record(input.workshopCharges);
    requireRule(chargeTypes.every((type) => checklist.includes(type)
      ? workshopChargeInputs(requestedCharges, type).some((raw) => parseMoney(raw) !== null)
      : billing.charges[type] === undefined), "invalidWorkshopCharge");
    requireRule(billing.importRequested === checklist.includes("importedItem"), "importOptionRequired");
    requireRule(!billing.importRequested || billing.importItems.length > 0, "importItemRequired");
  }
  const lines = [...serviceLines, ...partsLines, ...workshopBillingLines(billing, work.length + partsLines.length)];
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0n);
  requireRule(subtotal > 0n, "amountMismatch");
  const discount = parseMoney(text(input.invoiceDiscount,24) || "0");
  requireRule(discount !== null && discount >= 0n && discount <= subtotal, "invalidInvoiceDiscount");
  if (discount > 0n) {
    // Allocate the discount across existing lines so partial returns use their net values.
    let grossSoFar = 0n;
    let assigned = 0n;
    for (const line of lines) {
      grossSoFar += line.total;
      const allocatedDiscount = divideHalfUp(grossSoFar * discount, subtotal);
      line.discount = allocatedDiscount - assigned;
      line.total -= line.discount;
      assigned = allocatedDiscount;
    }
  }
  const billed = await document(tx, actor, "invoice", {
    partyId: visit.partyId, vehicleId: visit.vehicleId, sourceId: visit.id, at, title: visit.title, status: "posted",
    note: visit.note,
    metadata: {
      itemizedVisit: true,
      services: work.map((item) => item.service),
      descriptiveServices: work.filter(({ service }) => !requiresServicePrice(service)).map(({ service }) => service),
      serviceDetails: Object.fromEntries(work.map(({ service, detail }) => [service, detail])),
    },
    snapshot: await snapshot(tx, visit.partyId, visit.vehicleId),
  }, lines);
  if (hasBillingInput(input)) await tx.document.update({ where: { id: visit.id }, data: {
    version: { increment: 1 }, metadata: json({ ...workshopMetadata(visit.metadata), ...billingMetadata(billing) }),
  }});
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
  if (existing) requireRule(input.servicePrices === undefined && input.invoiceDiscount === undefined && !hasBillingInput(input), "alreadyPosted", 409);
  const invoice = existing ?? await billVisit(tx, actor, visit, input, at);
  const paid = await payment(tx, {
    kind: "receipt", invoiceId: invoice.id, amount: input.amount, accountId: input.accountId, method: input.method, at: input.at,
    paymentChannel: input.paymentChannel, receiptDestination: input.receiptDestination,
    note: input.note,
  }, actor);
  return { ...paid, after: { invoiceId: invoice.id, createdInvoice: !existing, payment: paid.after } };
}

