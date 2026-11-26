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

// Existing ledgers can still contain advances booked before the advance limit.
async function legacyAdvance(session, data, applied, excess) {
  const {id}=await post(session,"weeklyPayroll",{...data,amount:applied});
  const {documentId}=await db.allocation.findFirstOrThrow({where:{paymentId:id}});
  await db.$transaction([
    db.payment.update({where:{id},data:{amount:{increment:excess}}}),
    db.cashMovement.updateMany({where:{paymentId:id},data:{amount:{decrement:excess}}}),
    db.payrollExcess.create({data:{documentId,paymentId:id,remaining:excess,at:new Date(data.at+"T12:00:00Z")}}),
  ]);
  return id;
}

try {
  const [owner, accountant, technician] = await Promise.all(
    ["owner","accountant","technician"].map(username=>signIn(base,username)),
  );
  const {id:accountId} = await post(owner,"account",{name:"Cashbook "+suffix,kind:"cash",code:"C-"+suffix});
  const {id:visaId} = await post(owner,"account",{name:"Visa QA "+suffix,kind:"bank"});
  const {id:instaPayId} = await post(owner,"account",{name:"InstaPay QA "+suffix,kind:"instaPay"});
  const terminal = await db.moneyAccount.findUniqueOrThrow({where:{code:"M1"}});
  assert.equal(terminal.kind,"cardTerminal");
  assert.ok(await db.moneyAccount.findUnique({where:{code:"M2"}}));
  const gamalVisa = await db.moneyAccount.findUniqueOrThrow({where:{code:"G"}});
  assert.equal(gamalVisa.kind,"visa");
  await post(accountant,"payment",{kind:"cashOpening",at:monday,paymentChannel:"cash:"+accountId,amount:"1000",note:"Cashbook QA opening"});
  const paid = {at:tuesday,paymentChannel:"cash:"+accountId,amount:"50",category:"Supplies",payee:"Expense QA "+suffix};
  await post(technician,"paidExpense",paid,undefined,403);
  assert.equal((await post(accountant,"paidExpense",{...paid,paymentChannel:"card:"+accountId},undefined,422)).error,"invalidPaymentChannel");
  assert.equal(await db.document.count({where:{kind:"expense",reference:paid.payee}}),0);
  const expenseKey = randomUUID();
  const {id:expenseId} = await post(accountant,"paidExpense",paid,expenseKey);
  assert.equal((await post(accountant,"paidExpense",paid,expenseKey)).id,expenseId);
  const expense = await db.document.findUniqueOrThrow({where:{id:expenseId},include:{allocations:{include:{payment:true}}}});
  assert.equal(expense.allocations.length,1);
  assert.equal(expense.allocations[0].payment.method,"cash");
  const {id:expensePayment} = expense.allocations[0].payment;
  assert.equal(await db.cashMovement.count({where:{paymentId:expensePayment,accountId,amount:-5000n}}),1);
  const {id:partyId} = await post(owner,"customer",{name:"Card QA "+suffix});
  const cardReceipt={kind:"receipt",partyId,at:tuesday,amount:"200",allowCredit:true};
  assert.equal((await post(accountant,"payment",{...cardReceipt,receiptDestination:"cash:"+terminal.id},undefined,422)).error,"invalidAccount");
  const {id:cardReceiptId}=await post(accountant,"payment",{...cardReceipt,paymentChannel:"card:"+terminal.id});
  const recordedCard=await db.payment.findUniqueOrThrow({where:{id:cardReceiptId},include:{movements:true}});
  assert.equal(recordedCard.method,"card");
  assert.equal(recordedCard.movements[0].accountId,terminal.id);
  assert.equal((await post(accountant,"payment",{...cardReceipt,paymentChannel:"transfer:"+gamalVisa.id},undefined,422)).error,"invalidPaymentChannel");
  const {id:gamalReceipt}=await post(accountant,"payment",{...cardReceipt,paymentChannel:"card:"+gamalVisa.id});
  assert.equal(await db.cashMovement.count({where:{paymentId:gamalReceipt,accountId:gamalVisa.id,amount:20000n}}),1);
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
  const customMethod = "Deposit: branch " + suffix;
  const {id:catalogId} = await post(owner,"catalogue",{group:"paymentMethod",name:customMethod});
  const contribution={kind:"contribution",at:wednesday,paymentChannel:customMethod+":"+visaId,amount:"40",note:"Contribution QA"};
  const {id:contributionId}=await post(accountant,"payment",contribution);
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:contributionId}})).method,customMethod);
  assert.equal(await db.cashMovement.count({where:{paymentId:contributionId,accountId:visaId,amount:4000n}}),1);
  await post(owner,"catalogue",{id:catalogId,version:0,group:"paymentMethod",name:customMethod,archived:true});
  assert.equal((await post(accountant,"payment",contribution,undefined,422)).error,"invalidPaymentChannel");
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
  const advance = {employeeId,kind:"advance",weekEnding:friday,at:tuesday,paymentChannel:"instaPay:"+instaPayId,amount:"2700"};
  assert.equal((await post(accountant,"weeklyPayroll",advance,undefined,422)).error,"advanceLimit");
  const advanceId = await legacyAdvance(accountant,advance,"2250",45000n);
  const excess = await db.payrollExcess.findUniqueOrThrow({where:{paymentId:advanceId}});
  assert.equal(excess.remaining,45000n);
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:advanceId}})).method,"instaPay");
  assert.equal(await db.cashMovement.count({where:{paymentId:advanceId,accountId:instaPayId,amount:-270000n}}),1);
  const {id:salaryEmployee}=await post(owner,"employee",{name:"Salary channel "+suffix,startedAt:monday,weeklySalary:"600"});
  const {id:salaryId}=await post(accountant,"weeklyPayroll",{employeeId:salaryEmployee,kind:"salaryPayment",
    weekEnding:friday,at:friday,paymentChannel:"transfer:"+visaId});
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:salaryId}})).method,"transfer");
  assert.equal(await db.cashMovement.count({where:{paymentId:salaryId,accountId:visaId,amount:-60000n}}),1);
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
  const applyAdvanceId=await legacyAdvance(accountant,applyAdvance,"3000",10000n);
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

  const newPart = {name:"Inventory QA "+suffix,code:"INV-"+suffix,cost:"100",price:"150",category:"Reconciliation",initialQuantity:"10"};
  const partKey = randomUUID();
  const {id:partId} = await post(owner,"part",newPart,partKey);
  assert.equal((await post(owner,"part",newPart,partKey)).id,partId);
  const stockedPart = await db.part.findUniqueOrThrow({where:{id:partId},include:{movements:true}});
  assert.equal(stockedPart.onHand.toFixed(),"10");
  assert.deepEqual(stockedPart.movements.map(({kind,quantity,totalCost})=>[kind,quantity.toFixed(),totalCost]),[["adjustment","10",100000n]]);
  assert.equal((await post(owner,"part",{...newPart,id:partId,version:stockedPart.version},undefined,422)).error,"startingQuantityOnCreate");
  assert.equal((await post(owner,"part",{...newPart,code:"INVALID-"+suffix,initialQuantity:"-1"},undefined,422)).error,"invalidStartingQuantity");
  assert.equal(await db.part.count({where:{code:"INVALID-"+suffix}}),0);
  const {id:otherPart}=await post(owner,"part",{name:"Other valuation fixture",code:"OTHER-"+suffix,cost:"200",price:"300"});
  await post(owner,"stock",{partId:otherPart,kind:"adjustment",quantity:"1",reason:"Warehouse total fixture"});
  const {id:vehicleId} = await post(owner,"vehicle",{partyId,make:"VW",model:"Golf"});
  const {id:reserveJobId} = await post(technician,"job",{partyId,vehicleId,title:"Reserve QA "+suffix});
  await db.$transaction([
    db.part.update({where:{id:partId},data:{reserved:"2"}}),
    db.jobStock.create({data:{documentId:reserveJobId,partId,reserved:"2"}}),
  ]);
  const inventory = await page(accountant,"/inventory?q="+suffix+"&category=Reconciliation&status=active");
  assert.match(inventory,/<th scope="col">In stock<\/th>/);
  assert.doesNotMatch(inventory,/<th scope="col">(?:On hand|Available)<\/th>/);
  assert.match(await page(accountant,"/inventory/"+partId),/<small>In stock<\/small><b><bdi>10<\/bdi><\/b>/);
  const stockReport = await page(accountant,"/reports?report=stock&q="+suffix+"&category=Reconciliation");
  assert.match(stockReport,/<th scope="col">In stock<\/th>/);
  assert.doesNotMatch(stockReport,/<th scope="col">(?:On hand|Available)<\/th>/);
  const stockExport = await page(accountant,"/api/export?report=stock&q="+suffix+"&category=Reconciliation");
  const [stockHeader, stockRow] = stockExport.trimStart().split("\r\n");
  assert.equal(stockHeader,'"Code","Part","Category","In stock","Cost","Price","Total cost","Total selling value"');
  const stockPrefix = '"INV-'+suffix+'","Inventory QA '+suffix+'","Reconciliation","10",';
  assert.ok(stockRow.startsWith(stockPrefix));
  assert.match(stockRow.slice(stockPrefix.length),/^"EGP\s+100\.00",/);
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
