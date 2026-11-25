import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { postAction, signIn } from "./support/http.mjs";

const base = process.env.TEST_URL;
if (!base || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw Error("Use an isolated test instance and database.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID().slice(0,8);
const monday = "2025-11-24";
const tuesday = "2025-11-25";
const wednesday = "2025-11-26";
const friday = "2025-11-28";
async function post(session, name, data, key, status = 200) {
  const response = await postAction(base, session, name, data, key);
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
async function page(session, path, status = 200) {
  const response = await fetch(base+path,{headers:{Cookie:session},redirect:"manual"});
  assert.equal(response.status,status,path);
  return response.text();
}

try {
  const [owner, accountant, technician] = await Promise.all(
    ["owner","accountant","technician"].map(role=>signIn(base,role+"@vag-demo.test")),
  );
  const {id:accountId} = await post(owner,"account",{name:"Cashbook "+suffix,kind:"cash",code:"C-"+suffix});
  const {id:visaId} = await post(owner,"account",{name:"Visa QA "+suffix,kind:"bank"});
  const terminal = await db.moneyAccount.findUniqueOrThrow({where:{code:"M1"}});
  assert.equal(terminal.kind,"cardTerminal");
  assert.ok(await db.moneyAccount.findUnique({where:{code:"M2"}}));
  await post(accountant,"payment",{kind:"cashOpening",at:monday,accountId,amount:"1000",note:"Cashbook QA opening"});
  const paid = {at:tuesday,accountId,method:"vodafoneCash",amount:"50",category:"Supplies",payee:"Expense QA "+suffix};
  await post(technician,"paidExpense",paid,undefined,403);
  const expenseKey = randomUUID();
  const {id:expenseId} = await post(accountant,"paidExpense",paid,expenseKey);
  assert.equal((await post(accountant,"paidExpense",paid,expenseKey)).id,expenseId);
  const expense = await db.document.findUniqueOrThrow({where:{id:expenseId},include:{allocations:{include:{payment:true}}}});
  assert.equal(expense.allocations.length,1);
  assert.equal(expense.allocations[0].payment.method,"vodafoneCash");
  const {id:expensePayment} = expense.allocations[0].payment;
  const {id:partyId} = await post(owner,"customer",{name:"Card QA "+suffix});
  const cardReceipt={kind:"receipt",partyId,at:tuesday,amount:"200",allowCredit:true};
  assert.equal((await post(accountant,"payment",{...cardReceipt,receiptDestination:"cash:"+terminal.id},undefined,422)).error,"invalidAccount");
  const {id:cardReceiptId}=await post(accountant,"payment",{...cardReceipt,receiptDestination:"card:"+terminal.id});
  const recordedCard=await db.payment.findUniqueOrThrow({where:{id:cardReceiptId},include:{movements:true}});
  assert.equal(recordedCard.method,"card");
  assert.equal(recordedCard.movements[0].accountId,terminal.id);
  const {id:transfer} = await post(accountant,"payment",{
    kind:"transfer",accountId:terminal.id,toAccountId:visaId,at:tuesday,amount:"200",note:"M1 settlement "+suffix,
  });
  const legs = await db.cashMovement.findMany({where:{paymentId:transfer},orderBy:{amount:"asc"}});
  assert.deepEqual(legs.map(row=>[row.accountId,row.amount]),[[terminal.id,-20000n],[visaId,20000n]]);
  await post(accountant,"reversePayment",{id:expensePayment,at:wednesday,reason:"Cashbook QA correction"});
  const previous = await page(accountant,"/cash?date="+tuesday+"&account="+accountId);
  assert.match(previous,/Daily cashbook/);
  assert.match(previous,/950\.00/);
  assert.doesNotMatch(previous,/Payment reversal/);
  const following = await page(accountant,"/cash?date="+wednesday+"&account="+accountId);
  assert.match(following,/Payment reversal/);
  assert.match(following,/1,000\.00/);
  assert.match(await page(accountant+"; vag-lang=ar","/cash?date="+tuesday),/إجمالي المركز/);
  assert.match(await page(accountant+"; vag-lang=ar","/cash?date="+wednesday),/عكس الدفعة/);
  assert.match(await page(accountant,"/api/export?report=payments&from="+tuesday+"&to="+tuesday),/"Payment method","Accounts"/);
  await page(technician,"/api/export?report=payments",403);
  assert.ok(await db.audit.findFirst({where:{action:"export",entity:"report",entityId:"payments"}}));
  const expenseFilters="&from="+tuesday+"&to="+tuesday+"&category=Supplies";
  assert.match(await page(accountant,"/reports?report=expenses"+expenseFilters),new RegExp(expense.number));
  assert.match(await page(accountant,"/api/export?report=expenses"+expenseFilters),new RegExp(expense.number));
  assert.doesNotMatch(await page(accountant,"/api/export?report=expenses&from="+wednesday+"&to="+wednesday),new RegExp(expense.number));
  await post(accountant,"expense",{title:null,category:"Test",amount:"10"},undefined,422);
  await post(accountant,"expense",{title:"x".repeat(181),category:"Test",amount:"10"},undefined,422);
  await page(technician,"/cash",404);

  const {id:employeeId} = await post(owner,"employee",{name:"Payroll QA "+suffix,startedAt:"2025-11-01",weeklySalary:"3000"});
  const half = {employeeId,day:monday,action:"halfDay"};
  await post(technician,"employeeAbsence",half,undefined,403);
  await post(accountant,"employeeAbsence",half);
  await post(accountant,"employeeAbsence",{employeeId,day:tuesday,action:"mark"});
  const absences = await db.employeeAbsence.findMany({where:{employeeId},orderBy:{day:"asc"},include:{deductionEntry:true}});
  assert.deepEqual(absences.map(row=>[row.halfDay,row.deductionEntry.amount]),[[true,-25000n],[false,-50000n]]);
  await post(accountant,"employeeAbsence",{employeeId,day:"2025-11-23",action:"mark"},undefined,422);
  const advance = {employeeId,kind:"advance",weekEnding:friday,at:tuesday,accountId,method:"instaPay",amount:"2700"};
  const {id:advanceId,warning} = await post(accountant,"weeklyPayroll",advance);
  assert.equal(warning,"payrollExcessReview");
  const excess = await db.payrollExcess.findUniqueOrThrow({where:{paymentId:advanceId}});
  assert.equal(excess.remaining,45000n);
  assert.equal(await db.cashMovement.count({where:{paymentId:advanceId,amount:-270000n}}),1);
  const sheet = await page(accountant,"/payroll?week="+monday);
  assert.match(sheet,/Weekly payroll sheet/);
  assert.match(sheet,/Half-day deduction/);
  assert.match(sheet,/Payroll needs review/);
  assert.match(await page(accountant+"; vag-lang=ar","/payroll?week="+monday),/خصم نص يوم/);
  await page(technician,"/payroll?week="+monday,404);
  const origin = await db.document.findUniqueOrThrow({where:{id:excess.documentId}});
  await post(accountant,"payFinalize",{id:origin.id,version:origin.version});
  const priorAllocation = await db.allocation.findFirstOrThrow({where:{paymentId:advanceId,documentId:origin.id}});
  await post(accountant,"unallocate",{id:priorAllocation.id,reason:"Move advance"},undefined,409);
  await post(accountant,"reversePayment",{id:advanceId,at:wednesday,reason:"Correct advance"},undefined,409);
  await post(accountant,"allocate",{id:advanceId,allocations:[{documentId:origin.id,amount:"10"}]},undefined,409);
  await post(accountant,"payEntry",{id:origin.id,kind:"correction",amount:"10",reason:"Lock check",
    note:"Lock check",reference:absences[0].deductionEntryId},undefined,409);

  const recovery = {id:excess.id,expectedBalance:"45000",reason:"Approved same-week adjustment",resolution:"apply"};
  await post(technician,"resolvePayrollExcess",recovery,undefined,403);
  assert.equal((await post(accountant,"resolvePayrollExcess",recovery,undefined,409)).error,"payLocked");
  assert.equal(await db.allocation.count({where:{paymentId:advanceId,documentId:origin.id}}),1);
  const finalizedOrigin = await db.document.findUniqueOrThrow({where:{id:origin.id}});
  const reopen = {id:origin.id,version:finalizedOrigin.version,reason:"Correct legacy closing"};
  await post(accountant,"payReopen",reopen,undefined,403);
  await post(owner,"payReopen",reopen);
  const rejectedRecovery = await post(accountant,"resolvePayrollExcess",recovery,undefined,422);
  assert.equal(rejectedRecovery.error,"excessWeekPaid");
  assert.equal(await db.document.count({where:{employeeId,kind:"payroll",reference:"2025-12-05"}}),0);
  await post(accountant,"payFinalize",{id:origin.id});
  assert.ok(await db.audit.findFirst({where:{action:"payReopen",entityId:origin.id}}));

  const {id:applyEmployee}=await post(owner,"employee",{name:"Apply QA "+suffix,startedAt:"2025-11-01",weeklySalary:"3000"});
  const applyAdvance = {employeeId:applyEmployee,kind:"advance",weekEnding:friday,at:tuesday,accountId,method:"instaPay",amount:"3100"};
  const {id:applyAdvanceId}=await post(accountant,"weeklyPayroll",applyAdvance);
  const applyReview=await db.payrollExcess.findUniqueOrThrow({where:{paymentId:applyAdvanceId}});
  const applyAllocation=await db.allocation.findFirstOrThrow({where:{paymentId:applyAdvanceId,documentId:applyReview.documentId}});
  await post(accountant,"unallocate",{id:applyAllocation.id,reason:"Make room in the same week"});
  const applyKey=randomUUID();
  await post(accountant,"resolvePayrollExcess",{id:applyReview.id,expectedBalance:"10000",reason:"Apply same week",resolution:"apply"},applyKey);
  await post(accountant,"resolvePayrollExcess",{id:applyReview.id,expectedBalance:"10000",reason:"Apply same week",resolution:"apply"},applyKey);
  assert.equal(await db.allocation.count({where:{paymentId:applyAdvanceId,documentId:applyReview.documentId,amount:10000n}}),1);
  assert.equal(await db.cashMovement.count({where:{paymentId:applyAdvanceId}}),1);

  const {id:waiveEmployee}=await post(owner,"employee",{name:"Waiver QA "+suffix,startedAt:"2025-11-01",weeklySalary:"3000"});
  const {id:waivePeriod}=await post(accountant,"weeklyPayroll",{employeeId:waiveEmployee,weekEnding:friday,kind:"deduction",at:tuesday,amount:"3100",note:"Waiver fixture"});
  const waived=await db.payrollExcess.findFirstOrThrow({where:{documentId:waivePeriod}});
  const waive={id:waived.id,expectedBalance:"10000",reason:"Waived by accountant",resolution:"waive"};
  const waiveKey=randomUUID();
  await post(accountant,"resolvePayrollExcess",waive,waiveKey);
  await post(accountant,"resolvePayrollExcess",waive,waiveKey);
  assert.equal((await db.payrollExcess.findUniqueOrThrow({where:{id:waived.id}})).remaining,0n);
  assert.doesNotMatch(await page(accountant,"/payroll/"+waiveEmployee),/Payroll needs review/);

  const {id:partId} = await post(owner,"part",{name:"Inventory QA "+suffix,code:"INV-"+suffix,cost:"100",price:"150",category:"Reconciliation"});
  await post(owner,"stock",{partId,kind:"adjustment",quantity:"10",reason:"Inventory valuation QA"});
  const {id:otherPart}=await post(owner,"part",{name:"Other valuation fixture",code:"OTHER-"+suffix,cost:"200",price:"300"});
  await post(owner,"stock",{partId:otherPart,kind:"adjustment",quantity:"1",reason:"Warehouse total fixture"});
  const {id:vehicleId} = await post(owner,"vehicle",{partyId,make:"VW",model:"Golf"});
  const {id:reserveJobId} = await post(technician,"job",{partyId,vehicleId,title:"Reserve QA "+suffix});
  await post(technician,"jobStock",{jobId:reserveJobId,partId,kind:"reserve",quantity:"2"});
  const inventory = await page(accountant,"/inventory?q="+suffix+"&category=Reconciliation&status=active");
  assert.match(inventory,/Total selling value/);
  assert.match(inventory,/1,000\.00/);
  assert.match(inventory,/1,500\.00/);
  assert.match(inventory,/All stock values[\s\S]*1,200\.00[\s\S]*Filtered stock values[\s\S]*1,000\.00/);
  const laterPage=await page(accountant,"/inventory?page=2&q="+suffix+"&category=Reconciliation");
  assert.match(laterPage,/Filtered stock values[\s\S]*1,000\.00/);
  assert.match(await page(accountant,"/inventory?page=2&q=nomatch"),/All stock values/);
  await db.part.createMany({data:Array.from({length:101},(_,index)=>({
    code:"BULK-"+suffix+"-"+index,name:"Bulk valuation fixture",category:"Bulk valuation",onHand:"0.5",cost:201n,price:301n,
  }))});
  const filteredPage=await page(accountant,"/inventory?category=Bulk+valuation&page=1");
  assert.match(filteredPage,/Filtered stock values[\s\S]*102\.01[\s\S]*152\.51/);

  const intake = {partyId,vehicleId,services:["installation"],at:monday};
  const {id:jobId} = await post(technician,"visit",intake);
  await db.document.update({where:{id:jobId},data:{category:"repair",metadata:{services:["repair"],serviceTitle:true}}});
  assert.match(await page(technician,"/jobs/"+jobId),/Repair/);
  await post(technician,"visit",{...intake,id:jobId,version:0,services:["repair"]});
  await post(technician,"visit",{...intake,id:jobId,version:1});
  await post(technician,"visit",{...intake,id:jobId,version:2,services:["repair"]},undefined,422);
  console.log("Accountant cashbook, payroll, inventory, service compatibility and role checks passed.");
} finally {
  await db.$disconnect();
}
