import { Prisma, type Document } from "@prisma/client";
import { db, json, type Tx } from "./db";
import { document, snapshot, validParty, validVehicle } from "./documents";
import { checkVersion, type Input } from "./masters";
import { choice, date, integer, list, needed, record, requireRule, text, today, units } from "./rules";
import { isService, serviceTypes } from "./services";
import { hasServiceTitle, intakeStatuses, jobModes, serviceSummary, visitParts, visitWork, workshopIntake, type VisitPart } from "./visit-items";
import type { Actor, Change } from "./transaction";

async function saveVisitParts(tx: Tx, input: unknown, prior: VisitPart[], visitId?: string) {
  if (input === undefined) return prior;
  const chosen = list(input, 50).map((part) => ({ partId: needed(part.partId), quantity: units(part.quantity).toFixed() }));
  const ids = new Set(chosen.map((part) => part.partId));
  requireRule(ids.size === chosen.length, "duplicateVisitPart");
  const byId = new Map(prior.map((part) => [part.partId, part]));
  if (prior.length === chosen.length && chosen.every((part) => byId.get(part.partId)?.quantity === part.quantity)) return prior;
  if (visitId) {
    const invoice = await tx.document.findFirst({ where: { kind: "invoice", sourceId: visitId, status: "posted" }, select: { id: true } });
    requireRule(!invoice, "visitPartsAlreadyInvoiced", 409);
  }
  const changedIds = chosen.filter((part) => byId.get(part.partId)?.quantity !== part.quantity).map((part) => part.partId);
  const catalog = await tx.part.findMany({
    where: { id: { in: changedIds }, archived: false },
    select: { id: true, name: true, code: true, price: true, onHand: true, reserved: true },
  });
  const catalogById = new Map(catalog.map((part) => [part.id, part]));
  return chosen.map((part) => {
    const existing = byId.get(part.partId);
    if (existing?.quantity === part.quantity) return existing;
    const item = catalogById.get(part.partId);
    requireRule(item, "missingPart");
    requireRule(item.onHand.minus(item.reserved).gte(part.quantity), "stockConflict", 409);
    if (existing) return { ...existing, quantity: part.quantity };
    return { ...part, name: item.name, code: item.code, unitPrice: item.price.toString() };
  });
}

export function saveVisit(tx: Tx, input: Input, actor: Actor) {
  return saveServiceRecord(tx, input, actor, "visit");
}

export function saveWorkshopJob(tx: Tx, input: Input, actor: Actor) {
  return saveServiceRecord(tx, input, actor, "job");
}

export function jobEndDate(input: unknown, at: Date) {
  const end = today(date(needed(input, 10)));
  requireRule(end >= today(at) && end <= today(), "invalidDeliveryDate");
  return end;
}

export function recordedDeliveryDate(row: Pick<Document, "at" | "status" | "metadata">) {
  const intake = workshopIntake(row.metadata);
  if (!intake || row.status !== "delivered") return "";
  if (intake.jobMode === "quick") return today(row.at);
  const { deliveredAt } = row.metadata as { deliveredAt?: string };
  return intake.deliveryDate || (deliveredAt ? today(deliveredAt) : intake.finishedAt);
}

async function saveServiceRecord(tx: Tx, input: Input, actor: Actor, kind: "visit" | "job"): Promise<Change> {
  const id = text(input.id, 120);
  const before = id ? await tx.document.findFirst({ where: { id, kind } }) : null;
  checkVersion(before, input);
  const priorIntake = workshopIntake(before?.metadata);
  if (kind === "job" && before) requireRule(priorIntake && before.status !== "cancelled", "invalidJob");
  const at = date(needed(input.at, 12));
  requireRule(today(at) <= today(), "futureVisit");
  let status = before?.status ?? "delivered";
  let intake = {};
  if (kind === "job") {
    const jobMode = choice(input.jobMode, jobModes);
    const receivedBy = needed(input.receivedBy, 120);
    const previousStatus = before?.status;
    const previouslyFinished = previousStatus === "delivered";
    if (previouslyFinished) requireRule(jobMode === priorIntake?.jobMode, "invalidStatus");
    let deliveryDate = "";
    if (jobMode === "quick") {
      status = "delivered";
      deliveryDate = today(at);
    } else if (before && previousStatus === "delivered") {
      deliveryDate = jobEndDate(input.deliveryDate ?? recordedDeliveryDate(before), at);
    } else {
      requireRule(!input.deliveryDate && !input.finishedAt, "finishJobSeparately");
      status = choice(input.status || previousStatus || "inProgress", intakeStatuses);
    }
    intake = { jobMode, receivedBy, ...(deliveryDate ? { deliveryDate } : {}) };
  }
  const mileage = input.mileage == null || input.mileage === "" ? null : integer(input.mileage, 0, 9999999);
  const requested = input.services ?? (input.category ? [input.category] : []);
  requireRule(Array.isArray(requested) && requested.length > 0 && requested.length <= serviceTypes.length, "needServices");
  const services = [...new Set(requested.map((service) => choice(service, serviceTypes)))];
  const previousTitle = before && !hasServiceTitle(before.metadata) ? before.title : "";
  const customTitle = input.title === undefined ? previousTitle : needed(input.title, 180);
  const inputDetails = input.serviceDetails === undefined
    ? Object.fromEntries(before ? visitWork(before).map(({ service, detail }) => [service, detail]) : [])
    : record(input.serviceDetails);
  const serviceDetails = Object.fromEntries(services.map((service) => [service, text(inputDetails[service], 2000)]));
  const parts = await saveVisitParts(tx, input.parts, visitParts(before?.metadata), before?.id);
  const details = {
    at,
    category: services[0],
    title: customTitle || serviceSummary("en", services),
    note: text(input.note),
    metadata: json({ ...(before?.metadata as object), mileage, services, serviceDetails, parts, serviceTitle: !customTitle, ...intake }),
  };

  if (before) {
    const after = await tx.document.update({
      where: { id },
      data: { ...details, status, version: { increment: 1 } },
    });
    return { id, entity: "document", before, after };
  }

  const partyId = await validParty(tx, input.partyId, "customer");
  const car = await validVehicle(tx, input.vehicleId, partyId);
  const after = await document(tx, actor, kind, {
    ...details, partyId, vehicleId: car.id, status,
    snapshot: await snapshot(tx, partyId, car.id),
  });
  return { id: after.id, entity: "document", after };
}

const visitType = {
  OR: [{ kind: "visit" }, { kind: "job", status: { not: "cancelled" } }],
} satisfies Prisma.DocumentWhereInput;
const related = {
  party: { select: { id: true, name: true } },
  vehicle: { select: { id: true, make: true, model: true, color: true, plate: true } },
} satisfies Prisma.DocumentInclude;

export function visitById(id: string) {
  return db.document.findFirst({
    where: { id, kind: { in: ["job", "visit"] } },
    include: {
      ...related,
      related: { where: { kind: "invoice", status: "posted" }, select: { id: true }, take: 1 },
      attachments: { orderBy: { at: "asc" }, select: { id: true, name: true, mime: true } },
    },
  });
}

export function workServiceFilter(category?: string): Prisma.DocumentWhereInput {
  return isService(category) ? { OR: [
    { category }, { metadata: { path: ["services"], array_contains: [category] } },
  ] } : {};
}

export function workSearch(q: string): Prisma.DocumentWhereInput[] {
  const like = { contains: q, mode: "insensitive" as const };
  return [
    { note: like }, { vehicle: { OR: [{ make: like }, { color: like }] } },
    ...[["receivedBy"], ...serviceTypes.map((service) => ["serviceDetails", service])].map((path): Prisma.DocumentWhereInput => ({
      metadata: { path, string_contains: q, mode: "insensitive" },
    })),
  ];
}

export function visitList({ q, partyId, vehicleId, page = 0, take = 24 }:
  { q?: string; partyId?: string; vehicleId?: string; page?: number; take?: number } = {}) {
  const like = { contains: q ?? "", mode: "insensitive" as const };
  const where: Prisma.DocumentWhereInput = { ...visitType, partyId, vehicleId, AND: q ? {
    OR: [
      { title: like }, { number: like }, ...workSearch(q),
      { party: { OR: [{ name: like }, { phone: like }] } },
      { vehicle: { OR: [{ model: like }, { plate: like }] } },
    ],
  } : undefined };
  return db.document.findMany({
    where, include: related, orderBy: [{ at: "desc" }, { id: "desc" }], take, skip: page * take,
  });
}


