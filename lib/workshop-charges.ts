import { divideHalfUp, normalize, parseMoney } from "./decimal-input";

export const chargeLabels = {
  generalLabor: "General labor",
  electricalWork: "Electrical work",
  electricalLabor: "Electrical labor",
} as const;

export type ChargeType = keyof typeof chargeLabels;
export const chargeTypes = Object.keys(chargeLabels) as ChargeType[];
export const billingServiceLabels = { ...chargeLabels, importedItem: "Import" } as const;
export type BillingService = keyof typeof billingServiceLabels;
export const billingServices = Object.keys(billingServiceLabels) as BillingService[];

export type ImportInput = {
  name: string;
  supplierId: string;
  quantity: string;
  buyingPrice: string;
  sellingPrice: string;
};

export type ImportItem = ImportInput & { supplierName: string };

export function workshopMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function workshopCharges(metadata: unknown): Partial<Record<ChargeType, string>> {
  const charges = workshopMetadata(workshopMetadata(metadata).workshopCharges);
  return Object.fromEntries(chargeTypes.flatMap((type) => {
    const raw = charges[type];
    return typeof raw === "string" && (parseMoney(raw) ?? 0n) > 0n ? [[type, raw]] : [];
  }));
}

export function savedBillingSelection(metadata: unknown): BillingService[] | null {
  const selection = workshopMetadata(metadata).workshopBillingSelection;
  return Array.isArray(selection) ? billingServices.filter((service) => selection.includes(service)) : null;
}

export function billingSelection(metadata: unknown): BillingService[] {
  const charges = workshopCharges(metadata);
  return savedBillingSelection(metadata) ?? billingServices.filter((service) =>
    service === "importedItem" ? workshopMetadata(metadata).importRequested === true : charges[service] !== undefined);
}

export function workshopImports(metadata: unknown): ImportItem[] {
  const items = workshopMetadata(metadata).importItems;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is ImportItem => {
    const row = workshopMetadata(item);
    return ["name", "supplierId", "supplierName", "quantity", "buyingPrice", "sellingPrice"].every((key) => typeof row[key] === "string");
  });
}

export function isChargeType(value: string | null | undefined): value is ChargeType {
  return value != null && Object.hasOwn(chargeLabels, value);
}

export function importSellingTotal(item: ImportInput) {
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(normalize(item.quantity));
  const price = parseMoney(item.sellingPrice);
  if (!match || price === null || price <= 0n) return 0n;
  return divideHalfUp(BigInt(match[1] + (match[2] ?? "").padEnd(3, "0")) * price, 1000n);
}
