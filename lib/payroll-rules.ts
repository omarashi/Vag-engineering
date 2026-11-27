import type { Document } from "@prisma/client";
import { addDays, requireRule, today } from "./rules";

const payrollLaunch = "2026-11-30";

export function defaultEmployeeStart(day = today()) {
  return day < payrollLaunch ? payrollLaunch : day;
}

export function payrollLocked(document: Pick<Document, "kind" | "metadata">) {
  return document.kind === "payroll" && (document.metadata as { locked?: boolean } | null)?.locked === true;
}

export function requirePayrollOpen(document: Pick<Document, "kind" | "metadata">) {
  requireRule(!payrollLocked(document), "payLocked", 409);
}

export function weekStarting(ending: string) {
  return addDays(ending, -5);
}

export function payrollPeriodStarting({ reference, metadata }: Pick<Document, "reference" | "metadata">) {
  return (metadata as { workweekStart?: string } | null)?.workweekStart ?? addDays(reference, -6);
}

export function payrollPayday(period: Pick<Document, "reference" | "metadata">) {
  return (period.metadata as { workweekStart?: string } | null)?.workweekStart ? period.reference : undefined;
}

export function currentWeekEnding(day = today()) {
  const weekday = absenceDate(day).getUTCDay();
  return addDays(day, (6 - weekday + 7) % 7);
}

export function absenceDate(day: string) {
  return new Date(day + "T00:00:00Z");
}

export function pendingAbsencesForWeek(employeeId: string, week: string, start = weekStarting(week)) {
  const range = { gte: absenceDate(start), lte: absenceDate(week) };
  return {
    employeeId, voidedAt: null, deductSalary: true, deductionEntryId: null,
    OR: [{ deductionFromDay: null, day: range }, { deductionFromDay: range }],
  };
}
