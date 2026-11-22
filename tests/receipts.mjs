import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const base = process.env.TEST_URL;
if (!base || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw Error("Use the isolated test instance and database.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const headers = { Origin: base, "Content-Type": "application/json" };
async function login(role) {
  const result = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST", headers, body: JSON.stringify({ email: role + "@vag-demo.test", password: "Demo-Workshop-2026!" }),
  });
  assert.equal(result.status, 200);
  return result.headers.getSetCookie().map((row) => row.split(";")[0]).join("; ");
}
function action(cookie, name, data, key = randomUUID()) {
  return fetch(base + "/api/actions/" + name, {
    method: "POST", headers: { ...headers, Cookie: cookie, "Idempotency-Key": key }, body: JSON.stringify(data),
  });
}
async function post(cookie, name, data, key) {
  const result = await action(cookie, name, data, key);
  assert.equal(result.status, 200, await result.clone().text());
  return (await result.json()).id;
}
try {
  const owner = await login("owner");
  const accountant = await login("accountant");
  const technician = await login("technician");
  const partyId = await post(owner, "customer", { name: "Receipt QA " + randomUUID().slice(0,8) });
  const vehicleId = await post(owner, "vehicle", { partyId, make: "Volkswagen", model: "Golf" });
  const part = { name: "Oil filter", code: "QA-" + randomUUID().slice(0, 8), price: "125", cost: "65" };
  const partId = await post(owner, "part", part);
  await post(owner, "stock", { partId, quantity: "8", kind: "adjustment", reason: "Itemized invoice test" });
  const onHand = async () => (await db.part.findUniqueOrThrow({ where: { id: partId } })).onHand.toString();
  const visit = {
    partyId, vehicleId, title: "Oil service and Stage 1", services: ["maintenance", "tuning"], at: "2025-11-17",
    serviceDetails: { maintenance: "Replaced engine oil and filter.", tuning: "Calibrated ECU and checked boost logs." },
    parts: [{ partId, quantity: "2" }],
  };
  const visitId = await post(technician, "visit", visit);
  const catalogPart = await db.part.findUniqueOrThrow({ where: { id: partId } });
  await post(owner, "part", { ...part, id: partId, version: catalogPart.version, price: "225" });
  assert.equal(await onHand(), "8");
  const account = await db.moneyAccount.findFirstOrThrow({ where: { kind: "cash", archived: false } });
  const servicePrices = { maintenance: "١٠٠٫٢٥", tuning: "149.75" };
  const payment = { visitId, amount: "200", servicePrices, at: "2025-11-17", accountId: account.id, method: "cash" };
  assert.equal((await action(technician, "visitInvoice", { visitId, servicePrices })).status, 403);
  assert.equal((await action(technician, "visitReceipt", payment)).status, 403);
  assert.equal((await action(owner, "visitReceipt", { ...payment, servicePrices: { tuning: "250" } })).status, 422);
  assert.equal((await action(owner, "visitInvoice", { visitId, servicePrices: { ...servicePrices, tuning: "-1" } })).status, 422);
  assert.equal((await action(owner, "visitInvoice", { visitId, servicePrices, visitVersion: 999 })).status, 409);
  assert.equal((await action(owner, "visitReceipt", { ...payment, amount: "600" })).status, 422);
  assert.equal(await db.document.count({ where: { sourceId: visitId, kind: "invoice" } }), 0);
  assert.equal(await onHand(), "8");
  const key = randomUUID();
  const receipt = await post(owner, "visitReceipt", payment, key);
  assert.equal(await post(owner, "visitReceipt", payment, key), receipt);
  const invoice = await db.document.findFirstOrThrow({
    where: { sourceId: visitId, kind: "invoice" },
    include: { allocations: true, lines: { orderBy: { position: "asc" } } },
  });
  assert.equal(invoice.total, 50000n);
  assert.deepEqual(invoice.metadata.serviceDetails, visit.serviceDetails);
  assert.equal(invoice.metadata.itemizedVisit, true);
  assert.deepEqual(invoice.lines.map(({ description, price, total }) => [description, price, total]), [
    ["Maintenance", 10025n, 10025n], ["Tuning", 14975n, 14975n], [part.code + " · Oil filter", 12500n, 25000n],
  ]);
  assert.equal(invoice.lines[2].partId, partId);
  assert.equal(invoice.lines[2].quantity.toString(), "2");
  assert.equal(await onHand(), "6");
  assert.equal((await action(technician, "visit", { ...visit, id: visitId, version: 0, parts: [{ partId, quantity: "4" }] })).status, 409);
  assert.equal(invoice.allocations[0].paymentId, receipt);
  assert.equal(invoice.allocations[0].amount, 20000n);
  assert.equal((await action(owner, "visitInvoice", { visitId, servicePrices, at: "2025-11-17" })).status, 409);
  assert.equal((await action(owner, "visitReceipt", { ...payment, amount: "100" })).status, 409);
  const nextPayment = await post(owner, "visitReceipt", { ...payment, servicePrices: undefined, amount: "300" });
  assert.notEqual(nextPayment, receipt);
  assert.equal(await db.document.count({ where: { sourceId: visitId, kind: "invoice" } }), 1);
  assert.equal(await onHand(), "6");
  const read = await fetch(base + "/print/payment/" + receipt + "?lang=ar", { headers: { Cookie: technician } });
  assert.equal(read.status, 200);
  const html = await read.text();
  assert.match(html, /dir="rtl" lang="ar-EG"/);
  assert.match(html, /Golf/);
  assert.match(html, /Replaced engine oil and filter/);
  assert.match(html, /Calibrated ECU and checked boost logs/);
  assert.match(html, /Oil filter/);
  const invoicePrint = await fetch(base + "/print/record/" + invoice.id + "?lang=en", { headers: { Cookie: technician } });
  assert.equal(invoicePrint.status, 200);
  const invoiceHtml = await invoicePrint.text();
  assert.match(invoiceHtml, /Replaced engine oil and filter/);
  assert.match(invoiceHtml, /Calibrated ECU and checked boost logs/);
  assert.match(invoiceHtml, /Oil filter/);
  const secondCar = await post(owner, "vehicle", { partyId, make: "Audi", model: "A3" });
  async function chargeVisit(at, vehicleId, price, detail) {
    const sourceId = await post(technician, "visit", {
      title: detail, partyId, vehicleId, at, services: ["inspection"], serviceDetails: { inspection: detail },
    });
    return post(owner, "visitInvoice", { visitId: sourceId, at, servicePrices: { inspection: price } });
  }
  const older = await chargeVisit("2025-11-18", vehicleId, "300", "Inspect brakes and suspension");
  const newer = await chargeVisit("2025-11-19", secondCar, "400", "Scan transmission faults");
  const opening = await post(owner, "opening", { kind: "customerOpening", partyId, at: "2025-11-20", amount: "25", reference: "Paper balance " + randomUUID() });
  for (const id of [older, newer, opening]) assert.equal((await db.document.findUniqueOrThrow({ where: { id } })).dueAt, null);
  const debt = { partyId, amount: "٣٥٠", at: "2025-11-21", accountId: account.id, method: "cash" };
  assert.equal((await action(technician, "customerDebtPayment", debt)).status, 403);
  assert.equal((await action(owner, "customerDebtPayment", { ...debt, amount: "726" })).status, 422);
  assert.equal((await action(owner, "customerDebtPayment", { ...debt, at: "2025-11-18" })).status, 422);
  assert.equal((await action(owner, "customerDebtPayment", { ...debt, at: "2099-01-01" })).status, 422);
  const debtKey = randomUUID();
  const installment = await post(accountant, "customerDebtPayment", debt, debtKey);
  assert.equal(await post(accountant, "customerDebtPayment", debt, debtKey), installment);
  const ledgerEntry = await db.payment.findUniqueOrThrow({ where: { id: installment }, include: { allocations: true, movements: true } });
  assert.equal(ledgerEntry.movements.length, 1);
  assert.equal(ledgerEntry.movements[0].amount, 35000n);
  assert.deepEqual(new Map(ledgerEntry.allocations.map(({ documentId, amount }) => [documentId, amount])), new Map([[older, 30000n], [newer, 5000n]]));
  assert.equal(ledgerEntry.snapshot.customerDebtAfter, "37500");
  assert.equal(ledgerEntry.snapshot.vehicle, null);
  const readReceipt = async (id) => {
    const response = await fetch(base + "/print/payment/" + id + "?lang=en", { headers: { Cookie: technician } });
    assert.equal(response.status, 200);
    return response.text();
  };
  const nextReceipt = await readReceipt(installment);
  assert.match(nextReceipt, /Inspect brakes and suspension/);
  assert.match(nextReceipt, /Scan transmission faults/);
  assert.match(nextReceipt, /Customer balance after payment.*375\.00/);
  const settle = { ...debt, amount: "375", at: "2025-12-03" };
  const concurrently = await Promise.all([action(owner, "customerDebtPayment", settle), action(accountant, "customerDebtPayment", settle)]);
  assert.deepEqual(concurrently.map((response) => response.status).sort(), [200, 422]);
  const final = (await concurrently.find((response) => response.ok).json()).id;
  const finalEntry = await db.payment.findUniqueOrThrow({ where: { id: final }, include: { allocations: true } });
  assert.deepEqual(new Map(finalEntry.allocations.map(({ documentId, amount }) => [documentId, amount])), new Map([[newer, 35000n], [opening, 2500n]]));
  assert.equal(finalEntry.snapshot.customerDebtAfter, "0");
  assert.match(await readReceipt(installment), /Customer balance after payment.*375\.00/);
  await post(owner, "reversePayment", { id: final, at: "2025-12-03", reason: "Payment reversal QA" });
  const replacement = await post(owner, "customerDebtPayment", settle);
  assert.notEqual(replacement, final);
  const customerPage = await fetch(base + "/customers/" + partyId, { headers: { Cookie: technician } });
  assert.equal(customerPage.status, 200);
  assert.match(await customerPage.text(), /Outstanding balance/);
  assert.equal(await onHand(), "6");
  assert.equal((await fetch(base + "/receipts", { headers: { Cookie: owner } })).status, 200);
  const jobId = await post(technician, "job", { partyId, vehicleId, title: "Fit an oil filter" });
  const invoiceInput = { jobId, lines: [{ kind: "part", partId, price: "225", quantity: "2" }] };
  const invoiceError = async (data, code) => {
    const result = await action(owner, "invoice", data);
    assert.equal(result.status, 422);
    assert.equal((await result.json()).error, code);
  };
  await invoiceError(invoiceInput, "issueBeforeInvoice");
  await post(owner, "jobStock", { jobId, partId, kind: "reserve", quantity: "2" });
  await invoiceError(invoiceInput, "reconcileJob");
  await post(owner, "jobStock", { jobId, partId, kind: "issue", quantity: "2" });
  assert.equal(await onHand(), "4");
  await invoiceError({ ...invoiceInput, lines: [{ ...invoiceInput.lines[0], quantity: "1" }] }, "reconcileJob");
  const jobInvoiceId = await post(owner, "invoice", invoiceInput);
  const jobInvoice = await db.document.findUniqueOrThrow({ where: { id: jobInvoiceId }, include: { lines: true, movements: true } });
  assert.equal(jobInvoice.sourceId, jobId);
  assert.equal(jobInvoice.total, 45000n);
  assert.equal(jobInvoice.lines[0].costTotal, 13000n);
  assert.equal(jobInvoice.movements.length, 0);
  assert.equal(await onHand(), "4");
  assert.equal((await action(owner, "invoice", invoiceInput)).status, 409);

  const historical = await db.document.create({ data: {
    kind: "quote", status: "approved", number: "RETIRED-" + randomUUID(), sourceId: jobId, partyId, vehicleId,
    createdBy: jobInvoice.createdBy,
  } });
  for (const path of ["/record/", "/print/record/"]) {
    assert.equal((await fetch(base + path + historical.id, { headers: { Cookie: owner } })).status, 404);
  }
  const jobPage = await fetch(base + "/record/" + jobId, { headers: { Cookie: owner } });
  assert.equal(jobPage.status, 200);
  assert.ok(!(await jobPage.text()).includes(historical.number));

  const employeeId = await post(owner, "employee", {
    name: "Weekly payroll QA " + randomUUID().slice(0, 8), startedAt: "2025-11-15", weeklySalary: "3000", paidDaysPerWeek: 6,
  });
  const weekEnding = "2025-11-21";
  const forWeek = { employeeId, weekEnding, at: weekEnding };
  const advance = { ...forWeek, kind: "advance", amount: "600", accountId: account.id, periodId: "" };
  assert.equal((await action(technician, "weeklyPayroll", advance)).status, 403);
  const advanceKey = randomUUID();
  const advanceId = await post(accountant, "weeklyPayroll", advance, advanceKey);
  assert.equal(await post(accountant, "weeklyPayroll", advance, advanceKey), advanceId);
  assert.equal((await action(owner, "weeklyPayroll", { ...advance, weekEnding: "2025-11-22" })).status, 409);
  const period = await db.document.findFirstOrThrow({where:{employeeId,kind:"payroll",reference:weekEnding}});
  const deduction = { ...forWeek, kind: "deduction", amount: "200", note: "Approved deduction", periodId: period.id };
  await post(accountant, "weeklyPayroll", deduction);
  const settleWeek = { ...forWeek, kind: "salaryPayment", accountId: account.id, periodId: period.id };
  assert.equal((await action(owner, "weeklyPayroll", { ...settleWeek, expectedBalance: "240000" })).status, 409);

  const absence = { employeeId, action: "mark" };
  assert.equal((await action(technician, "employeeAbsence", absence)).status, 403);
  const absenceId = await post(owner, "employeeAbsence", absence);
  assert.equal(await post(owner, "employeeAbsence", absence), absenceId);
  const linked = await db.employeeAbsence.findUniqueOrThrow({
    where:{id:absenceId},include:{deductionEntry:{include:{document:true}}},
  });
  assert.equal(linked.deductionEntry.amount,-50000n);
  assert.equal(linked.deductionEntry.document.total,250000n);
  const absencePeriodId = linked.deductionEntry.documentId;
  assert.equal(await db.payEntry.count({where:{documentId:absencePeriodId,kind:"deduction"}}),1);
  await post(owner, "employeeAbsence", { ...absence, action: "undo" });
  await post(owner, "employeeAbsence", { ...absence, action: "undo" });
  assert.ok((await db.employeeAbsence.findUniqueOrThrow({where:{id:absenceId}})).voidedAt);
  assert.equal((await db.document.findUniqueOrThrow({where:{id:absencePeriodId}})).total,300000n);
  assert.equal(await db.payEntry.count({where:{documentId:absencePeriodId,reference:linked.deductionEntryId,kind:"correction"}}),1);
  await post(owner, "employeeAbsence", absence);
  assert.equal(await db.employeeAbsence.count({where:{employeeId}}),1);
  assert.equal((await db.document.findUniqueOrThrow({where:{id:absencePeriodId}})).total,250000n);

  const cairoToday = new Intl.DateTimeFormat("en-CA", { timeZone:"Africa/Cairo" }).format(new Date());
  await post(owner, "employeeDismiss", { id: employeeId, version: 0, endedAt: cairoToday, reason: "End of contract" });
  assert.equal((await db.employee.findUniqueOrThrow({where:{id:employeeId}})).dismissalReason,"End of contract");
  assert.equal((await action(owner, "employeeAbsence", absence)).status, 422);
  assert.equal((await action(owner, "weeklyPayroll", { ...advance, periodId: period.id })).status, 422);
  await post(owner, "weeklyPayroll", { ...settleWeek, expectedBalance: "220000" });
  assert.equal((await action(owner, "weeklyPayroll", settleWeek)).status, 422);
  const weekly = await db.document.findUniqueOrThrow({where:{id:period.id},include:{payroll:true,allocations:{include:{payment:{include:{movements:true}}}}}});
  assert.equal(weekly.total,280000n);
  assert.deepEqual(new Map(weekly.payroll.map(row=>[row.kind,row.amount])),new Map([["base",300000n],["deduction",-20000n]]));
  assert.deepEqual(new Map(weekly.allocations.map(row=>[row.payment.kind,row.amount])),new Map([["advance",60000n],["salaryPayment",220000n]]));
  for (const row of weekly.allocations) assert.deepEqual(row.payment.movements.map(movement=>movement.amount),[-row.amount]);

  const pendingEmployeeId = await post(owner,"employee",{name:"Payroll setup QA "+randomUUID().slice(0,8)});
  assert.equal((await db.employee.findUniqueOrThrow({where:{id:pendingEmployeeId}})).paidDaysPerWeek,6);
  const pendingId = await post(owner,"employeeAbsence",{employeeId:pendingEmployeeId,action:"mark"});
  assert.equal((await db.employeeAbsence.findUniqueOrThrow({where:{id:pendingId}})).deductionEntryId,null);
  const firstPayout = {
    employeeId:pendingEmployeeId,kind:"salaryPayment",weekEnding:cairoToday,at:cairoToday,
    accountId:account.id,
  };
  const noSalary = await action(owner,"weeklyPayroll",{...firstPayout,weeklySalary:"3000"});
  assert.equal(noSalary.status,422);
  assert.equal((await noSalary.json()).error,"weeklySalaryRequired");
  async function setWeeklySalary(id, weeklySalary) {
    const employee = await db.employee.findUniqueOrThrow({where:{id}});
    await post(owner,"employee",{id,version:employee.version,name:employee.name,weeklySalary});
  }
  await setWeeklySalary(pendingEmployeeId,"3000");
  const paidWithDeduction = await post(owner,"weeklyPayroll",firstPayout);
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:paidWithDeduction}})).amount,250000n);
  assert.ok((await db.employeeAbsence.findUniqueOrThrow({where:{id:pendingId}})).deductionEntryId);

  const rollEmployeeId = await post(owner,"employee",{name:"Payroll rollover QA "+randomUUID().slice(0,8),weeklySalary:"3000"});
  const bookedWeek = {employeeId:rollEmployeeId,weekEnding:cairoToday,at:cairoToday,accountId:account.id};
  const nextWeek = new Date(Date.parse(cairoToday+"T12:00:00Z")+7*86400000).toISOString().slice(0,10);
  const beforePay = await post(owner,"weeklyPayroll",{...bookedWeek,kind:"advance",amount:"600"});
  const firstPeriod = await db.document.findFirstOrThrow({where:{employeeId:rollEmployeeId,kind:"payroll",reference:cairoToday}});
  assert.equal((await db.allocation.findFirstOrThrow({where:{paymentId:beforePay}})).documentId,firstPeriod.id);
  await post(owner,"weeklyPayroll",{...bookedWeek,kind:"salaryPayment"});

  const rolledAdvanceInput = {...bookedWeek,kind:"advance",amount:"400",periodId:firstPeriod.id,expectedBalance:"0",targetWeek:nextWeek,targetPeriodId:""};
  const rolledKey = randomUUID();
  const rolledAdvance = await post(owner,"weeklyPayroll",rolledAdvanceInput,rolledKey);
  assert.equal(await post(owner,"weeklyPayroll",rolledAdvanceInput,rolledKey),rolledAdvance);
  const nextPeriod = await db.document.findFirstOrThrow({where:{employeeId:rollEmployeeId,kind:"payroll",reference:nextWeek}});
  assert.equal((await db.allocation.findFirstOrThrow({where:{paymentId:rolledAdvance}})).documentId,nextPeriod.id);
  assert.equal(await post(owner,"weeklyPayroll",{...bookedWeek,kind:"deduction",amount:"200",note:"Deduction after pay"}),nextPeriod.id);
  const rolledAbsence = await post(owner,"employeeAbsence",{employeeId:rollEmployeeId,action:"mark"});
  const absenceAfterPay = await db.employeeAbsence.findUniqueOrThrow({where:{id:rolledAbsence},include:{deductionEntry:true}});
  assert.equal(absenceAfterPay.deductionEntry.documentId,nextPeriod.id);
  assert.equal(absenceAfterPay.deductionEntry.amount,-50000n);
  const laterPay = await post(owner,"weeklyPayroll",{...bookedWeek,weekEnding:nextWeek,kind:"salaryPayment"});
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:laterPay}})).amount,190000n);
  const followingWeek = new Date(Date.parse(nextWeek+"T12:00:00Z")+7*86400000).toISOString().slice(0,10);
  const followingDeduction = await post(owner,"weeklyPayroll",{...bookedWeek,kind:"deduction",amount:"100",note:"Both earlier weeks paid"});
  assert.equal((await db.document.findUniqueOrThrow({where:{id:followingDeduction}})).reference,followingWeek);
  assert.equal((await db.document.findUniqueOrThrow({where:{id:firstPeriod.id}})).total,300000n);
  await post(owner,"employeeAbsence",{employeeId:rollEmployeeId,action:"undo"});
  assert.equal((await db.document.findUniqueOrThrow({where:{id:nextPeriod.id}})).total,280000n);

  const deferredEmployee = await post(owner,"employee",{name:"Deferred absence QA "+randomUUID().slice(0,8),weeklySalary:"3000"});
  const deferredWeek = {...bookedWeek,employeeId:deferredEmployee};
  const earlyAdvance = await post(owner,"weeklyPayroll",{...deferredWeek,kind:"advance",amount:"200"});
  await setWeeklySalary(deferredEmployee,"");
  const firstSalary = await post(owner,"weeklyPayroll",{...deferredWeek,kind:"salaryPayment"});
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:firstSalary}})).amount,280000n);
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:earlyAdvance}})).amount,20000n);
  const deferredId = await post(owner,"employeeAbsence",{employeeId:deferredEmployee,action:"mark"});
  assert.equal((await db.employeeAbsence.findUniqueOrThrow({where:{id:deferredId}})).deductionEntryId,null);
  await setWeeklySalary(deferredEmployee,"3600");
  const nextPayout = {...deferredWeek,weekEnding:nextWeek,kind:"salaryPayment"};
  assert.equal((await action(owner,"weeklyPayroll",{...nextPayout,expectedWeeklySalary:"300000"})).status,409);
  const deferredPayout = await post(owner,"weeklyPayroll",nextPayout);
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:deferredPayout}})).amount,300000n);
  assert.ok((await db.employeeAbsence.findUniqueOrThrow({where:{id:deferredId}})).deductionEntryId);
  console.log("PASS receipt and stock transactions, weekly payroll, advance and deduction rollover, absences, undo, and dismissal.");
} finally { await db.$disconnect(); }

