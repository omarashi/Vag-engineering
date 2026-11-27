import { PaymentKind, type Document, type Payment } from "@prisma/client";
import { json, type Tx } from "./db";
import { document, documentDates, snapshot, validParty } from "./documents";
import { cents, choice, date, list, needed, requireRule, text, today } from "./rules";
import { allocated, due, usedCredit, protectSettledCredits } from "./trade";
import { number, type Actor, type Change } from "./transaction";
import { checkVersion, type Input } from "./masters";
import { openCustomerDebts } from "./customer-debt";
import { payrollLocked, payrollPayday, payrollPeriodStarting, pendingAbsencesForWeek, requirePayrollOpen } from "./payroll-rules";
import { accountPaymentMethods, isCustomPaymentMethod } from "./payment-options";

const destinations: Partial<Record<PaymentKind, Document["kind"][]>>={
  receipt:["invoice","customerOpening"],supplierPayment:["purchase","supplierOpening"],
  refund:["credit"],supplierRefund:["supplierCredit"],expensePayment:["expense"],
  salaryPayment:["payroll","employeeOpening"],advance:["payroll","employeeOpening"],
};
async function cashAccount(tx:Tx,input:unknown,error="invalidAccount"){
  const id=needed(input);
  const account=await tx.moneyAccount.findFirst({where:{id,archived:false},select:{id:true,kind:true}});
  requireRule(account,error);
  return account;
}
async function employeeId(tx:Tx,input:unknown){
  const id=needed(input);
  requireRule(await tx.employee.findUnique({where:{id}}),"invalidEmployee");
  return id;
}
type PreparedAllocation = { documentId:string; amount:bigint };

async function addAllocations(tx:Tx,payment:Payment,rows:PreparedAllocation[],receivedOn?:string){
  const existing=await tx.allocation.aggregate({where:{paymentId:payment.id,releasedAt:null},_sum:{amount:true}});
  let available=payment.amount-(existing._sum.amount ?? 0n)-(payment.kind==="receipt"?await usedCredit(tx,{receiptId:payment.id}):0n);
  const recorded=[];
  const balances:Record<string,string>={};
  const documentTotals=new Map<string,bigint>();
  for(const row of rows){
    const {documentId,amount}=row;
    const target=await tx.document.findUnique({where:{id:documentId}});
    requireRule(target && destinations[payment.kind]?.includes(target.kind) && target.status==="posted","invalidDocument");
    requirePayrollOpen(target);
    requireRule(target.partyId===payment.partyId && target.employeeId===payment.employeeId,"partyMismatch");
    if (payment.kind==="salaryPayment" && target.kind==="payroll" && target.category==="weekly") {
      const payday=payrollPayday(target);
      const paidOn=today(payment.at);
      requireRule(!payday || paidOn>=payday, "salaryBeforePayday");
      requireRule(!payday || paidOn<=today(), "futurePayment");
    }
    requireRule(!receivedOn || receivedOn>=today(target.at),"paymentBeforeInvoice");
    const before=await due(tx,target);
    requireRule(amount>0n && amount<=available && amount<=before,"amountMismatch");
    available-=amount;
    const allocation=await tx.allocation.create({data:{documentId,paymentId:payment.id,amount}});
    recorded.push(allocation);
    balances[allocation.id]=String(before-amount);
    documentTotals.set(documentId,target.total);
  }
  return {available,recorded,balances,total:[...documentTotals.values()].reduce((sum,value)=>sum+value,0n)};
}
function allocationInput(input:unknown):PreparedAllocation[]{
  return list(input).map((row)=>({documentId:needed(row.documentId),amount:cents(row.amount)}));
}

export async function payment(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  return postPayment(tx,input,actor);
}

export async function postPayment(tx:Tx,input:Input,actor:Actor,debt?:{allocations:PreparedAllocation[]; balance:bigint}, receiptPayout=false):Promise<Change>{
  const kind=choice(input.kind,Object.values(PaymentKind));
  const signed=kind==="cashOpening";
  const amount=cents(input.amount,signed);
  requireRule(signed ? amount!==0n : amount>0n,"amountMismatch");
  const channel=input.paymentChannel!==undefined ? input.paymentChannel : kind==="receipt" ? input.receiptDestination : undefined;
  const error=input.paymentChannel!==undefined ? "invalidPaymentChannel" : "invalidAccount";
  const combined=channel!==undefined;
  const destination=combined ? text(channel,280) : "";
  const separator=destination.lastIndexOf(":");
  requireRule(!combined || kind!=="transfer" && separator>0 && separator<destination.length-1,error);
  const requestedMethod=destination.slice(0,separator);
  const account=await cashAccount(tx,combined ? destination.slice(separator+1) : input.accountId,error);
  if(combined && !accountPaymentMethods(account.kind).includes(requestedMethod)){
    requireRule(kind!=="receipt" && isCustomPaymentMethod(requestedMethod) &&
      await tx.catalog.findFirst({where:{group:"paymentMethod",name:requestedMethod,archived:false}}),error);
  }
  const accountId=account.id;
  const at=date(input.at);
  const receivedOn=kind==="receipt"?today(at):undefined;
  requireRule(!receivedOn && kind!=="refund" || today(at)<=today(),"futurePayment");
  const invoiceId=input.invoiceId===undefined?null:needed(input.invoiceId);
  requireRule(!invoiceId || kind==="receipt" && !debt && input.allocations===undefined,"invalidDocument");
  const rows=invoiceId ? [{documentId:invoiceId,amount}] : debt?.allocations ?? allocationInput(input.allocations ?? []);
  const target=rows.length ? await tx.document.findUnique({where:{id:rows[0].documentId}}) : null;
  requireRule(!rows.length || target,"invalidDocument");
  requireRule(!invoiceId || target?.kind==="invoice","invalidDocument");
  const partyKind=kind==="receipt" || kind==="refund" ? "customer" : ["supplierPayment","supplierRefund"].includes(kind) ? "supplier" : null;
  const partyId=partyKind ? await validParty(tx,input.partyId ?? target?.partyId,partyKind) : null;
  const staff=["salaryPayment","advance"].includes(kind) ? await employeeId(tx,input.employeeId ?? target?.employeeId) : null;
  const jobId=text(input.jobId,100) || null;
  if(jobId) requireRule(kind==="receipt" && await tx.document.findFirst({where:{id:jobId,kind:"job",partyId,status:{not:"cancelled"}}}),"invalidJob");
  if(kind==="cashOpening"){
    requireRule(!await tx.setting.findUnique({where:{key:"openingFinal"}}),"openingLocked");
    requireRule(!await tx.cashMovement.findFirst({where:{accountId}}),"alreadyPosted",409);
  }
  const note=text(input.note,2000);
  if (["refund","supplierRefund","transfer","withdrawal","contribution","cashOpening"].includes(kind)) needed(note,2000);
  const method=combined ? requestedMethod : needed(input.method || (kind==="transfer" ? "transfer" : "cash"),80);
  const multiple=rows.some((row)=>row.documentId!==target?.id);
  const entry=await tx.payment.create({data:{number:await number(tx,kind),kind,at,amount,partyId,employeeId:staff,method,note,actorId:actor.id,
    snapshot:json({...await snapshot(tx,partyId,multiple ? null : target?.vehicleId,staff) as object,jobId,
      ...(kind==="receipt" && !rows.length ? {receiptTotal:String(amount)} : {})})}});
  const {available,recorded,balances,total}=await addAllocations(tx,entry,rows,kind==="refund"?today(at):receivedOn);
  requireRule(!receiptPayout || kind==="refund" && !rows.length,"invalid");
  requireRule(receiptPayout || !["refund","supplierRefund","salaryPayment","expensePayment"].includes(kind) || available===0n,"allocationRequired");
  requireRule(!["receipt","supplierPayment"].includes(kind) || available===0n || input.allowCredit===true,"allowCredit");
  const incoming=["receipt","supplierRefund","contribution","cashOpening"].includes(kind);
  const movements=[{paymentId:entry.id,accountId,amount:incoming?amount:-amount,actorId:actor.id,at}];
  if(kind==="transfer"){
    const {id:to}=await cashAccount(tx,input.toAccountId);
    requireRule(to!==accountId,"invalidAccount");
    movements.push({paymentId:entry.id,accountId:to,amount,actorId:actor.id,at});
  }
  await tx.cashMovement.createMany({data:movements});
  const after=kind==="receipt"&&recorded.length?await tx.payment.update({where:{id:entry.id},data:{snapshot:json({
    ...entry.snapshot as object, invoiceBalances:balances, receiptTotal:String(total), ...(debt ? {customerDebtAfter:String(debt.balance)} : {}),
  })}}):entry;
  return {id:after.id,after:{...after,allocations:recorded,movements}};
}

export async function customerDebtPayment(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const partyId=await validParty(tx,input.partyId,"customer");
  const amount=cents(input.amount);
  requireRule(amount>0n,"amountMismatch");
  const debts=await openCustomerDebts(tx,partyId);
  const balance=debts.reduce((sum,row)=>sum+row.balance,0n);
  requireRule(!(input.invoiceId!==undefined && input.allocations!==undefined),"invalidDocument");
  const allocations=input.invoiceId===undefined?allocationInput(input.allocations ?? []):[{documentId:needed(input.invoiceId),amount}];
  requireRule(allocations.length>0 && new Set(allocations.map(({documentId})=>documentId)).size===allocations.length,"selectDebtInvoice");
  requireRule(allocations.reduce((sum,row)=>sum+row.amount,0n)===amount && allocations.every((entry)=>entry.amount>0n),"amountMismatch");
  for(const entry of allocations){
    const selected=debts.find((row)=>row.id===entry.documentId && (input.invoiceId===undefined || row.kind==="invoice"));
    requireRule(selected && entry.amount<=selected.balance,"debtOverpayment");
  }
  return postPayment(tx,{...input,invoiceId:undefined,kind:"receipt",partyId,jobId:undefined,allowCredit:false},actor,{allocations,balance:balance-amount});
}

export async function allocate(tx:Tx,input:Input):Promise<Change>{
  const id=needed(input.id);
  const prior=await tx.payment.findFirst({where:{id,reversedAt:null,kind:{in:["receipt","supplierPayment","advance"]}},include:{allocations:true}});
  requireRule(prior,"invalidDocument");
  const rows=allocationInput(input.allocations);
  requireRule(rows.length>0,"allocationRequired");
  const result=await addAllocations(tx,prior,rows);
  return {id,entity:"payment",before:prior.allocations,after:result};
}
export async function unallocate(tx:Tx,input:Input):Promise<Change>{
  const id=needed(input.id);
  const before=await tx.allocation.findFirst({where:{id,releasedAt:null,payment:{reversedAt:null}},include:{document:true,payment:true}});
  requireRule(before && ["receipt","supplierPayment","advance"].includes(before.payment.kind),"invalidDocument");
  requirePayrollOpen(before.document);
  const after=await tx.allocation.update({where:{id},data:{releasedAt:new Date(),reason:needed(input.reason,1000)}});
  await protectSettledCredits(tx,before.documentId);
  return {id,entity:"allocation",before,after};
}
export async function reversePayment(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const id=needed(input.id);
  const before=await tx.payment.findFirst({where:{id,reversedAt:null},include:{movements:true,allocations:{include:{document:true}}}});
  requireRule(before,"invalidDocument");
  const active=before.allocations.filter((row)=>!row.releasedAt);
  for(const allocation of active) requirePayrollOpen(allocation.document);
  const reason=needed(input.reason,1000);
  const at=date(input.at);
  requireRule(at>=before.at,"invalidDate");
  if(before.kind==="receipt") requireRule(await usedCredit(tx,{receiptId:id})===0n,"refundFirst");
  const after=await tx.payment.update({where:{id},data:{reversedAt:at,reverseReason:reason}});
  await tx.customerCreditUse.updateMany({where:{payoutId:id,reversedAt:null},data:{reversedAt:at,reversedBy:actor.id,reverseReason:reason}});
  for(const allocation of active) await protectSettledCredits(tx,allocation.documentId);
  await tx.cashMovement.createMany({data:before.movements.map((row)=>({
    paymentId:id,accountId:row.accountId,amount:-row.amount,actorId:actor.id,at,reversal:true,
  }))});
  return {id,entity:"payment",before,after};
}
export async function expense(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const total=cents(input.amount);
  requireRule(total>0n,"amountMismatch");
  const after=await document(tx,actor,"expense",{...documentDates(input),status:"posted",total,
    category:needed(input.category,120),title:needed(input.title),note:text(input.note),reference:text(input.payee,200)});
  return {id:after.id,entity:"document",after};
}
export async function paidExpense(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const at=needed(input.at,10);
  requireRule(today(date(at))<=today(),"invalidDate");
  const method=input.paymentChannel===undefined ? needed(input.method,80) : undefined;
  const entry=await expense(tx,{
    at, amount:input.amount, category:input.category, title:input.category, payee:input.payee, note:input.note,
  },actor);
  const paid=await payment(tx,{
    kind:"expensePayment",at,amount:input.amount,accountId:input.accountId,method,paymentChannel:input.paymentChannel,note:input.note,
    allocations:[{documentId:entry.id,amount:input.amount}],
  },actor);
  return {...entry,after:{expense:entry.after,payment:paid.after}};
}
export async function opening(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  requireRule(!await tx.setting.findUnique({where:{key:"openingFinal"}}),"openingLocked");
  const kind=choice(input.kind,["customerOpening","supplierOpening","employeeOpening","advanceOpening"] as const);
  const total=cents(input.amount);
  requireRule(total>0n,"amountMismatch");
  const partyId=kind==="customerOpening" ? await validParty(tx,input.partyId,"customer") :
    kind==="supplierOpening" ? await validParty(tx,input.partyId,"supplier") : null;
  const staff=partyId ? null : await employeeId(tx,input.employeeId);
  const reference=needed(input.reference,120);
  requireRule(!await tx.document.findFirst({where:{kind,partyId,employeeId:staff,reference,status:"posted"}}),"duplicateReference",409);
  const after=await document(tx,actor,kind,{...documentDates(input),status:"posted",total,partyId,employeeId:staff,
    reference,note:text(input.note),snapshot:await snapshot(tx,partyId,null,staff)});
  return {id:after.id,entity:"document",after};
}
export async function openingFinalize(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  requireRule(!await tx.setting.findUnique({where:{key:"openingFinal"}}),"openingLocked");
  const at=date(needed(input.at,20));
  const [balances,stock,cash]=await Promise.all([
    tx.document.groupBy({by:["kind"],where:{kind:{in:["customerOpening","supplierOpening","employeeOpening","advanceOpening"]},status:"posted"},_sum:{total:true}}),
    tx.stockMovement.aggregate({where:{kind:"opening"},_sum:{totalCost:true}}),
    tx.payment.aggregate({where:{kind:"cashOpening",reversedAt:null},_sum:{amount:true}}),
  ]);
  const after={at,balances,stock,cash,note:needed(input.note,1000),actorId:actor.id};
  await tx.setting.create({data:{key:"openingFinal",value:json(after)}});
  return {id:"openingFinal",after};
}
export async function payPeriod(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const staff=await employeeId(tx,input.employeeId);
  const period=needed(input.period,7);
  requireRule(/^\d{4}-(0[1-9]|1[0-2])$/.test(period),"invalidDate");
  requireRule(!await tx.document.findFirst({where:{kind:"payroll",employeeId:staff,reference:period}}),"alreadyPosted",409);
  const after=await document(tx,actor,"payroll",{status:"posted",employeeId:staff,reference:period,at:date(input.at),
    note:text(input.note),metadata:{locked:false},snapshot:await snapshot(tx,null,null,staff)});
  return {id:after.id,entity:"document",after};
}
export async function payEntry(tx:Tx,input:Input,actor:Actor){
  const id=needed(input.id);
  const before=await tx.document.findFirst({where:{id,kind:"payroll",status:"posted"}});
  requireRule(before,"invalidDocument");
  requirePayrollOpen(before);
  const kind=choice(input.kind,["base","daily","commission","bonus","deduction","correction","openingRecovery"] as const);
  const note=(["deduction","daily","correction","openingRecovery"].includes(kind)) ? needed(input.note,1000) : text(input.note,1000);
  const reference=text(input.reference,120);
  let amount=cents(input.amount,kind==="correction");
  requireRule(amount!==0n,"amountMismatch");
  if(kind==="commission" && reference) requireRule(await tx.document.findFirst({where:{OR:[{id:reference},{number:reference}],kind:{in:["job","invoice"]}}}),"invalidDocument");
  if(kind==="openingRecovery"){
    const opening=await tx.document.findFirst({where:{id:reference,kind:"advanceOpening",employeeId:before.employeeId,status:"posted"}});
    requireRule(opening,"invalidDocument");
    const applied=await tx.payEntry.aggregate({where:{kind,reference},_sum:{amount:true}});
    requireRule(amount-(applied._sum.amount ?? 0n)<=opening.total,"amountMismatch");
  }
  if(kind==="deduction" || kind==="openingRecovery") amount=-amount;
  if(kind==="correction"){
    requireRule(await tx.payEntry.findFirst({where:{id:reference,documentId:id}}),"invalidDocument");
  }
  requireRule(before.total+amount>=await allocated(tx,id),"amountMismatch");
  const entry=await tx.payEntry.create({data:{documentId:id,kind,amount,note,reference,actorId:actor.id,at:input.at ? date(input.at) : undefined}});
  const after=await tx.document.update({where:{id},data:{total:{increment:amount},version:{increment:1}}});
  return {id,entity:"document",before,after:{period:after,entry}};
}
export async function payFinalize(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const id=needed(input.id);
  const before=await tx.document.findFirst({where:{id,kind:"payroll",status:"posted"}});
  requireRule(before,"invalidDocument");
  requirePayrollOpen(before);
  if(input.version!==undefined) checkVersion(before,input);
  requireRule(await due(tx,before)===0n,"payrollBalanceDue",409);
  if (before.category==="weekly" && before.employeeId) {
    requireRule(!await tx.employeeAbsence.findFirst({where:pendingAbsencesForWeek(before.employeeId,before.reference,payrollPeriodStarting(before))}),
      "absenceDeductionPending",409);
  }
  const after=await tx.document.update({where:{id},data:{version:{increment:1},metadata:json({
    ...before.metadata as object,locked:true,lockedBy:actor.id,lockedAt:new Date().toISOString(),
  })}});
  return {id,entity:"document",before,after};
}

export async function payReopen(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const id=needed(input.id);
  const reason=needed(input.reason,1000);
  const before=await tx.document.findFirst({where:{id,kind:"payroll",status:"posted"}});
  requireRule(before && payrollLocked(before),"payrollAlreadyOpen",409);
  checkVersion(before,input);
  const after=await tx.document.update({where:{id},data:{version:{increment:1},metadata:json({
    ...before.metadata as object,locked:false,reopenedBy:actor.id,reopenedAt:new Date().toISOString(),reopenReason:reason,
  })}});
  return {id,entity:"document",before,after};
}

