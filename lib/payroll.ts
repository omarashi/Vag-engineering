import type { Document, Employee } from "@prisma/client";
import { payEntry, payment } from "./cash";
import { db, type Tx } from "./db";
import { document, snapshot } from "./documents";
import { moneyInput } from "./locale";
import { checkVersion, type Input } from "./masters";
import { cents, choice, date, needed, requireRule, RuleError, today } from "./rules";
import { due } from "./trade";
import type { Actor, Change } from "./transaction";

const weeklyCategory = "weekly";

function addDays(day: string, offset: number) {
  const stamp = new Date(day + "T12:00:00Z");
  stamp.setUTCDate(stamp.getUTCDate() + offset);
  return stamp.toISOString().slice(0, 10);
}

export function payrollDate(value: unknown) {
  return today(date(needed(value, 10)));
}

export function currentWeekEnding(day = today()) {
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  return addDays(day, (5 - weekday + 7) % 7);
}

export function selectedWeekEnding(value?: string) {
  if (value) {
    try { return payrollDate(value); }
    catch (error) { if (!(error instanceof RuleError)) throw error; }
  }
  return currentWeekEnding();
}

export function weekStarting(ending: string) {
  return addDays(ending, -6);
}

export function employedOn(employee: Pick<Employee, "startedAt" | "endedAt" | "archived">, day: string) {
  return !employee.archived && today(employee.startedAt) <= day && (!employee.endedAt || today(employee.endedAt) >= day);
}

export function workedDuringWeek(employee: Employee, ending: string) {
  return today(employee.startedAt) <= ending &&
    (employee.endedAt ? today(employee.endedAt) >= weekStarting(ending) : !employee.archived);
}

export function absenceDate(day: string) {
  return new Date(day + "T00:00:00Z");
}

function weeklyDocuments(employeeId: string) {
  return { employeeId, kind: "payroll", category: weeklyCategory, status: "posted" } as const;
}

function weekContaining(tx: Tx, employeeId: string, day: string) {
  return tx.document.findFirst({
    where: { ...weeklyDocuments(employeeId), reference: { gte: day, lte: addDays(day, 6) } },
  });
}

export async function employeeWeekEnding(employeeId: string, day: string) {
  return (await weekContaining(db, employeeId, day))?.reference ?? currentWeekEnding(day);
}

async function nextUnpaidWeek(tx: Tx, employeeId: string, afterWeek: string) {
  const settledWeeks = [afterWeek];
  for (;;) {
    const week = addDays(settledWeeks.at(-1)!, 7);
    const period = await tx.document.findFirst({
      where: { ...weeklyDocuments(employeeId), reference: { gte: week, lte: addDays(week, 6) } },
      orderBy: { reference: "asc" },
    });
    if (!period) return { week, period: null, remaining: 0n, settledWeeks };
    const remaining = await due(tx, period);
    if (remaining > 0n) return { week: period.reference, period, remaining, settledWeeks };
    settledWeeks.push(period.reference);
  }
}

export function nextAdjustmentWeek(employeeId: string, afterWeek: string) {
  return nextUnpaidWeek(db, employeeId, afterWeek);
}

function overlappingWeek(tx: Tx, employeeId: string, week: string) {
  return tx.document.findFirst({
    where: { ...weeklyDocuments(employeeId), reference: { gte: weekStarting(week), lte: addDays(week, 6) } },
    select: { id: true },
  });
}

async function openWeeklyRecord(tx: Tx, employeeId: string, week: string, at: string, gross: bigint, actor: Actor) {
  const period = await document(tx, actor, "payroll", {
    ...weeklyDocuments(employeeId), title: "Weekly payroll", reference: week, at: date(at), metadata: { locked: false },
    snapshot: await snapshot(tx, null, null, employeeId),
  });
  const base = await payEntry(tx, { id: period.id, kind: "base", amount: moneyInput(gross), at: weekStarting(week) }, actor);
  return base.after.period;
}

export function pendingAbsencesForWeek(employeeId: string, week: string) {
  const range = { gte: absenceDate(weekStarting(week)), lte: absenceDate(week) };
  return {
    employeeId, voidedAt: null, deductSalary: true, deductionEntryId: null,
    OR: [{ deductionFromDay: null, day: range }, { deductionFromDay: range }],
  };
}

async function carryPendingAbsences(tx: Tx, employeeId: string, settledWeeks: string[], week: string) {
  await tx.employeeAbsence.updateMany({
    where: { OR: settledWeeks.map(settled => pendingAbsencesForWeek(employeeId, settled)) },
    data: { deductionFromDay: absenceDate(weekStarting(week)) },
  });
}

async function applyAbsenceDeductions(tx: Tx, employee: Employee, period: Document, remaining: bigint, actor: Actor) {
  const pending = await tx.employeeAbsence.findMany({
    where: pendingAbsencesForWeek(employee.id, period.reference),
    orderBy: { day: "asc" },
  });
  if (!pending.length || (period.metadata as { locked?: boolean }).locked) {
    return { remaining, pending: pending.length };
  }
  const [base, applied] = await Promise.all([
    tx.payEntry.aggregate({
      where: { documentId: period.id, kind: { in: ["base", "daily"] } }, _sum: { amount: true },
    }),
    tx.payEntry.aggregate({
      where: { documentId: period.id, absence: { is: { voidedAt: null } } }, _sum: { amount: true },
    }),
  ]);
  const gross = base._sum.amount ?? 0n;
  const days = BigInt(employee.paidDaysPerWeek);
  const dayPay = (gross + days / 2n) / days;
  if (gross <= 0n) return { remaining, pending: pending.length };
  let unusedGross = gross + (applied._sum.amount ?? 0n);
  let appliedCount = 0;
  for (const absence of pending) {
    const amount = unusedGross < dayPay ? unusedGross : dayPay;
    if (amount > remaining) break;
    if (amount > 0n) {
      const deduction = await payEntry(tx, {
        id: period.id, kind: "deduction", amount: moneyInput(amount), at: today(absence.day),
        note: "Absence deduction", reference: absence.id,
      }, actor);
      await tx.employeeAbsence.update({
        where: { id: absence.id }, data: { deductionEntryId: deduction.after.entry.id },
      });
      remaining -= amount;
      unusedGross -= amount;
    } else {
      await tx.employeeAbsence.update({ where: { id: absence.id }, data: { deductSalary: false } });
    }
    appliedCount++;
  }
  return { remaining, pending: pending.length - appliedCount };
}

export function weeklyRecord(employeeId: string, weekEnding: string) {
  return db.document.findFirst({
    where: { ...weeklyDocuments(employeeId), reference: weekEnding },
    include: {
      payroll: { orderBy: { at: "desc" } },
      allocations: { include: { payment: true }, orderBy: { at: "desc" } },
    },
  });
}

export async function employeeAbsence(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const employeeId = needed(input.employeeId);
  const employee = await tx.employee.findUnique({ where: { id: employeeId } });
  requireRule(employee, "invalidEmployee");
  const day = today();
  const absent = choice(input.action, ["mark", "undo"] as const) === "mark";
  const key = { employeeId, day: absenceDate(day) };
  const where = { employeeId_day: key };
  const before = await tx.employeeAbsence.findUnique({ where, include: { deductionEntry: true } });
  if (absent) {
    requireRule(employedOn(employee, day), "employeeInactive");
    if (before && !before.voidedAt) return { id: before.id, entity: "employeeAbsence", before, after: before };
    let period = await weekContaining(tx, employeeId, day);
    let week = period?.reference ?? currentWeekEnding(day);
    let remaining = period ? await due(tx, period) : 0n;
    let deductionFromDay: Date | null = null;
    if (period && remaining === 0n) {
      const next = await nextUnpaidWeek(tx, employeeId, week);
      await carryPendingAbsences(tx, employeeId, next.settledWeeks, next.week);
      ({ week, period, remaining } = next);
      deductionFromDay = absenceDate(weekStarting(week));
    }
    const entry = await tx.employeeAbsence.upsert({
      where, create: { ...key, actorId: actor.id, deductSalary: true, deductionFromDay },
      update: { actorId: actor.id, voidedAt: null, deductSalary: true, deductionEntryId: null, deductionFromDay },
    });
    if (!period && employee.weeklySalary && workedDuringWeek(employee, week) && !await overlappingWeek(tx, employeeId, week)) {
      period = await openWeeklyRecord(tx, employeeId, week, day, employee.weeklySalary, actor);
      remaining = period.total;
    }
    if (period) await applyAbsenceDeductions(tx, employee, period, remaining, actor);
    const after = await tx.employeeAbsence.findUniqueOrThrow({ where: { id: entry.id }, include: { deductionEntry: true } });
    return { id: after.id, entity: "employeeAbsence", before, after };
  }
  requireRule(before, "invalidDate");
  if (!before.voidedAt && before.deductionEntry) {
    const deduction = before.deductionEntry;
    await payEntry(tx, {
      id: deduction.documentId, kind: "correction", amount: moneyInput(-deduction.amount), at: day,
      note: "Absence undone", reference: deduction.id,
    }, actor);
  }
  const after = before.voidedAt ? before : await tx.employeeAbsence.update({
    where, data: { voidedAt: new Date() },
  });
  return { id: after.id, entity: "employeeAbsence", before, after };
}

export async function employeeDismiss(tx: Tx, input: Input): Promise<Change> {
  const id = needed(input.id);
  const before = await tx.employee.findUnique({ where: { id } });
  checkVersion(before, input);
  requireRule(before && !before.archived && !before.dismissalReason, "employeeInactive");
  const ended = payrollDate(input.endedAt);
  requireRule(ended >= today(before.startedAt) && ended <= today(), "invalidDate");
  const after = await tx.employee.update({
    where: { id }, data: {
      endedAt: date(ended), dismissalReason: needed(input.reason, 1000), archived: true, version: { increment: 1 },
    },
  });
  return { id, entity: "employee", before, after };
}

export async function weeklyPayroll(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const employeeId = needed(input.employeeId);
  const employee = await tx.employee.findUnique({ where: { id: employeeId } });
  requireRule(employee, "invalidEmployee");
  const kind = choice(input.kind, ["deduction", "advance", "salaryPayment"] as const);
  let week = payrollDate(input.weekEnding);
  const at = payrollDate(input.at);
  requireRule(at <= today() && at >= today(employee.startedAt), "invalidDate");
  if (kind === "advance") requireRule(employedOn(employee, today()), "employeeInactive");

  const where = weeklyDocuments(employeeId);
  let period = await tx.document.findFirst({ where: { ...where, reference: week } });
  if (input.periodId !== undefined) requireRule(input.periodId === (period?.id ?? ""), "stale", 409);
  if (period && input.version !== undefined) checkVersion(period, { id: period.id, version: input.version });
  let remaining = period ? await due(tx, period) : 0n;
  if (input.expectedBalance !== undefined) requireRule(input.expectedBalance === String(remaining), "stale", 409);
  if (kind !== "salaryPayment" && period && remaining === 0n) {
    const next = await nextUnpaidWeek(tx, employeeId, week);
    await carryPendingAbsences(tx, employeeId, next.settledWeeks, next.week);
    ({ week, period, remaining } = next);
  }
  if (input.targetWeek !== undefined) requireRule(input.targetWeek === week && input.targetPeriodId === (period?.id ?? ""), "stale", 409);
  if (!period) {
    requireRule(workedDuringWeek(employee, week), "employeeInactive");
    requireRule(!await overlappingWeek(tx, employeeId, week), "overlappingPayrollWeek", 409);
    const gross = employee.weeklySalary;
    requireRule(gross !== null && gross > 0n, "weeklySalaryRequired");
    if (input.expectedWeeklySalary !== undefined) requireRule(input.expectedWeeklySalary === String(gross), "stale", 409);
    period = await openWeeklyRecord(tx, employeeId, week, at, gross, actor);
    remaining = gross;
  }

  const absenceDeductions = await applyAbsenceDeductions(tx, employee, period, remaining, actor);
  requireRule(kind === "deduction" || absenceDeductions.pending === 0, "absenceDeductionPending", 409);
  if (kind === "salaryPayment" && remaining > 0n && absenceDeductions.remaining === 0n) {
    const after = await tx.document.findUniqueOrThrow({ where: { id: period.id } });
    return { id: period.id, entity: "document", before: period, after };
  }
  remaining = absenceDeductions.remaining;
  const amount = kind === "salaryPayment" ? remaining : cents(input.amount);
  requireRule(amount > 0n && amount <= remaining, "amountMismatch");
  if (kind === "deduction") {
    return payEntry(tx, { id: period.id, kind, amount: moneyInput(amount), at, note: input.note }, actor);
  }
  return payment(tx, {
    kind, employeeId, at, amount: moneyInput(amount), accountId: input.accountId, method: input.method, note: input.note,
    allocations: [{ documentId: period.id, amount: moneyInput(amount) }],
  }, actor);
}
