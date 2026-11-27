import type { Role } from "@prisma/client";

export const workshopActions = [
  "customer", "vehicle", "visit", "appointment", "appointmentStatus", "job", "jobIntake", "jobUpdate",
  "vehicleNote", "jobAssignment",
  "jobStock",
] as const;
export const financeActions = [
  "supplier", "employee", "part", "stock", "supplierStock", "supplierQuote", "purchaseOrder", "purchase",
  "invoice", "visitInvoice", "visitReceipt", "customerDebtPayment", "expense", "paidExpense", "opening", "openingFinalize", "payPeriod",
  "payEntry", "payFinalize", "employeeAbsence", "weeklyPayroll", "resolvePayrollExcess", "credit", "reverseDocument", "payment", "allocate", "unallocate",
  "reversePayment", "customerRefund", "customerCreditApply", "customerCreditPayout", "reverseCustomerCredit",
] as const;
export const ownerActions = ["settings", "user", "account", "catalogue", "employeeDismiss", "payReopen"] as const;
export type Command = typeof workshopActions[number] | typeof financeActions[number] | typeof ownerActions[number];
export function can(role: Role, action: string) {
  if (action === "export") return role !== "technician";
  if ((workshopActions as readonly string[]).includes(action)) return true;
  if ((financeActions as readonly string[]).includes(action)) return role !== "technician";
  return role === "owner" && (ownerActions as readonly string[]).includes(action);
}

const workshopPages = new Set(["overview", "customers", "vehicles", "jobs", "visits", "search", "more", "record"]);
const ownerPages = new Set(["settings", "audit"]);

export function canViewPage(role: Role, route: string) {
  if (ownerPages.has(route)) return role === "owner";
  return workshopPages.has(route) || can(role, "payment");
}

export function isWorkshopRecord(kind?: string) {
  return kind === "job" || kind === "visit";
}

export function canAccessAttachment(role: Role, target: { vehicleId?: string | null; documentKind?: string }) {
  const kind = target.documentKind;
  return kind ? kind !== "quote" && (isWorkshopRecord(kind) || can(role, "payment")) : Boolean(target.vehicleId);
}

export function canRecoverRequest(role: Role, action: string) {
  if (action === "attachment:workshop") return true;
  if (action === "attachment:finance") return can(role, "payment");
  return can(role, action);
}

