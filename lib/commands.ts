import { transact, type Actor } from "./transaction";
import { record, RuleError } from "./rules";
import * as masters from "./masters";
import * as workshop from "./workshop";
import { saveVisit, saveWorkshopJob } from "./visits";
import { visitInvoice, visitReceipt } from "./visit-billing";
import * as trade from "./trade";
import * as cash from "./cash";
import * as inventory from "./stock";
import { saveSupplierQuote, supplierStock } from "./supplier-price-list";
import { employeeAbsence, employeeDismiss, resolvePayrollExcess, weeklyPayroll } from "./payroll";
import type { Command } from "./permissions";
import type { Tx } from "./db";
import type { Change } from "./transaction";

const handlers: Record<Command,(tx:Tx,data:masters.Input,actor:Actor)=>Promise<Change>> = {
  customer:(tx,data)=>masters.party(tx,"customer",data),
  supplier:(tx,data)=>masters.party(tx,"supplier",data),
  vehicle:masters.vehicle,visit:saveVisit,employee:masters.employee,part:inventory.savePart,account:masters.account,catalogue:masters.catalogue,
  settings:masters.settings,user:masters.user,vehicleNote:masters.vehicleNote,
  appointment:workshop.appointment,appointmentStatus:workshop.appointmentStatus,job:workshop.job,
  jobIntake:saveWorkshopJob,jobUpdate:workshop.jobUpdate,jobAssignment:workshop.jobAssignment,
  stock:inventory.stock,jobStock:inventory.jobStock,supplierStock,supplierQuote:saveSupplierQuote,
  purchaseOrder:trade.purchaseOrder,purchase:trade.purchase,invoice:trade.invoice,credit:trade.credit,reverseDocument:trade.reverseDocument,
  payment:cash.payment,visitInvoice,visitReceipt,customerDebtPayment:cash.customerDebtPayment,allocate:cash.allocate,unallocate:cash.unallocate,reversePayment:cash.reversePayment,expense:cash.expense,
  paidExpense:cash.paidExpense,
  opening:cash.opening,openingFinalize:cash.openingFinalize,payPeriod:cash.payPeriod,
  payEntry:cash.payEntry,payFinalize:cash.payFinalize,payReopen:cash.payReopen,
  employeeAbsence,employeeDismiss,resolvePayrollExcess,weeklyPayroll,
};

export async function command(actor:Actor,action:string,key:string,input:unknown) {
  const handler=Object.hasOwn(handlers,action) ? handlers[action as Command] : null;
  if (!handler) throw new RuleError("unknownAction",404);
  const data=record(input);
  return transact(actor,action,key,data,(tx,live)=>handler(tx,data,live));
}

