import { translate, type Language } from "./locale";
import { serviceName, type ServiceType, visitServiceTypes } from "./services";
import { billingSelection, billingServiceLabels } from "./workshop-charges";

export type VisitPartInput = { partId: string; quantity: string };
export type VisitPart = VisitPartInput & { name: string; code: string; unitPrice: string };
export type WorkDetail = { service: ServiceType; detail: string };
export const jobModes = ["quick", "stay"] as const;
export const intakeStatuses = ["new", "inProgress"] as const;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function workshopIntake(metadata: unknown) {
  const { jobMode, receivedBy, finishedAt, deliveryDate } = object(metadata);
  if (jobMode !== "quick" && jobMode !== "stay") return null;
  return {
    jobMode,
    receivedBy: typeof receivedBy === "string" ? receivedBy : "",
    finishedAt: typeof finishedAt === "string" ? finishedAt : "",
    deliveryDate: typeof deliveryDate === "string" ? deliveryDate : "",
  } satisfies { jobMode: typeof jobModes[number]; receivedBy: string; finishedAt: string; deliveryDate: string };
}

export function jobModeLabel(mode: typeof jobModes[number]) {
  return mode === "quick" ? "Quick job" : "Car stays at the shop";
}

export function hasServiceTitle(metadata: unknown) {
  return object(metadata).serviceTitle === true;
}

export function serviceSummary(lang: Language, services: ServiceType[]) {
  return services.map((service) => serviceName(lang, service)).join(lang === "ar" ? "، " : ", ");
}

export function visitTitle(lang: Language, row: { title: string; category: string; metadata: unknown }) {
  const title = hasServiceTitle(row.metadata) ? serviceSummary(lang, visitServiceTypes(row)) || billingSelection(row.metadata)
    .map((service) => translate(lang, billingServiceLabels[service])).join(lang === "ar" ? "، " : ", ") : row.title;
  return title || translate(lang, "Workshop visit");
}

export function visitWork(row: { category: string; metadata: unknown }): WorkDetail[] {
  const details = object(object(row.metadata).serviceDetails);
  return visitServiceTypes(row).map((service) => {
    const detail = details[service];
    return { service, detail: typeof detail === "string" ? detail : "" };
  });
}

export function isItemizedVisitInvoice(metadata: unknown) {
  return object(metadata).itemizedVisit === true;
}

export function visitParts(metadata: unknown): VisitPart[] {
  const parts = object(metadata).parts;
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((part) => {
    const { partId, quantity, name, code, unitPrice } = object(part);
    return typeof partId === "string" && typeof quantity === "string" && typeof name === "string" &&
      typeof code === "string" && typeof unitPrice === "string" ? [{ partId, quantity, name, code, unitPrice }] : [];
  });
}

