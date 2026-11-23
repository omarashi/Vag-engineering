import { createHash, randomUUID } from "node:crypto";
import { db, json, type Tx } from "./db";
import { part, type Input } from "./masters";
import { cents, needed, requireRule, text, units } from "./rules";
import { move } from "./stock";
import type { Actor, Change } from "./transaction";

export const supplierPriceListKey = "supplierPriceList.turky";

export type SupplierQuote = { brand: string; description: string; cost: number; partId?: string; code?: string; version?: number };
type PriceList = {
  name: string;
  currency: string | null;
  items: SupplierQuote[];
};

export async function supplierPriceList(client: Pick<Tx, "setting"> = db) {
  const record = await client.setting.findUnique({ where: { key: supplierPriceListKey } });
  return (record?.value ?? null) as PriceList | null;
}

export function supplierQuoteCode({ brand, description, code }: SupplierQuote) {
  if (code) return code;
  const digest = createHash("sha256").update(JSON.stringify([brand, description])).digest("hex");
  return "TURKY-" + digest.slice(0, 16).toUpperCase();
}

function quoteName({ brand, description }: Pick<SupplierQuote, "brand" | "description">) {
  return JSON.stringify([brand, description].map((value) => value.trim().replace(/\s+/g, " ").toLowerCase()));
}

export async function saveSupplierQuote(tx: Tx, input: Input): Promise<Change> {
  const list: PriceList = await supplierPriceList(tx) ?? { name: "Turky", currency: "EGP", items: [] };
  requireRule(list.currency === null || list.currency === "EGP", "stale", 409);
  const code = text(input.quote, 50);
  const index = code ? list.items.findIndex((item) => supplierQuoteCode(item) === code) : -1;
  const before = list.items[index];
  requireRule(!code || (before && input.quoteVersion === (before.version ?? 0)), "stale", 409);

  const brand = text(input.brand, 100);
  const description = needed(input.description);
  const cost = cents(input.cost);
  requireRule(cost > 0n, "purchasePriceRequired");
  const name = quoteName({ brand, description });
  requireRule(!list.items.some((item, position) => position !== index && quoteName(item) === name), "duplicateSupplierQuote", 409);

  const after = {
    ...before, brand, description, cost: Number(cost) / 100,
    code: before ? supplierQuoteCode(before) : "TURKY-" + randomUUID(),
    version: before ? (before.version ?? 0) + 1 : 0,
  };
  if (before) list.items[index] = after;
  else list.items.unshift(after);
  const data = { value: json({ ...list, currency: "EGP" }) };
  await tx.setting.upsert({ where: { key: supplierPriceListKey }, create: { key: supplierPriceListKey, ...data }, update: data });
  return { id: after.code, entity: "supplierQuote", before, after };
}

export function findSupplierQuote(list: PriceList | null, input: Input) {
  const code = needed(input.quote, 50);
  const quote = list?.items.find((item) => supplierQuoteCode(item) === code);
  requireRule(list?.currency === "EGP" && quote && String(input.quoteVersion ?? 0) === String(quote.version ?? 0), "stale", 409);
  return { list, quote };
}

export async function linkedSupplierPart(tx: Tx, quote: SupplierQuote) {
  const current = quote.partId ? await tx.part.findUnique({ where: { id: quote.partId } }) : null;
  requireRule(!quote.partId || (current && !current.archived), "missingPart");
  return current;
}

export async function createSupplierPart(tx: Tx, list: PriceList, quote: SupplierQuote, sellingPrice: unknown) {
  const created = await part(tx, {
    code: supplierQuoteCode(quote), name: quote.description, brand: quote.brand, cost: quote.cost, price: sellingPrice,
  });
  quote.partId = created.id;
  await tx.setting.update({ where: { key: supplierPriceListKey }, data: { value: json(list) } });
  return created;
}

export async function supplierStock(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const { list, quote } = findSupplierQuote(await supplierPriceList(tx), input);
  const current = await linkedSupplierPart(tx, quote);
  requireRule(input.quotedCost === quote.cost && input.partVersion === (current?.version ?? null), "stale", 409);
  const quantity = units(input.quantity);
  const sellingPrice = cents(input.sellingPrice);
  requireRule(sellingPrice > 0n, "sellingPriceRequired");
  const quotedCost = cents(quote.cost);
  requireRule(quotedCost > 0n, "stale", 409);

  const partId = current?.id ?? (await createSupplierPart(tx, list, quote, input.sellingPrice)).id;
  const { movement, after: stocked } = await move(tx, actor, {
    partId, kind: "adjustment", quantity, unitCost: quotedCost, reason: `Stock added from ${list.name} supplier price list`,
  });
  const after = current
    ? await tx.part.update({ where: { id: partId }, data: { cost: quotedCost, price: sellingPrice } })
    : stocked;
  return { id: partId, entity: "part", before: current, after: { part: after, movement } };
}
