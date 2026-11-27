import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { postAction, signIn } from "./support/http.mjs";

const base = process.env.TEST_URL;
if (!base || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw Error("Use the isolated test instance and database.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const login = (role) => signIn(base, role);
const action = (cookie, name, data, key) => postAction(base, cookie, name, data, key);
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
  const vehicleId = await post(owner, "vehicle", { partyId, make: "Volkswagen", model: "Golf", color: "White" });
  const part = { name: "Oil filter", code: "QA-" + randomUUID().slice(0, 8), price: "125", cost: "65" };
  const partId = await post(owner, "part", part);
  await post(owner, "stock", { partId, quantity: "8", kind: "adjustment", reason: "Itemized invoice test" });
  const onHand = async () => (await db.part.findUniqueOrThrow({ where: { id: partId } })).onHand.toString();
  const visit = {
    partyId, vehicleId, title: "Oil service and Stage 1", at: "2025-11-17",
    services: ["maintenance", "other", "tuning", "installation", "diagnostics", "inspection"],
    serviceDetails: { maintenance: "Replaced engine oil and filter.", tuning: "Calibrated ECU and checked boost logs." },
    parts: [{ partId, quantity: "2" }],
  };
  const overQuantity = { parts: [{ partId, quantity: "8.001" }] };
  const rejectedIntake = await action(technician, "visit", { ...visit, ...overQuantity });
  assert.equal(rejectedIntake.status, 409);
  assert.equal((await rejectedIntake.json()).error, "stockConflict");
  const visitId = await post(technician, "visit", visit);
  const rejectedQuantityEdit = await action(technician, "visit", { ...visit, ...overQuantity, id: visitId, version: 0 });
  assert.equal(rejectedQuantityEdit.status, 409);
  assert.equal((await rejectedQuantityEdit.json()).error, "stockConflict");
  const catalogPart = await db.part.findUniqueOrThrow({ where: { id: partId } });
  await post(owner, "part", { ...part, id: partId, version: catalogPart.version, price: "225" });
  assert.equal(await onHand(), "8");
  const account = await db.moneyAccount.findFirstOrThrow({ where: { kind: "cash", archived: false } });
  const servicePrices = { other: "١٠٠٫٢٥", tuning: "149.75" };
  const payment = { visitId, amount: "200", servicePrices, at: "2025-11-17", accountId: account.id, method: "cash" };
  assert.equal((await action(technician, "visitInvoice", { visitId, servicePrices })).status, 403);
  assert.equal((await action(technician, "visitReceipt", payment)).status, 403);
  assert.equal((await action(owner, "visitReceipt", { ...payment, servicePrices: { tuning: "250" } })).status, 422);
  assert.equal((await action(owner, "visitReceipt", { ...payment, servicePrices: { ...servicePrices, maintenance: "50" } })).status, 422);
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
  assert.deepEqual(invoice.metadata.serviceDetails,
    Object.fromEntries(visit.services.map((service) => [service, visit.serviceDetails[service] ?? ""])));
  assert.deepEqual(invoice.metadata.descriptiveServices, ["maintenance", "installation", "diagnostics", "inspection"]);
  assert.equal(invoice.metadata.itemizedVisit, true);
  assert.deepEqual(invoice.lines.map(({ description, price, total }) => [description, price, total]), [
    ["Other work", 10025n, 10025n], ["Software tuning", 14975n, 14975n], [part.code + " · Oil filter", 12500n, 25000n],
  ]);
  assert.equal(invoice.lines[2].partId, partId);
  assert.equal(invoice.lines[2].quantity.toString(), "2");
  assert.equal(await onHand(), "6");
  assert.equal((await action(technician, "visit", { ...visit, id: visitId, version: 0, parts: [{ partId, quantity: "4" }] })).status, 409);
  assert.equal(invoice.allocations[0].paymentId, receipt);
  assert.equal(invoice.allocations[0].amount, 20000n);
  assert.equal((await action(owner, "visitInvoice", { visitId, servicePrices, at: "2025-11-17" })).status, 409);
  assert.equal((await action(owner, "visitReceipt", { ...payment, amount: "100" })).status, 409);
  const balancePayment = {
    kind: "receipt", invoiceId: invoice.id, amount: "300", at: "2025-11-17", accountId: account.id,
  };
  assert.equal((await action(technician, "payment", balancePayment)).status, 403);
  for (const [at, error] of [["2025-11-16", "paymentBeforeInvoice"], ["2099-01-01", "futurePayment"]]) {
    const result = await action(owner, "payment", { ...balancePayment, at });
    assert.equal(result.status, 422);
    assert.equal((await result.json()).error, error);
  }
  assert.equal((await action(owner, "payment", { ...balancePayment, amount: "300.01" })).status, 422);
  const balanceKey = randomUUID();
  const nextPayment = await post(owner, "payment", balancePayment, balanceKey);
  assert.equal(await post(owner, "payment", balancePayment, balanceKey), nextPayment);
  assert.notEqual(nextPayment, receipt);
  assert.equal((await action(owner, "payment", balancePayment)).status, 422);
  assert.equal(await db.document.count({ where: { sourceId: visitId, kind: "invoice" } }), 1);
  assert.equal(await onHand(), "6");
  const originalReceipt = await db.payment.findUniqueOrThrow({ where: { id: receipt } });
  const receiptBusiness = { ...originalReceipt.snapshot.business, name: "Workshop Print QA", logo: "/storefront.jpg" };
  const legacySnapshot = { ...originalReceipt.snapshot, business: receiptBusiness, cashTendered: "25000" };
  delete legacySnapshot.receiptTotal;
  await db.payment.update({ where: { id: receipt }, data: { snapshot: legacySnapshot } });
  const read = await fetch(base + "/print/payment/" + receipt + "?lang=ar", { headers: { Cookie: accountant } });
  assert.equal(read.status, 200);
  const html = await read.text();
  assert.match(html, /dir="rtl" lang="ar-EG"/);
  assert.match(html, /<bdi>Golf White<\/bdi>/);
  const printedRows = html.match(/<tr>.*?<\/tr>/g) ?? [];
  for (const name of ["صيانة دورية", "صيانة اعطال", "كشف أعطال", "فحص"]) {
    const row = printedRows.find((row) => row.includes("<span>" + name + "<"));
    assert.ok(row?.endsWith("<td><bdi></bdi></td>".repeat(4) + "</tr>"), name);
  }
  assert.doesNotMatch(html, /<section class="print-work">/);
  assert.match(html, /Replaced engine oil and filter/);
  assert.match(html, /Calibrated ECU and checked boost logs/);
  assert.match(html, /Oil filter/);
  assert.ok(html.includes("<td><bdi>قطع غيار</bdi></td>"));
  assert.match(html, /alt="Workshop Print QA"[^>]*src="\/storefront\.jpg"/);
  assert.match(html, /receipt-print-brand"><strong>Workshop Print QA/);
  assert.doesNotMatch(html, /الباقي اللي اتردّ/);
  const invoicePrint = await fetch(base + "/print/record/" + invoice.id + "?lang=en", { headers: { Cookie: accountant } });
  assert.equal(invoicePrint.status, 200);
  const invoiceHtml = await invoicePrint.text();
  assert.match(invoiceHtml, /Replaced engine oil and filter/);
  assert.match(invoiceHtml, /Calibrated ECU and checked boost logs/);
  assert.match(invoiceHtml, /Oil filter/);
  assert.match(invoiceHtml, /Amount paid.*500\.00/);
  assert.match(invoiceHtml, /Remaining balance.*0\.00/);
  assert.match(html, /إجمالي الفاتورة<\/dt><dd><bdi>[^<]*٥٠٠٫٠٠/);
  assert.match(html, /المدفوع<\/dt><dd><bdi>[^<]*٢٠٠٫٠٠/);
  assert.ok(!html.includes(account.name), "The printed receipt should omit the payment account name.");
  const secondCar = await post(owner, "vehicle", { partyId, make: "Audi", model: "A3" });
  async function chargeVisit(at, vehicleId, price, detail) {
    const sourceId = await post(technician, "visit", {
      title: detail, partyId, vehicleId, at, services: ["inspection"], serviceDetails: { inspection: detail },
    });
    return post(owner, "visitInvoice", { visitId: sourceId, at, workshopCharges: { generalLabor: price } });
  }
  const older = await chargeVisit("2025-11-18", vehicleId, "300", "Inspect brakes and suspension");
  const newer = await chargeVisit("2025-11-19", secondCar, "400", "Scan transmission faults");
  // Model a posted invoice that priced inspection before it became descriptive.
  const olderInvoice = await db.document.findUniqueOrThrow({ where: { id: older }, include: { lines: true } });
  const { descriptiveServices, ...historicalMetadata } = olderInvoice.metadata;
  await db.$transaction([
    db.document.update({ where: { id: older }, data: { metadata: historicalMetadata } }),
    db.line.update({ where: { id: olderInvoice.lines[0].id }, data: { kind: "service", purpose: null, position: 0, description: "Inspection" } }),
  ]);
  const historicalPrint = await fetch(base + "/print/record/" + older + "?lang=en", { headers: { Cookie: accountant } });
  assert.equal(historicalPrint.status, 200);
  const historicalLine = (await historicalPrint.text()).match(/<tr>[^\n]*?<\/tr>/g)?.find(row => row.includes("Inspect brakes and suspension"));
  assert.match(historicalLine ?? "", /EGP\s*300\.00/);
  const opening = await post(owner, "opening", { kind: "customerOpening", partyId, at: "2025-11-20", amount: "25", reference: "Paper balance " + randomUUID() });
  for (const id of [older, newer, opening]) assert.equal((await db.document.findUniqueOrThrow({ where: { id } })).dueAt, null);
  const debt = { partyId, amount: "٣٥٠", at: "2025-11-21", accountId: account.id, method: "cash",
    allocations:[{documentId:older,amount:"300"},{documentId:newer,amount:"50"}] };
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
  assert.equal(ledgerEntry.amount, 35000n);
  assert.equal(Object.hasOwn(ledgerEntry.snapshot,"cashTendered"),false);
  assert.equal(ledgerEntry.snapshot.receiptTotal, "70000");
  assert.deepEqual(new Map(ledgerEntry.allocations.map(({ documentId, amount }) => [documentId, amount])), new Map([[older, 30000n], [newer, 5000n]]));
  assert.equal(ledgerEntry.snapshot.customerDebtAfter, "37500");
  assert.equal(ledgerEntry.snapshot.vehicle, null);
  const readReceipt = async (id) => {
    const response = await fetch(base + "/print/payment/" + id + "?lang=en", { headers: { Cookie: accountant } });
    assert.equal(response.status, 200);
    return response.text();
  };
  const nextReceipt = await readReceipt(installment);
  assert.match(nextReceipt, /Inspect brakes and suspension/);
  assert.match(nextReceipt, /Scan transmission faults/);
  assert.match(nextReceipt, /Balance before payment<\/dt><dd><bdi>EGP\s*400\.00/);
  assert.match(nextReceipt, /Paid this time<\/dt><dd><bdi>EGP\s*50\.00/);
  assert.match(nextReceipt, /Remaining balance<\/dt><dd><bdi>EGP\s*350\.00/);
  assert.match(nextReceipt, /Total received<\/dt><dd><bdi>EGP\s*350\.00/);
  assert.doesNotMatch(nextReceipt, /Change given|Customer balance after payment|Applied from this payment/);
  const settle = { ...debt, amount: "375", at: "2025-12-03", allocations:[{documentId:newer,amount:"350"},{documentId:opening,amount:"25"}] };
  const concurrently = await Promise.all([action(owner, "customerDebtPayment", settle), action(accountant, "customerDebtPayment", settle)]);
  assert.deepEqual(concurrently.map((response) => response.status).sort(), [200, 422]);
  const final = (await concurrently.find((response) => response.ok).json()).id;
  const finalEntry = await db.payment.findUniqueOrThrow({ where: { id: final }, include: { allocations: true } });
  assert.deepEqual(new Map(finalEntry.allocations.map(({ documentId, amount }) => [documentId, amount])), new Map([[newer, 35000n], [opening, 2500n]]));
  assert.equal(finalEntry.snapshot.customerDebtAfter, "0");
  assert.match(await readReceipt(installment), /Remaining balance<\/dt><dd><bdi>EGP\s*350\.00/);
  assert.match(await readReceipt(final), /Remaining balance<\/dt><dd><bdi>EGP\s*0\.00/);
  await post(owner, "reversePayment", { id: final, at: "2025-12-03", reason: "Payment reversal QA" });
  const replacement = await post(owner, "customerDebtPayment", settle);
  assert.notEqual(replacement, final);
  const customerPage = await fetch(base + "/customers/" + partyId, { headers: { Cookie: accountant } });
  assert.equal(customerPage.status, 200);
  assert.match(await customerPage.text(), /Outstanding balance/);
  assert.equal(await onHand(), "6");
  const receipts = await fetch(base + "/receipts?party=" + partyId, { headers: { Cookie: owner } });
  assert.equal(receipts.status, 200);
  assert.match(await receipts.text(), new RegExp('href="/payment/' + installment + '"'));
  const invoices = await fetch(base + "/invoices?party=" + partyId, { headers: { Cookie: owner } });
  assert.equal(invoices.status, 200);
  const invoicesHtml = await invoices.text();
  assert.match(invoicesHtml, /href="\/receipts"/);
  assert.doesNotMatch(invoicesHtml, new RegExp('href="/payment/' + installment + '"'));

  const filters = new URLSearchParams({ party: partyId, paymentKind: "receipt", from: debt.at, to: debt.at });
  const transactions = await fetch(base + "/reports?report=payments&" + filters, { headers: { Cookie: owner } });
  assert.equal(transactions.status, 200);
  const transactionsUrl = new URL(transactions.url);
  assert.equal(transactionsUrl.pathname, "/cash/transactions");
  for (const [key, value] of filters) assert.equal(transactionsUrl.searchParams.get(key), value);
  const transactionsHtml = await transactions.text();
  assert.match(transactionsHtml, new RegExp('href="/payment/' + installment + '"'));
  assert.doesNotMatch(transactionsHtml, new RegExp('href="/payment/' + receipt + '"'));
  const csvLink = transactionsHtml.match(/href="(\/api\/export\?[^"]*)"/)?.[1];
  assert.ok(csvLink);
  const csvPath = csvLink.replaceAll("&amp;", "&");
  const csv = await fetch(base + csvPath, { headers: { Cookie: owner } });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), new RegExp('"' + ledgerEntry.number + '"'));
  assert.equal((await fetch(base + csvPath, { headers: { Cookie: technician } })).status, 403);
  filters.set("paymentKind", "refund");
  const refunds = await fetch(base + "/cash/transactions?" + filters, { headers: { Cookie: owner } });
  assert.equal(refunds.status, 200);
  assert.doesNotMatch(await refunds.text(), new RegExp('href="/payment/' + installment + '"'));
  const jobId = await post(technician, "job", { partyId, vehicleId, title: "Fit an oil filter" });
  const invoiceInput = { jobId, lines: [{ kind: "part", partId, price: "225", quantity: "2" }] };
  const invoiceError = async (data, code) => {
    const result = await action(owner, "invoice", data);
    assert.equal(result.status, 422);
    assert.equal((await result.json()).error, code);
  };
  await invoiceError(invoiceInput, "issueBeforeInvoice");
  await db.$transaction([
    db.part.update({where:{id:partId},data:{reserved:{increment:"2"}}}),
    db.jobStock.create({data:{documentId:jobId,partId,reserved:"2"}}),
  ]);
  await invoiceError(invoiceInput, "issueBeforeInvoice");
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

  const counterSale = {
    customerName: "Counter customer " + randomUUID().slice(0, 8), at: "2025-11-17T17:00",
    lines: [{ kind: "part", partId, quantity: "2", price: "125", discount: "5" }],
  };
  assert.equal((await action(technician, "invoice", counterSale)).status, 403);
  const outOfStock = await action(owner, "invoice", { ...counterSale, lines: [{ ...counterSale.lines[0], quantity: "5" }] });
  assert.equal(outOfStock.status, 409);
  assert.equal((await outOfStock.json()).error, "stockConflict");
  assert.equal(await db.party.count({ where: { name: counterSale.customerName } }), 0);
  assert.equal(await onHand(), "4");
  const saleKey = randomUUID();
  const saleId = await post(owner, "invoice", counterSale, saleKey);
  assert.equal(await post(owner, "invoice", counterSale, saleKey), saleId);
  const sale = await db.document.findUniqueOrThrow({ where: { id: saleId }, include: { party: true, movements: true } });
  assert.equal(sale.party.name, counterSale.customerName);
  assert.equal(sale.vehicleId, null);
  assert.equal(sale.total, 24500n);
  assert.equal(sale.movements.length, 1);
  assert.equal(await onHand(), "2");
  const sameNameSaleId = await post(owner, "invoice", { ...counterSale, customerName: counterSale.customerName.toUpperCase() });
  const sameNameSale = await db.document.findUniqueOrThrow({ where: { id: sameNameSaleId } });
  assert.equal(sameNameSale.partyId, sale.partyId);
  assert.equal(await onHand(), "0");
  const unavailable = await action(technician, "visit", visit);
  assert.equal(unavailable.status, 409);
  assert.equal((await unavailable.json()).error, "stockConflict");
  const existingVisit = await db.document.findUniqueOrThrow({ where: { id: visitId } });
  await post(technician, "visit", { ...visit, id: visitId, version: existingVisit.version, note: "Checked service log" });
  const counterReceipt = { kind: "receipt", invoiceId: saleId, amount: "245", accountId: account.id, at: "2025-11-17" };
  const simultaneous = await Promise.all([action(owner, "payment", counterReceipt), action(accountant, "payment", counterReceipt)]);
  assert.deepEqual(simultaneous.map(({ status }) => status).sort(), [200, 422]);
  const saleReceiptId = (await simultaneous.find((response) => response.ok).json()).id;
  const saleReceipt = await db.payment.findUniqueOrThrow({ where: { id: saleReceiptId }, include: { allocations: true } });
  assert.equal(saleReceipt.partyId, sale.partyId);
  assert.deepEqual(saleReceipt.allocations.map(({ documentId, amount }) => [documentId, amount]), [[saleId, 24500n]]);

  const splitReceiptId = await post(owner, "payment", {
    kind: "receipt", amount: "245", accountId: account.id, at: "2025-11-17",
    allocations: [{ documentId: sameNameSaleId, amount: "100" }, { documentId: sameNameSaleId, amount: "145" }],
  });
  const released = await db.allocation.findFirstOrThrow({ where: { paymentId: splitReceiptId, amount: 10000n } });
  await post(owner, "unallocate", { id: released.id, reason: "Correction to allocation" });
  await post(owner, "allocate", { id: splitReceiptId, allocations: [{ documentId: sameNameSaleId, amount: "100" }] });
  const reallocatedReceipt = await readReceipt(splitReceiptId);
  assert.match(reallocatedReceipt, /Allocation released/);
  assert.match(reallocatedReceipt, /Invoice total<\/dt><dd><bdi>EGP\s*245\.00/);
  assert.match(reallocatedReceipt, /Amount paid<\/dt><dd><bdi>EGP\s*245\.00/);
  assert.doesNotMatch(reallocatedReceipt, /Total received|345\.00/);

  const saleLine = await db.line.findFirstOrThrow({ where: { documentId: saleId } });
  const saleCredit = await post(owner, "credit", {
    sourceId: saleId, reason: "Counter return QA", lines: [{ sourceId: saleLine.id, quantity: "1", disposition: "none" }],
  });
  const refundPage = await fetch(base + "/record/" + saleCredit, { headers: { Cookie: owner } });
  assert.match(await refundPage.text(), /Record refund/);
  await post(owner, "payment", { kind: "refund", accountId: account.id, amount: "122.50", note: "Return QA",
    allocations: [{ documentId: saleCredit, amount: "122.50" }] });
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: saleReceiptId } })).reversedAt, null);
  const settledInvoice = await fetch(base + "/print/record/" + saleId + "?lang=en", { headers: { Cookie: owner } });
  const settledHtml = await settledInvoice.text();
  assert.match(settledHtml, /Credits issued.*122\.50/);
  assert.match(settledHtml, /Remaining balance.*0\.00/);

  const heldJob = await post(technician, "jobIntake", {
    partyId, vehicleId, jobMode: "stay", at: "2025-11-17", receivedBy: "Billing QA",
    services: ["installation", "inspection", "tuning", "other"],
  });
  const checkout = { visitId: heldJob, servicePrices: { tuning: "400", other: "200" }, amount: "300", accountId: account.id, at: "2025-11-18" };
  const beforeDelivery = await action(owner, "visitReceipt", checkout);
  assert.equal(beforeDelivery.status, 422);
  assert.equal((await beforeDelivery.json()).error, "finishBeforeBilling");
  await post(technician, "jobUpdate", { id: heldJob, version: 0, status: "delivered", deliveryDate: "2025-11-19" });
  const earlyInvoice = await action(owner, "visitReceipt", checkout);
  assert.equal(earlyInvoice.status, 422);
  assert.equal((await earlyInvoice.json()).error, "invalidInvoiceDate");
  assert.equal(await db.document.count({ where: { sourceId: heldJob, kind: "invoice" } }), 0);
  for(const invoiceDiscount of ["-1","600.01","hello"]){
    const rejected=await action(owner,"visitReceipt",{...checkout,at:"2025-11-19",invoiceDiscount});
    assert.equal(rejected.status,422);
    assert.equal((await rejected.json()).error,"invalidInvoiceDiscount");
  }
  const heldReceipt = await post(owner, "visitReceipt", { ...checkout, at: "2025-11-19",invoiceDiscount:"٦٠٫٠١" });
  const heldInvoice = await db.document.findFirstOrThrow({ where: { sourceId: heldJob, kind: "invoice" },include:{lines:{orderBy:{position:"asc"}}} });
  assert.equal(heldInvoice.total, 53999n);
  assert.deepEqual(heldInvoice.lines.map(({discount,total})=>[discount,total]),[[4001n,35999n],[2000n,18000n]]);
  assert.equal((await db.allocation.findFirstOrThrow({ where: { documentId: heldInvoice.id, paymentId: heldReceipt } })).amount, 30000n);
  const discountedReceipt=await readReceipt(heldReceipt);
  assert.match(discountedReceipt,/Discount<\/dt><dd><bdi>EGP\s*60\.01/);
  assert.ok(!discountedReceipt.includes(account.name), "The discounted receipt should omit the payment account name.");

  const employeeId = await post(owner, "employee", {
    name: "Weekly payroll QA " + randomUUID().slice(0, 8), startedAt: "2025-11-15", weeklySalary: "3000", paidDaysPerWeek: 6,
  });
  const weekEnding = "2025-11-22";
  const nextWeek = "2025-11-29";
  const forWeek = { employeeId, weekEnding, at: weekEnding };
  const advance = { ...forWeek, kind: "advance", amount: "600", accountId: account.id, periodId: "" };
  assert.equal((await action(technician, "weeklyPayroll", advance)).status, 403);
  const advanceKey = randomUUID();
  const advanceId = await post(accountant, "weeklyPayroll", advance, advanceKey);
  assert.equal(await post(accountant, "weeklyPayroll", advance, advanceKey), advanceId);
  assert.equal((await action(owner, "weeklyPayroll", { ...advance, weekEnding: "2025-11-21" })).status, 422);
  const period = await db.document.findFirstOrThrow({where:{employeeId,kind:"payroll",reference:weekEnding}});
  const deduction = { ...forWeek, kind: "deduction", amount: "200", note: "Approved deduction", periodId: period.id };
  await post(accountant, "weeklyPayroll", deduction);
  const settleWeek = { ...forWeek, kind: "salaryPayment", accountId: account.id, periodId: period.id };
  assert.equal((await action(owner, "weeklyPayroll", { ...settleWeek, expectedBalance: "240000" })).status, 409);

  const absence = { employeeId, action: "mark", day: nextWeek };
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

  const pendingEmployeeId = await post(owner,"employee",{name:"Payroll setup QA "+randomUUID().slice(0,8),startedAt:"2025-11-17"});
  assert.equal((await db.employee.findUniqueOrThrow({where:{id:pendingEmployeeId}})).paidDaysPerWeek,6);
  const pendingId = await post(owner,"employeeAbsence",{employeeId:pendingEmployeeId,action:"mark",day:weekEnding});
  assert.equal((await db.employeeAbsence.findUniqueOrThrow({where:{id:pendingId}})).deductionEntryId,null);
  const firstPayout = {
    employeeId:pendingEmployeeId,kind:"salaryPayment",weekEnding,at:weekEnding,
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

  const rollEmployeeId = await post(owner,"employee",{name:"Payroll week QA "+randomUUID().slice(0,8),startedAt:"2025-11-17",weeklySalary:"3000"});
  const bookedWeek = {employeeId:rollEmployeeId,weekEnding,at:weekEnding,accountId:account.id};
  const beforePay = await post(owner,"weeklyPayroll",{...bookedWeek,kind:"advance",amount:"600"});
  const firstPeriod = await db.document.findFirstOrThrow({where:{employeeId:rollEmployeeId,kind:"payroll",reference:weekEnding}});
  assert.equal((await db.allocation.findFirstOrThrow({where:{paymentId:beforePay}})).documentId,firstPeriod.id);
  await post(owner,"weeklyPayroll",{...bookedWeek,kind:"salaryPayment"});

  const rejectedAdvance = await action(owner,"weeklyPayroll",{...bookedWeek,kind:"advance",amount:"400"});
  assert.equal(rejectedAdvance.status,422);
  assert.equal((await rejectedAdvance.json()).error,"advanceWeekPaid");
  assert.equal(await db.document.count({where:{employeeId:rollEmployeeId,kind:"payroll",reference:nextWeek}}),0);

  const sameWeekDeduction = await post(owner,"weeklyPayroll",{...bookedWeek,kind:"deduction",amount:"200",note:"Deduction after pay"});
  assert.equal(sameWeekDeduction,firstPeriod.id);
  const deductionReview = await db.payrollExcess.findFirstOrThrow({where:{documentId:firstPeriod.id,voidedAt:null,note:"Deduction after pay"}});
  assert.equal(deductionReview.remaining,20000n);
  await post(owner,"resolvePayrollExcess",{id:deductionReview.id,expectedBalance:"20000",reason:"No balance this week",resolution:"waive"});

  const rolledAbsence = await post(owner,"employeeAbsence",{employeeId:rollEmployeeId,action:"mark",day:weekEnding});
  const absenceAfterPay = await db.employeeAbsence.findUniqueOrThrow({where:{id:rolledAbsence},include:{deductionEntry:true}});
  assert.equal(absenceAfterPay.deductionEntryId,null);
  assert.equal(await db.document.count({where:{employeeId:rollEmployeeId,kind:"payroll",reference:nextWeek}}),0);
  assert.equal((await db.document.findUniqueOrThrow({where:{id:firstPeriod.id}})).total,300000n);
  await post(owner,"employeeAbsence",{employeeId:rollEmployeeId,action:"undo",day:weekEnding});
  assert.equal(await db.payrollExcess.count({where:{documentId:firstPeriod.id,voidedAt:null,remaining:{gt:0}}}),0);

  const deferredEmployee = await post(owner,"employee",{name:"Deferred absence QA "+randomUUID().slice(0,8),startedAt:"2025-11-17",weeklySalary:"3000"});
  const deferredWeek = {...bookedWeek,employeeId:deferredEmployee};
  const earlyAdvance = await post(owner,"weeklyPayroll",{...deferredWeek,kind:"advance",amount:"200"});
  await setWeeklySalary(deferredEmployee,"");
  const firstSalary = await post(owner,"weeklyPayroll",{...deferredWeek,kind:"salaryPayment"});
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:firstSalary}})).amount,280000n);
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:earlyAdvance}})).amount,20000n);
  const deferredId = await post(owner,"employeeAbsence",{employeeId:deferredEmployee,action:"mark",day:nextWeek});
  assert.equal((await db.employeeAbsence.findUniqueOrThrow({where:{id:deferredId}})).deductionEntryId,null);
  await setWeeklySalary(deferredEmployee,"3600");
  const nextPayout = {...deferredWeek,weekEnding:nextWeek,at:nextWeek,kind:"salaryPayment"};
  assert.equal((await action(owner,"weeklyPayroll",{...nextPayout,expectedWeeklySalary:"300000"})).status,409);
  const deferredPayout = await post(owner,"weeklyPayroll",nextPayout);
  assert.equal((await db.payment.findUniqueOrThrow({where:{id:deferredPayout}})).amount,300000n);
  assert.ok((await db.employeeAbsence.findUniqueOrThrow({where:{id:deferredId}})).deductionEntryId);
  const creditedInvoice = await chargeVisit("2025-11-20", vehicleId, "100", "Credit badge QA");
  await post(owner, "credit", { sourceId: creditedInvoice, amount: "30", reason: "Partial credit QA" });
  const creditedPage = await fetch(base + "/record/" + creditedInvoice, { headers: { Cookie: owner } });
  assert.match(await creditedPage.text(), /Partially paid/);

  const supplierId = await post(owner, "supplier", { name: "Duplicate SKU test " + randomUUID() });
  const rejectedPurchase = await action(owner, "purchase", { partyId: supplierId, reference: "Duplicate SKU test",
    lines: [{ kind: "part", productSource: "manual", description: "Conflicting product", code: part.code,
      quantity: "1", price: "50", sellingPrice: "75" }] });
  assert.equal(rejectedPurchase.status, 409);
  assert.equal((await rejectedPurchase.json()).error, "duplicatePartCode");
  assert.equal(await db.document.count({ where: { partyId: supplierId, kind: "purchase" } }), 0);

  console.log("PASS receipt, counter sale and stock transactions, weekly payroll, advance and deduction rollover, absences, undo, and dismissal.");
} finally { await db.$disconnect(); }

