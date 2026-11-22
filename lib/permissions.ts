import type { Role } from "@prisma/client";

export const workshopActions = [
  "customer", "vehicle", "visit", "appointment", "appointmentStatus", "job", "jobIntake", "jobUpdate",
  "vehicleNote", "jobAssignment",
] as const;
export const financeActions = [
  "supplier", "employee", "part", "account", "catalogue", "stock", "purchaseOrder", "purchase",
  "invoice", "visitInvoice", "visitReceipt", "customerDebtPayment", "jobStock", "expense", "opening", "openingFinalize", "payPeriod",
  "payEntry", "payFinalize", "employeeAbsence", "employeeDismiss", "weeklyPayroll", "credit", "reverseDocument", "payment", "allocate", "unallocate",
  "reversePayment", "cashCount",
] as const;
export const ownerActions = ["settings", "user"] as const;
export type Command = typeof workshopActions[number] | typeof financeActions[number] | typeof ownerActions[number];
export function can(role: Role, action: string) {
  if (action === "export") return role !== "technician";
  if ((workshopActions as readonly string[]).includes(action)) return true;
  if ((financeActions as readonly string[]).includes(action)) return role !== "technician";
  return role === "owner" && (ownerActions as readonly string[]).includes(action);
}

