import type { Document, Employee } from "@prisma/client";
import { allocate, payEntry, payment } from "./cash";
import { db, type Tx } from "./db";
import { document, snapshot } from "./documents";
import { moneyInput } from "./locale";
import { checkVersion, type Input } from "./masters";
import { addDays, cairoDayStart, cents, choice, date, needed, requireRule, RuleError, text, today } from "./rules";
import { divideHalfUp } from "./decimal-input";
import { due } from "./trade";
import type { Actor, Change } from "./transaction";
import { absenceDate, currentWeekEnding, payrollPayday, payrollPeriodStarting, pendingAbsencesForWeek, requirePayrollOpen, weekStarting } from "./payroll-rules";

export { absenceDate, pendingAbsencesForWeek, weekStarting } from "./payroll-rules";

const weeklyCategory = "weekly";

export function payrollDate(value: unknown) {
  return today(date(needed(value, 10)));
}

export function selectedWeekEnding(value?: string) {
  if (value) {
    try { return payrollDate(value); }
    catch (error) { if (!(error instanceof RuleError)) throw error; }
  }
  return currentWeekEnding();
}

export function workWeekStarting(day: string) {
  return addDays(day, -((new Date(absenceDate(day)).getUTCDay() + 6) % 7));
}

export function employedOn(employee: Pick<Employee, "startedAt" | "endedAt" | "archived">, day: string) {
  return !employee.archived && today(employee.startedAt) <= day && (!employee.endedAt || today(employee.endedAt) >= day);
}

export function workedDuringWeek(employee: Employee, ending: string) {
  return today(employee.startedAt) <= ending &&
    (employee.endedAt ? today(employee.endedAt) >= weekStarting(ending) : !employee.archived);
}

function weeklyDocuments(employeeId: string) {
  return { employeeId, kind: "payroll", category: weeklyCategory, status: "posted" } as const;
}

async function weekContaining(tx: Tx, employeeId: string, day: string) {
  const periods = await tx.document.findMany({
    where: { ...weeklyDocuments(employeeId), reference: { gte: day, lte: addDays(day, 6) } },
    orderBy: { reference: "asc" },
  });
  return periods.find((period) => payrollPeriodStarting(period) <= day);
}

export async function employeeWeekEnding(employeeId: string, day: string) {
  return (await weekContaining(db, employeeId, day))?.reference ?? currentWeekEnding(day);
}

function overlappingWeek(tx: Tx, employeeId: string, week: string) {
  return tx.document.findFirst({
    where: { ...weeklyDocuments(employeeId), reference: { gte: weekStarting(week), lte: addDays(week, 6) } },
    select: { id: true },
  });
}

async function openWeeklyRecord(tx: Tx, employeeId: string, week: string, at: string, gross: bigint, actor: Actor) {
  const workweekStart = weekStarting(week);
  const period = await document(tx, actor, "payroll", {
    ...weeklyDocuments(employeeId), title: "Weekly payroll", reference: week, at: date(at), metadata: { locked: false, workweekStart },
    snapshot: await snapshot(tx, null, null, employeeId),
  });
  const base = await payEntry(tx, { id: period.id, kind: "base", amount: moneyInput(gross), at: workweekStart }, actor);
  return base.after.period;
}

async function applyAbsenceDeductions(tx: Tx, employee: Employee, period: Document, remaining: bigint, actor: Actor) {
  requirePayrollOpen(period);
  const pending = await tx.employeeAbsence.findMany({
    where: pendingAbsencesForWeek(employee.id, period.reference, payrollPeriodStarting(period)),
    orderBy: { day: "asc" },
  });
  if (!pending.length) return { remaining, pending: 0 };
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
  if (gross <= 0n) return { remaining, pending: pending.length };
  let unusedGross = gross + (applied._sum.amount ?? 0n);
  for (const absence of pending) {
    const dayPay = divideHalfUp(gross, absence.halfDay ? days * 2n : days);
    const owed = unusedGross < dayPay ? unusedGross : dayPay;
    const amount = remaining < owed ? remaining : owed;
    const note = absence.halfDay ? "Half-day deduction" : "Absence deduction";
    const at = today(absence.day);
    if (amount > 0n) {
      const deduction = await payEntry(tx, {
        id: period.id, kind: "deduction", amount: moneyInput(amount), at, note, reference: absence.id,
      }, actor);
      await tx.employeeAbsence.update({
        where: { id: absence.id }, data: { deductionEntryId: deduction.after.entry.id },
      });
      remaining -= amount;
      unusedGross -= amount;
    } else {
      await tx.employeeAbsence.update({ where: { id: absence.id }, data: { deductSalary: false } });
    }
    if (owed > amount) await tx.payrollExcess.create({
      data: { documentId: period.id, absenceId: absence.id, remaining: owed - amount, note, at: date(at) },
    });
  }
  return { remaining, pending: 0 };
}

const weeklyDetails = {
  payroll: { orderBy: { at: "desc" } },
  allocations: { include: { payment: true }, orderBy: { at: "desc" } },
} as const;

export function weeklyRecord(employeeId: string, weekEnding: string) {
  return db.document.findFirst({
    where: { ...weeklyDocuments(employeeId), reference: weekEnding },
    include: weeklyDetails,
  });
}

export function payrollSummary(employee: Pick<Employee, "weeklySalary">, period: Awaited<ReturnType<typeof weeklyRecord>>) {
  const allocations = period?.allocations.filter(row=>!row.releasedAt && !row.payment.reversedAt) ?? [];
  const advances = allocations.filter(row=>row.payment.kind==="advance");
  const totalAdvances = advances.reduce((sum,row)=>sum+row.amount,0n);
  const carried = period ? advances.filter(row=>today(row.payment.at)<payrollPeriodStarting(period)).reduce((sum,row)=>sum+row.amount,0n) : 0n;
  const paid = allocations.filter(row=>row.payment.kind==="salaryPayment").reduce((sum,row)=>sum+row.amount,0n);
  const deductionIds = new Set(period?.payroll.filter(row=>row.kind==="deduction" || row.kind==="openingRecovery").map(row=>row.id));
  const deductions = -(period?.payroll.filter(row=>deductionIds.has(row.id) || row.kind==="correction" && deductionIds.has(row.reference))
    .reduce((sum,row)=>sum+row.amount,0n) ?? 0n);
  const gross = period ? period.payroll.filter(row=>row.kind==="base"||row.kind==="daily").reduce((sum,row)=>sum+row.amount,0n) : employee.weeklySalary;
  const net = (period?.total ?? gross ?? 0n) - totalAdvances;
  return { gross, advances:totalAdvances, carried, deductions, net, paid, remaining:net-paid };
}

export function payrollWeek(start: string, staff?: string, search?: string) {
  const end = currentWeekEnding(start);
  const from = cairoDayStart(start);
  const to = cairoDayStart(addDays(end,1));
  return db.employee.findMany({
    where:{
      id:staff||undefined, name:search?{contains:search,mode:"insensitive"}:undefined,
      startedAt:{lt:to},OR:[{archived:false,endedAt:null},{endedAt:{gte:from}}],
    },
    include:{
      documents:{
        where:{kind:"payroll",status:"posted",category:weeklyCategory,reference:{gte:start,lte:addDays(end,1)}},
        orderBy:{reference:"desc"},take:1,include:weeklyDetails,
      },
      absences:{
        where:{day:{gte:absenceDate(start),lte:absenceDate(end)},voidedAt:null},
        include:{deductionEntry:{select:{amount:true,document:{select:{reference:true}}}},
          excesses:{where:{voidedAt:null},select:{document:{select:{reference:true}}},take:1}},
      },
      payments:{
        where:{kind:"advance",at:{gte:from,lt:to},reversedAt:null},
        include:{allocations:{where:{releasedAt:null,document:{category:weeklyCategory}},include:{document:{select:{reference:true}}}}},
        orderBy:{at:"asc"},
      },
    },
    orderBy:{name:"asc"},
  });
}

export async function employeeAbsence(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const employeeId = needed(input.employeeId);
  const employee = await tx.employee.findUnique({ where: { id: employeeId } });
  requireRule(employee, "invalidEmployee");
  const day = input.day === undefined ? today() : payrollDate(input.day);
  requireRule(day <= today(), "invalidDate");
  const action = choice(input.action, ["mark", "halfDay", "undo"] as const);
  const halfDay = action === "halfDay";
  const key = { employeeId, day: absenceDate(day) };
  const where = { employeeId_day: key };
  const before = await tx.employeeAbsence.findUnique({ where, include: { deductionEntry: true } });
  if (action !== "undo") {
    requireRule(employedOn(employee, day), "employeeInactive");
    requireRule(key.day.getUTCDay() !== 0, "attendanceDayOff");
  } else requireRule(before, "invalidDate");
  if (before && !before.voidedAt) {
    if (action !== "undo" && before.halfDay === halfDay) return { id: before.id, entity: "employeeAbsence", before, after: before };
    const excesses = await tx.payrollExcess.findMany({ where: { absenceId: before.id, voidedAt: null }, select: { id: true } });
    const recovered = excesses.length ? await tx.payEntry.findMany({
      where: { kind: "deduction", reference: { in: excesses.map(({ id }) => id) } },
    }) : [];
    for (const deduction of [...(before.deductionEntry ? [before.deductionEntry] : []), ...recovered]) {
      await payEntry(tx, {
        id: deduction.documentId, kind: "correction", amount: moneyInput(-deduction.amount), at: today(),
        note: "Attendance corrected", reference: deduction.id,
      }, actor);
    }
    if (excesses.length) await tx.payrollExcess.updateMany({
      where: { id: { in: excesses.map(({ id }) => id) } }, data: { voidedAt: new Date() },
    });
  }
  if (action !== "undo") {
    let period = await weekContaining(tx, employeeId, day);
    const week = period?.reference ?? currentWeekEnding(day);
    let remaining = period ? await due(tx, period) : 0n;
    const deductionFromDay: Date | null = null;
    const entry = await tx.employeeAbsence.upsert({
      where, create: { ...key, actorId: actor.id, halfDay, deductSalary: true, deductionFromDay },
      update: { actorId: actor.id, halfDay, voidedAt: null, deductSalary: true, deductionEntryId: null, deductionFromDay },
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
  const week = payrollDate(input.weekEnding);
  const at = payrollDate(input.at);
  requireRule(at <= today() && at >= today(employee.startedAt), "invalidDate");
  if (kind === "advance") requireRule(employedOn(employee, today()), "employeeInactive");

  const where = weeklyDocuments(employeeId);
  let period = await tx.document.findFirst({ where: { ...where, reference: week } });
  if (input.periodId !== undefined) requireRule(input.periodId === (period?.id ?? ""), "stale", 409);
  if (period && input.version !== undefined) checkVersion(period, { id: period.id, version: input.version });
  let remaining = period ? await due(tx, period) : 0n;
  if (input.expectedBalance !== undefined) requireRule(input.expectedBalance === String(remaining), "stale", 409);
  if (input.targetWeek !== undefined) requireRule(input.targetWeek === week && input.targetPeriodId === (period?.id ?? ""), "stale", 409);
  if (!period) requireRule(week === currentWeekEnding(week), "payrollWeekSaturday");
  const payday = period ? payrollPayday(period) : week;
  if (kind === "salaryPayment" && payday) requireRule(at >= payday, "salaryBeforePayday");
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
  requireRule(amount > 0n, "amountMismatch");
  if (kind === "advance") {
    requireRule(remaining > 0n, "advanceWeekPaid");
    requireRule(employee.weeklySalary !== null && amount <= employee.weeklySalary, "advanceLimit");
    requireRule(amount <= remaining, "advanceLimit");
  }
  const applied = amount <= remaining ? amount : remaining;
  const excess = amount - applied;
  if (kind === "deduction") {
    const note = needed(input.note,1000);
    const deduction = applied > 0n ? await payEntry(tx, { id: period.id, kind, amount: moneyInput(applied), at, note }, actor) : null;
    if (!excess && deduction) return deduction;
    const review = await tx.payrollExcess.create({ data: { documentId:period.id, remaining:excess, at:date(at), note } });
    return { id:period.id, entity:"document", before:period, after:{ deduction:deduction?.after, review }, warning:"payrollExcessReview" };
  }
  const cash = await payment(tx, {
    kind, employeeId, at, amount: moneyInput(amount), accountId: input.accountId, method: input.method,
    paymentChannel: input.paymentChannel, note: input.note,
    allocations: applied > 0n ? [{ documentId: period.id, amount: moneyInput(applied) }] : [],
  }, actor);
  if (!excess) return cash;
  const review = await tx.payrollExcess.create({
    data: { documentId:period.id, paymentId:cash.id, remaining:excess, at:date(at), note:text(input.note,2000) },
  });
  return { ...cash, after:{ payment:cash.after, review }, warning:"payrollExcessReview" };
}

const excessPayment = { include: { allocations: { where: { releasedAt: null } } } } as const;

export function excessBalance(review: {
  remaining: bigint;
  payment: { amount: bigint; reversedAt: Date | null; allocations: { amount: bigint }[] } | null;
}) {
  if (!review.payment) return review.remaining;
  if (review.payment.reversedAt) return 0n;
  const unallocated = review.payment.amount - review.payment.allocations.reduce((sum, row) => sum + row.amount, 0n);
  return unallocated < review.remaining ? unallocated : review.remaining;
}

export async function payrollReviews(employeeId?: string) {
  const reviews = await db.payrollExcess.findMany({
    where:{voidedAt:null,remaining:{gt:0},document:{employeeId,status:"posted"}},
    include:{document:{select:{id:true,reference:true,employee:true}},payment:excessPayment,absence:{select:{halfDay:true}}},
    orderBy:{at:"asc"},
  });
  return reviews.flatMap((review) => {
    const balance = excessBalance(review);
    return balance > 0n ? [{...review,balance}] : [];
  });
}

export async function resolvePayrollExcess(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const id = needed(input.id);
  const resolution = choice(input.resolution, ["apply", "waive"] as const);
  const reason = needed(input.reason,1000);
  const review = await tx.payrollExcess.findUnique({
    where:{id},include:{document:{include:{employee:true}},payment:excessPayment},
  });
  requireRule(review && !review.voidedAt && review.document.status==="posted" && review.document.employee, "invalidDocument");
  const balance = excessBalance(review);
  requireRule(balance > 0n, "amountMismatch");
  const employee = review.document.employee;
  requireRule(input.expectedBalance === String(balance), "stale", 409);
  if (resolution === "waive") {
    const after = await tx.payrollExcess.update({where:{id},data:{remaining:0}});
    return {id,before:{balance,review},after:{balance:0n,review:after,reason}};
  }
  const period = review.document;
  requirePayrollOpen(period);
  const at = today();
  const pending = await applyAbsenceDeductions(tx,employee,period,await due(tx,period),actor);
  requireRule(pending.pending === 0, "absenceDeductionPending",409);
  requireRule(pending.remaining > 0n, "excessWeekPaid");
  const amount = balance < pending.remaining ? balance : pending.remaining;
  const applied = review.paymentId
    ? await allocate(tx,{id:review.paymentId,allocations:[{documentId:period.id,amount:moneyInput(amount)}]})
    : await payEntry(tx,{id:period.id,kind:"deduction",at,amount:moneyInput(amount),note:reason,reference:id},actor);
  const after = review.paymentId ? review : await tx.payrollExcess.update({where:{id},data:{remaining:{decrement:amount}}});
  const revisedBalance = review.payment
    ? excessBalance({...review,payment:{...review.payment,allocations:[...review.payment.allocations,{amount}]}})
    : after.remaining;
  return {id,before:{balance,review},after:{balance:revisedBalance,review:after,reason,applied:applied.after}};
}
