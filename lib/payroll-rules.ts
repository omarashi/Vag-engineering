import type { Document } from "@prisma/client";
import { addDays, requireRule } from "./rules";

export function payrollLocked(document: Pick<Document, "kind" | "metadata">) {
  return document.kind === "payroll" && (document.metadata as { locked?: boolean } | null)?.locked === true;
}

export function requirePayrollOpen(document: Pick<Document, "kind" | "metadata">) {
  requireRule(!payrollLocked(document), "payLocked", 409);
}

export function weekStarting(ending: string) {
  return addDays(ending, -6);
}

export function absenceDate(day: string) {
  return new Date(day + "T00:00:00Z");
}

export function pendingAbsencesForWeek(employeeId: string, week: string) {
  const range = { gte: absenceDate(weekStarting(week)), lte: absenceDate(week) };
  return {
    employeeId, voidedAt: null, deductSalary: true, deductionEntryId: null,
    OR: [{ deductionFromDay: null, day: range }, { deductionFromDay: range }],
  };
}
