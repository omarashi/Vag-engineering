import { translate, type Language } from "./locale";

const names = {
  maintenance: "Maintenance",
  tuning: "Tuning",
  diagnostics: "Diagnostics",
  repair: "Repair",
  installation: "Parts installation",
  inspection: "Inspection",
  other: "Other",
} as const;
export type ServiceType = keyof typeof names;
export const serviceTypes = Object.keys(names) as ServiceType[];

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

