import { Prisma } from "@prisma/client";
import { normalize, parseMoney } from "./decimal-input";

export { normalize } from "./decimal-input";

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
  const amount = parseMoney(input || "0");
  requireRule(amount !== null && (signed || amount >= 0n));
  return amount;
}
export function units(input: unknown, signed = false) {
  const value = normalize(input);
  requireRule(/^-?\d{1,9}(\.\d{1,3})?$/.test(value));
  const amount = new Prisma.Decimal(value);
  requireRule(signed || amount.gt(0));
  return amount;
}
export function extended(quantity: Prisma.Decimal, amount: bigint) {
  return BigInt(quantity.mul(String(amount)).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed());
}
export function integer(input: unknown, min: number, max: number) {
  const value = normalize(input);
  requireRule(/^\d+$/.test(value));
  const number = Number(value);
  requireRule(number >= min && number <= max);
  return number;
}
const cairoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
const cairoClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function today(at: Date | string = new Date()) { return cairoDate.format(new Date(at)); }
export function date(input: unknown) {
  if (!input) return new Date();
  const value = normalize(input);
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

