const digits = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";

export function normalize(input: unknown) {
  return String(input ?? "").trim().replace(/[٠-٩۰-۹]/g, (digit) => String(digits.indexOf(digit) % 10))
    .replace(/٫/g, ".").replace(/٬/g, "");
}

export function parseMoney(input: unknown): bigint | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const match = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(normalize(input));
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign ? -amount : amount;
}

export function divideHalfUp(numerator: bigint, denominator: bigint) {
  const sign = numerator < 0n ? -1n : 1n;
  return sign * ((sign * numerator + denominator / 2n) / denominator);
}
