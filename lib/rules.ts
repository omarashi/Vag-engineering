import { Prisma } from "@prisma/client";
import { divideHalfUp, normalize, parseMoney } from "./decimal-input";

export { normalize } from "./decimal-input";

export const moneyAccountKinds = ["cash", "bank", "visa", "cardTerminal", "vodafoneCash", "instaPay"] as const;

export class RuleError extends Error {
  constructor(public code: string, public status = 422) { super(code); }
}
export function requireRule(test: unknown, code = "invalid", status = 422): asserts test {
  if (!test) throw new RuleError(code, status);
}

export function text(input: unknown, max = 4000) {
  requireRule(input == null || typeof input === "string" || typeof input === "number");
  const value = String(input ?? "").trim();
  requireRule(value.length <= max);
  return value;
}
export function needed(input: unknown, max = 180) {
  const value = text(input, max);
  requireRule(value);
  return value;
}
export function cents(input: unknown, signed = false) {
  const amount = parseMoney(input == null || input === "" ? "0" : input);
  requireRule(amount !== null && (signed || amount >= 0n));
  return amount;
}
export function units(input: unknown, signed = false) {
  const value = normalize(text(input, 16));
  requireRule(/^-?\d{1,9}(\.\d{1,3})?$/.test(value));
  const amount = new Prisma.Decimal(value);
  requireRule(signed || amount.gt(0));
  return amount;
}
function quantityRatio(quantity: Prisma.Decimal) {
  const [whole, fraction = ""] = quantity.toFixed().split(".");
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}
export function extended(quantity: Prisma.Decimal, amount: bigint) {
  const { numerator, denominator } = quantityRatio(quantity);
  return divideHalfUp(amount * numerator, denominator);
}
export function unitAmount(total: bigint, quantity: Prisma.Decimal) {
  const { numerator, denominator } = quantityRatio(quantity);
  return divideHalfUp(total * denominator, numerator);
}
export function integer(input: unknown, min: number, max: number) {
  const value = normalize(text(input, 20));
  requireRule(/^\d+$/.test(value));
  const number = Number(value);
  requireRule(number >= min && number <= max);
  return number;
}
const cairoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
const cairoClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function today(at: Date | string = new Date()) { return cairoDate.format(new Date(at)); }
export function addDays(day: string, offset: number) {
  const stamp = new Date(day + "T12:00:00Z");
  stamp.setUTCDate(stamp.getUTCDate() + offset);
  return stamp.toISOString().slice(0, 10);
}
export function date(input: unknown) {
  if (input == null || input === "") return new Date();
  const value = normalize(text(input, 16));
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00" : value;
  requireRule(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp));
  const nominal = Date.parse(stamp + ":00Z");
  requireRule(Number.isFinite(nominal));
  for (const hours of [2, 3]) {
    const candidate = new Date(nominal - hours * 3600000);
    if (today(candidate) + "T" + cairoClock.format(candidate) === stamp) return candidate;
  }
  throw new RuleError("invalidDate");
}
export function cairoDayStart(day: string) {
  try {
    return date(day + "T00:00");
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    // On the spring clock change, the first local hour starts at 01:00.
    return date(day + "T01:00");
  }
}
export function record(input: unknown) {
  requireRule(input !== null && typeof input === "object" && !Array.isArray(input));
  return input as Record<string, unknown>;
}
export function list(input: unknown, max = 100) {
  requireRule(Array.isArray(input) && input.length <= max);
  return input.map(record);
}
export function choice<T extends string>(input: unknown, choices: readonly T[]): T {
  requireRule(typeof input === "string" && (choices as readonly string[]).includes(input));
  return input as T;
}
export function amountDue(total: bigint, allocations: bigint, credits: bigint) {
  return total - allocations - credits;
}

