import { divideHalfUp, normalize, parseMoney } from "./decimal-input";
import { moneyInput } from "./locale";

export const chargeLabels = {
  generalLabor: "General labor",
  electricalWork: "Electrical work",
  electricalLabor: "Electrical labor",
} as const;

export const chargeTypes = ["generalLabor", "electricalLabor"] as const;
export type ChargeType = typeof chargeTypes[number];
export const billingServiceLabels = {
  generalLabor: chargeLabels.generalLabor,
  electricalLabor: chargeLabels.electricalLabor,
  importedItem: "Import",
} as const;
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

export function workshopChargeInputs(charges: Record<string, unknown>, type: ChargeType) {
  return type === "electricalLabor" ? [charges.electricalLabor, charges.electricalWork] : [charges[type]];
}

export function storedWorkshopCharge(metadata: unknown, type: ChargeType) {
  const charges = workshopMetadata(workshopMetadata(metadata).workshopCharges);
  return workshopChargeInputs(charges, type).reduce<bigint>((sum, raw) => {
    const amount = typeof raw === "string" ? parseMoney(raw) ?? 0n : 0n;
    return amount > 0n ? sum + amount : sum;
  }, 0n);
}

export function workshopCharges(metadata: unknown): Partial<Record<ChargeType, string>> {
  return Object.fromEntries(chargeTypes.flatMap((type) => {
    const total = storedWorkshopCharge(metadata, type);
    return total > 0n ? [[type, moneyInput(total)]] : [];
  }));
}

export function normalizeBillingService(value: unknown) {
  return value === "electricalWork" ? "electricalLabor" : value;
}

export function savedBillingSelection(metadata: unknown): BillingService[] | null {
  const selection = workshopMetadata(metadata).workshopBillingSelection;
  if (!Array.isArray(selection)) return null;
  const normalized = selection.map(normalizeBillingService);
  return billingServices.filter((service) => normalized.includes(service));
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

export function isChargeType(value: string | null | undefined): value is keyof typeof chargeLabels {
  return value != null && Object.hasOwn(chargeLabels, value);
}

export function importSellingTotal(item: ImportInput) {
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(normalize(item.quantity));
  const price = parseMoney(item.sellingPrice);
  if (!match || price === null || price <= 0n) return 0n;
  return divideHalfUp(BigInt(match[1] + (match[2] ?? "").padEnd(3, "0")) * price, 1000n);
}
