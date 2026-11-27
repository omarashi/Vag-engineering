import { translate, type Language } from "./locale";

const names = {
  installation: "Parts installation",
  maintenance: "Routine maintenance",
  diagnostics: "Diagnostics",
  tuning: "Software tuning",
  dyno: "Dyno",
  inspection: "Inspection",
  repair: "Repair",
  other: "Other work",
} as const;
export type ServiceType = keyof typeof names;
export const serviceTypes = Object.keys(names) as ServiceType[];
export const selectableServices = serviceTypes.filter((service) => service !== "repair");
const descriptiveServices: readonly ServiceType[] = ["installation", "diagnostics", "inspection", "maintenance"];

export function requiresServicePrice(service: ServiceType) {
  return !descriptiveServices.includes(service);
}

export function isService(value: unknown): value is ServiceType {
  return typeof value === "string" && Object.hasOwn(names, value);
}

export function visitServiceTypes({ category, metadata }: { category: string; metadata: unknown }): ServiceType[] {
  const saved = metadata && typeof metadata === "object" && "services" in metadata ? metadata.services : null;
  const services = Array.isArray(saved) ? saved.filter(isService) : [];
  return services.length ? services : isService(category) ? [category] : [];
}

export function serviceName(lang: Language, service: ServiceType) {
  return translate(lang, names[service]);
}

