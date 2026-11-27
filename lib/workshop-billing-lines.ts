import { Prisma } from "@prisma/client";
import { type Tx } from "./db";
import type { LineData } from "./documents";
import { cents, extended, list, needed, record, requireRule, units } from "./rules";
import { moneyInput } from "./locale";
import { type Input } from "./masters";
import { chargeLabels, chargeTypes, workshopChargeInputs, workshopCharges, workshopImports, workshopMetadata, type ImportItem } from "./workshop-charges";
import { parseMoney } from "./decimal-input";

export function chargeInput(input: unknown) {
  const fields = record(input);
  return Object.fromEntries(chargeTypes.flatMap((type) => {
    const total = workshopChargeInputs(fields, type).reduce<bigint>((sum, raw) => {
      if (raw == null || raw === "") return sum;
      const amount = parseMoney(raw);
      requireRule(amount !== null && amount >= 0n, "invalidWorkshopCharge");
      return sum + amount;
    }, 0n);
    const formatted = moneyInput(total);
    requireRule(parseMoney(formatted) !== null, "invalidWorkshopCharge");
    return total > 0n ? [[type, formatted]] : [];
  }));
}

async function importInput(tx: Tx, input: unknown, prior: ImportItem[]) {
  const rows = list(input, 30);
  const suppliers = new Map((await tx.party.findMany({
    where: { id: { in: rows.map((item) => needed(item.supplierId)) }, kind: "supplier" },
    select: { id: true, name: true, archived: true },
  })).map((row) => [row.id, row]));
  return rows.map((item) => {
    const supplierId = needed(item.supplierId);
    const supplier = suppliers.get(supplierId);
    requireRule(supplier && (!supplier.archived || prior.some((entry) => entry.supplierId === supplierId)), "importSupplierRequired");
    const buyingPrice = parseMoney(item.buyingPrice);
    const sellingPrice = parseMoney(item.sellingPrice);
    requireRule(buyingPrice !== null && buyingPrice >= 0n && sellingPrice !== null && sellingPrice > 0n, "invalidImportPrice");
    const quantity = units(item.quantity);
    const maximum = 999_999_999_999n;
    const total = extended(quantity, sellingPrice);
    requireRule(total > 0n && total <= maximum && extended(quantity, buyingPrice) <= maximum, "invalidImportPrice");
    return { name: needed(item.name, 240), supplierId, supplierName: supplier.name, quantity: quantity.toFixed(),
      buyingPrice: moneyInput(buyingPrice), sellingPrice: moneyInput(sellingPrice) };
  });
}

export async function workshopBillingData(tx: Tx, metadata: unknown, input: Input) {
  const prior = workshopMetadata(metadata);
  const charges = input.workshopCharges === undefined ? workshopCharges(prior) : chargeInput(input.workshopCharges);
  requireRule(input.importRequested === undefined || typeof input.importRequested === "boolean", "invalid");
  const importRequested = input.importRequested === undefined ? prior.importRequested === true : input.importRequested;
  const existing = workshopImports(prior);
  const importItems = input.importItems === undefined ? existing : await importInput(tx, input.importItems, existing);
  requireRule(importRequested || importItems.length === 0, "importOptionRequired");
  return { charges, importRequested, importItems };
}

export function billingMetadata(details: Awaited<ReturnType<typeof workshopBillingData>>) {
  return { workshopCharges: details.charges, importRequested: details.importRequested, importItems: details.importItems };
}

export function hasBillingInput(input: Input) {
  return ["workshopCharges", "importRequested", "importItems"].some((key) => input[key] !== undefined);
}

export function workshopBillingLines(details: Awaited<ReturnType<typeof workshopBillingData>>, firstPosition: number): LineData[] {
  const imported: LineData[] = details.importItems.map((item, index) => {
    const quantity = units(item.quantity);
    const price = cents(item.sellingPrice);
    const buyingPrice = cents(item.buyingPrice);
    return { purpose: "importedItem", kind: "supplied", description: item.name, partId: null,
      supplierId: item.supplierId, supplierName: item.supplierName, quantity, price, discount: 0n, total: extended(quantity, price),
      buyingPrice, costTotal: extended(quantity, buyingPrice), position: firstPosition + index };
  });
  return [...imported, ...chargeTypes.flatMap((purpose, index): LineData[] => {
    const amount = parseMoney(details.charges[purpose] ?? "0");
    requireRule(amount !== null && amount >= 0n, "invalidWorkshopCharge");
    return amount > 0n ? [{ purpose, kind: "labor", description: chargeLabels[purpose],
      partId: null, quantity: new Prisma.Decimal(1), price: amount, discount: 0n, total: amount,
      position: firstPosition + imported.length + index }] : [];
  })];
}
