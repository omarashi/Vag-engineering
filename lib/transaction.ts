import { createHash } from "node:crypto";
import type { DocumentKind, PaymentKind, Prisma } from "@prisma/client";
import { db, json, plain, type Tx } from "./db";
import { requireRule } from "./rules";
import { can } from "./permissions";
import type { currentUser } from "./auth";

export type Actor = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
type NumberedKind = Exclude<DocumentKind, "quote"> | PaymentKind;
export const prefixes: Record<NumberedKind, string> = {
  visit:"VIS", job:"JOB", appointment:"APT", purchaseOrder:"PO", purchase:"PUR", invoice:"INV",
  customerOpening:"CO", supplierOpening:"SO", credit:"CN", supplierCredit:"SC", expense:"EXP",
  payroll:"PAY", employeeOpening:"EO", advanceOpening:"AO", receipt:"RCT", supplierPayment:"SP",
  refund:"RF", supplierRefund:"SR", expensePayment:"EP", salaryPayment:"SAL", advance:"ADV",
  transfer:"TR", contribution:"CAP", withdrawal:"WD", cashOpening:"OPEN",
};

export async function number(tx: Tx, kind: NumberedKind) {
  const setting = await tx.setting.findUnique({ where: { key: "prefixes" } });
  const custom = setting?.value as Record<string, string> | undefined;
  const label = (custom?.[kind] || prefixes[kind]).toUpperCase();
  const sequence = await tx.sequence.upsert({
    where: { scope: label }, create: { scope: label, current: 1 }, update: { current: { increment: 1 } },
  });
  return label + "-" + String(sequence.current).padStart(4, "0");
}
export async function audit(tx: Tx, actorId: string, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  await tx.audit.create({ data: {
    actorId, action, entity, entityId, before: before == null ? undefined : json(before), after: after == null ? undefined : json(after),
  } });
}
export type Change = { id: string; entity?: string; before?: unknown; after?: unknown; warning?: string };

export function requestOutcome(result: Prisma.JsonValue) {
  if (result && typeof result === "object" && !Array.isArray(result) && typeof result.action === "string" && "response" in result) {
    return { action: result.action, response: result.response };
  }
  return null;
}

export function requireRequestKey(key: string) {
  requireRule(/^[a-zA-Z0-9-]{16,80}$/.test(key), "missingRequest");
}

export function lockedMutation<T>(actor: Actor, run: (tx: Tx, live: Actor) => Promise<T>) {
  return db.$transaction(async (tx) => {
    // The single branch uses a short database-wide mutation lock. Reads remain concurrent.
    await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(7362371)`;
    const live = await tx.user.findUnique({ where: { id: actor.id } });
    requireRule(live?.active, "forbidden", 403);
    return run(tx, live);
  }, { maxWait: 10000, timeout: 15000 });
}

export async function priorRequest(tx: Tx, actor: Actor, key: string, hash: string) {
  const prior = await tx.request.findUnique({ where: { key } });
  requireRule(!prior || (prior.actorId === actor.id && prior.hash === hash), "duplicateRequest", 409);
  return prior;
}

export function recordRequest(tx: Tx, actor: Actor, key: string, hash: string, action: string, response: Prisma.InputJsonValue) {
  return tx.request.create({ data: { key, actorId: actor.id, hash, result: { action, response } } });
}

export async function transact(
  actor: Actor, action: string, key: string, data: unknown, run: (tx: Tx, actor: Actor) => Promise<Change>,
) {
  requireRule(can(actor.role, action), "forbidden", 403);
  requireRequestKey(key);
  const hash = createHash("sha256").update(JSON.stringify({ action, data })).digest("hex");
  return lockedMutation(actor, async (tx, live) => {
    requireRule(can(live.role, action), "forbidden", 403);
    const prior = await priorRequest(tx, live, key, hash);
    if (prior) return requestOutcome(prior.result)?.response ?? prior.result;
    const change = await run(tx, live);
    await audit(tx, actor.id, action, change.entity ?? action, change.id, change.before, change.after);
    const result = plain({ id: change.id, warning: change.warning ?? null });
    await recordRequest(tx, live, key, hash, action, result);
    return result;
  });
}

