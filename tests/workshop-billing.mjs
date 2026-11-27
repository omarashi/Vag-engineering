import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { postAction, signIn } from "./support/http.mjs";
import { launchBrowser } from "./support/browser.mjs";

const base = process.env.TEST_URL;
if (!base || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw Error("Use the isolated test instance and database.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const owner = await signIn(base, "owner");
const technician = await signIn(base, "technician");
const at = "2025-11-17";
const suffix = randomUUID().slice(0, 8);

async function save(name, data, key) {
  const response = await postAction(base, owner, name, data, key);
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).id;
}
async function html(path, session = owner, status = 200) {
  const response = await fetch(base + path, { headers: { Cookie: session } });
  assert.equal(response.status, status, path);
  return response.text();
}
function moneyRow(body, label, value) {
  assert.match(body, new RegExp(label + "</(?:strong|dt|small)>\\s*<(?:(?:dd|b)><)?bdi>EGP\\s*" + value.replaceAll(".", "\\.") + "</bdi>"));
}

try {
  const supplierName = "Private import vendor " + suffix;
  const supplierId = await save("supplier", { name: supplierName });
  const duplicate = await postAction(base, owner, "supplier", { name: supplierName.toUpperCase() });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "duplicateSupplier");
  const archivedSupplier = await save("supplier", { name: supplierName, archived: true });
  const restoreDuplicate = await postAction(base, owner, "supplier", { id: archivedSupplier, version: 0, name: supplierName, archived: false });
  assert.equal(restoreDuplicate.status, 409);
  const partyId = await save("customer", { name: "Billing QA " + suffix });
  const vehicleId = await save("vehicle", { partyId, make: "Audi", model: "A3" });
  const name = "Audi A3 electronic module " + suffix;
  const importItems = [{ name, supplierId, quantity: "1", buyingPrice: "1400", sellingPrice: "3500" }];
  const intake = { partyId, vehicleId, jobMode: "quick", at, receivedBy: "QA employee", services: ["maintenance", "other"], importRequested: true };
  assert.equal((await postAction(base, technician, "jobIntake", { ...intake, importItems })).status, 403);
  const stockBefore = await db.part.count();

  const visitId = await save("jobIntake", { ...intake, workshopCharges: { generalLabor: "1500", electricalWork: "2500", electricalLabor: "1200" },
    importItems: [...importItems, { ...importItems[0], name: "Removed item " + suffix }] });
  assert.deepEqual((await db.document.findUniqueOrThrow({ where: { id: visitId } })).metadata.workshopCharges,
    { generalLabor: "1500.00", electricalLabor: "3700.00" });
  const draftReport = await html("/imports?party=" + supplierId);
  assert.ok(draftReport.includes(name) && draftReport.includes("Recorded"));
  assert.ok((await html("/electrical-work?vehicle=" + vehicleId)).includes("Work orders awaiting invoice"));
  await save("jobIntake", { ...intake, id: visitId, version: 0, importItems, workshopCharges: {
    generalLabor: "١٥٠٠", electricalWork: "2500", electricalLabor: "1400",
  }});

  const account = await db.moneyAccount.findFirstOrThrow({ where: { kind: "cash", archived: false } });
  const key = randomUUID();
  const checkout = { visitId, visitVersion: 1, at, accountId: account.id, amount: "4000", servicePrices: { other: "1000" },
    workshopCharges: { generalLabor: "1500", electricalWork: "2500", electricalLabor: "1500" } };
  const receiptId = await save("visitReceipt", checkout, key);
  assert.equal(await save("visitReceipt", checkout, key), receiptId);
  const invoice = await db.document.findFirstOrThrow({ where: { sourceId: visitId, kind: "invoice" }, include: { lines: { orderBy: { position: "asc" } } } });
  assert.equal(invoice.total, 1_000_000n);
  assert.deepEqual(invoice.lines.map((line) => line.purpose), [null, "importedItem", "generalLabor", "electricalLabor"]);
  assert.equal(invoice.lines[3].total, 400000n);
  const item = invoice.lines[1];
  assert.deepEqual([item.description, item.supplierId, item.supplierName, item.buyingPrice, item.costTotal, item.total, item.partId],
    [name, supplierId, supplierName, 140000n, 140000n, 350000n, null]);
  assert.equal(await db.part.count(), stockBefore);
  assert.equal(await db.stockMovement.count({ where: { documentId: invoice.id } }), 0);
  assert.equal(await db.document.count({ where: { partyId: supplierId, kind: "purchase" } }), 0);

  const printable = "/print/record/" + invoice.id + "?lang=en";
  const customerReceipt = "/print/payment/" + receiptId + "?lang=en";
  assert.match(await html(printable), /On credit/);
  for (const path of [printable, customerReceipt, "/record/" + invoice.id, "/payment/" + receiptId]) {
    const page = await html(path);
    moneyRow(page, "Remaining balance", "6,000.00");
    moneyRow(page, "Amount paid", "4,000.00");
  }
  assert.doesNotMatch(await html(customerReceipt), /<dt>(?:Total|Paid)<\/dt>/);
  assert.match(await html(customerReceipt), /Payment type<\/dt><dd>On credit<\/dd>/);
  const printed = await html(printable);
  assert.ok(printed.includes("<td><bdi>Import</bdi></td>"));
  assert.ok(printed.indexOf(name) < printed.indexOf("General labor"));
  assert.ok(printed.indexOf("Electrical labor") < printed.indexOf("Invoice total"));
  assert.ok(!printed.includes("Electrical work"));
  assert.ok(!printed.includes(supplierName) && !printed.includes("importedItem"));
  for (const path of [printable, customerReceipt]) {
    const arabic = await html(path.replace("lang=en", "lang=ar"));
    assert.ok(arabic.includes("مصنعيات كهرباء") && arabic.includes("المتبقي"));
    assert.ok(arabic.includes("<td><bdi>استيراد</bdi></td>"));
    assert.ok(arabic.includes("<td><bdi>أجر العمال</bdi></td>"));
    assert.ok(!arabic.includes(supplierName) && !arabic.includes("importedItem"));
  }

  const laterVisit = await save("jobIntake", { ...intake, importRequested: false });
  const laterInvoice = await save("visitInvoice", { visitId: laterVisit, at, servicePrices: { other: "750" } });
  const collect = (amount) => save("payment", { kind: "receipt", invoiceId: invoice.id, amount, at, accountId: account.id });
  const secondReceipt = await collect("3000");
  moneyRow(await html(printable), "Remaining balance", "3,000.00");
  moneyRow(await html(customerReceipt), "Remaining balance", "6,000.00");
  const secondPrint = await html("/print/payment/" + secondReceipt + "?lang=en");
  moneyRow(secondPrint, "Balance before payment", "6,000.00");
  moneyRow(secondPrint, "Paid this time", "3,000.00");
  moneyRow(secondPrint, "Remaining balance", "3,000.00");
  moneyRow(await html("/print/record/" + laterInvoice + "?lang=en"), "Remaining balance", "750.00");
  assert.equal(await db.allocation.count({ where: { documentId: laterInvoice } }), 0);

  const electrical = invoice.lines[3];
  const lineCredit = (line, amount) => save("credit", { sourceId: invoice.id, at, reason: "Billing QA adjustment",
    lines: [{ sourceId: line.id, amount, disposition: "none" }] });
  const electricalCredit = await lineCredit(electrical, "600");
  assert.equal((await db.line.findFirstOrThrow({ where: { documentId: electricalCredit } })).purpose, "electricalLabor");
  moneyRow(await html(printable), "Remaining balance", "2,400.00");
  const finalReceipt = await collect("2400");
  const finalPrint = await html("/print/payment/" + finalReceipt + "?lang=en");
  moneyRow(finalPrint, "Balance before payment", "2,400.00");
  moneyRow(finalPrint, "Paid this time", "2,400.00");
  moneyRow(finalPrint, "Remaining balance", "0.00");
  assert.match(finalPrint, /Payment type<\/dt><dd>Fully paid<\/dd>/);
  const arabicFinal = await html("/print/payment/" + finalReceipt + "?lang=ar");
  assert.match(arabicFinal, /نوع الدفع<\/dt><dd>مدفوع كاملا<\/dd>/);
  const importCredit = await lineCredit(item, "500");
  const refund = await save("payment", { kind: "refund", accountId: account.id, at, amount: "500", note: "Billing QA refund",
    allocations: [{ documentId: importCredit, amount: "500" }] });
  moneyRow(await html(printable), "Remaining balance", "0.00");
  moneyRow(await html(printable), "Amount paid", "8,900.00");
  await save("reversePayment", { id: refund, at, reason: "Refund reversal QA" });
  moneyRow(await html(printable), "Amount paid", "9,400.00");

  const vendor = await db.party.findUniqueOrThrow({ where: { id: supplierId } });
  await save("supplier", { id: supplierId, version: vendor.version, name: "Renamed vendor " + suffix });
  const imported = await html("/imports?" + new URLSearchParams({ party: supplierId, q: name, from: at, to: at }));
  assert.ok(imported.includes(name) && imported.includes(supplierName));
  assert.match(imported, /Gross profit<\/small><b><bdi>EGP\s*1,600\.00/);
  const electricalPage = await html("/electrical-work?vehicle=" + vehicleId + "&from=" + at + "&to=" + at);
  assert.equal((electricalPage.match(new RegExp('<a\\b[^>]*\\bhref="/record/' + invoice.id + '"', "g")) ?? []).length, 1);
  moneyRow(electricalPage, "Electrical labor", "3,400.00");
  assert.doesNotMatch(electricalPage, /<th\b[^>]*>Electrical work<\/th>/);
  assert.ok(!electricalPage.includes('/record/' + laterInvoice));
  await html("/imports", technician, 404);
  await html("/electrical-work", technician, 404);
  assert.equal((await postAction(base, owner, "jobIntake", { ...intake, id: visitId, version: 2, importItems })).status, 409);

  const reversable = await save("jobIntake", { ...intake, importRequested: false, workshopCharges: { electricalLabor: "25" } });
  const reversed = await save("visitInvoice", { visitId: reversable, at, servicePrices: { other: "0" } });
  await save("reverseDocument", { id: reversed, at, reason: "Invoice reversal QA" });
  moneyRow(await html("/electrical-work?vehicle=" + vehicleId), "Electrical labor", "3,400.00");
  const cancelled = await save("jobIntake", { ...intake, jobMode: "stay", importItems });
  await save("jobUpdate", { id: cancelled, version: 0, status: "cancelled", reason: "Draft import cancelled" });
  assert.equal((await postAction(base, owner, "visitInvoice", { visitId: cancelled, at })).status, 422);

  const { importRequested, ...jobFields } = intake;
  const services = ["generalLabor", "electricalWork", "electricalLabor", "importedItem"];
  const checklist = { ...jobFields, services, billingChecklist: true };
  assert.equal((await postAction(base, owner, "jobIntake", { ...checklist, importRequested })).status, 422);
  const unpriced = await save("jobIntake", checklist);
  const saved = await db.document.findUniqueOrThrow({ where: { id: unpriced } });
  assert.deepEqual(saved.metadata.workshopBillingSelection, ["generalLabor", "electricalLabor", "importedItem"]);
  assert.deepEqual(saved.metadata.workshopCharges, {});
  assert.deepEqual(saved.metadata.importItems, []);
  assert.equal((await postAction(base, owner, "visitInvoice", { visitId: unpriced, at })).status, 422);
  assert.equal((await postAction(base, owner, "visitInvoice", { visitId: unpriced, at,
    workshopCharges: { generalLabor: "100", electricalWork: "100", electricalLabor: "0" } })).status, 422);
  await save("jobIntake", { ...checklist, id: unpriced, version: 0, services: ["electricalLabor"] });
  const draft = await db.document.findUniqueOrThrow({ where: { id: unpriced } });
  // Simulate an unbilled work order saved before the categories were merged.
  await db.document.update({ where: { id: unpriced }, data: { metadata: {
    ...draft.metadata, workshopBillingSelection: ["electricalWork", "electricalLabor"],
    workshopCharges: { electricalWork: "40.25", electricalLabor: "59.75" },
  } } });
  const laborOnly = await save("visitInvoice", { visitId: unpriced, at });
  const laborLines = await db.line.findMany({ where: { documentId: laborOnly } });
  assert.deepEqual(laborLines.map(({ purpose, total }) => [purpose, total]), [["electricalLabor", 10000n]]);
  // Model the original line split on a historical posted invoice.
  const [laborLine] = laborLines;
  const [legacyWork] = await db.$transaction([
    db.line.create({ data: { documentId: laborOnly, purpose: "electricalWork", kind: "service",
      description: "Electrical work", price: 4025n, total: 4025n, quantity: 1, position: laborLine.position + 1 } }),
    db.line.update({ where: { id: laborLine.id }, data: { price: 5975n, total: 5975n } }),
  ]);
  await save("credit", { sourceId: laborOnly, at, reason: "Historical electrical adjustment",
    lines: [{ sourceId: legacyWork.id, amount: "10", disposition: "none" }] });
  const history = await db.document.findUniqueOrThrow({ where: { id: laborOnly } });
  const historicalReport = await html("/electrical-work?" + new URLSearchParams({ q: history.number }));
  moneyRow(historicalReport, "Electrical labor", "90.00");
  assert.equal((historicalReport.match(new RegExp('<a\\b[^>]*\\bhref="/record/' + laborOnly + '"', "g")) ?? []).length, 1);
  assert.ok((await html("/print/record/" + laborOnly + "?lang=en")).includes("Electrical work"));

  const receiver = "Billing receiver " + suffix;
  await save("employee", { name: receiver, startedAt: at });
  const secondSupplierName = "Second import vendor " + suffix;
  const secondSupplier = await save("supplier", { name: secondSupplierName });
  const secondItem = "Second import item " + suffix;
  const secondJob = await save("jobIntake", { ...jobFields, services: ["importedItem"], billingChecklist: true });
  await save("visitInvoice", { visitId: secondJob, at,
    importItems: [{ name: secondItem, supplierId: secondSupplier, quantity: "1", buyingPrice: "600", sellingPrice: "1000" }] });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(10_000);
    const login = await page.request.post(base + "/api/auth/sign-in/username", {
      headers: { Origin: base }, data: { username: "owner", password: "Demo-Workshop-2026!" },
    });
    assert.equal(login.status(), 200);
    await page.goto(base + "/imports?from=" + at + "&to=" + at);
    const bySupplier = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Import sales by supplier" }) });
    const firstVendorRow = bySupplier.getByRole("row").filter({ hasText: "Renamed vendor " + suffix });
    assert.match(await firstVendorRow.innerText(), /3,000\.00[\s\S]*1,400\.00[\s\S]*1,600\.00/);
    const secondVendorRow = bySupplier.getByRole("row").filter({ hasText: secondSupplierName });
    assert.match(await secondVendorRow.innerText(), /1,000\.00[\s\S]*600\.00[\s\S]*400\.00/);
    await secondVendorRow.getByRole("link", { name: secondSupplierName }).click();
    await page.waitForURL((url) => url.searchParams.get("party") === secondSupplier && url.searchParams.get("from") === at);
    await page.getByText(secondItem, { exact: true }).waitFor();
    assert.equal(await page.getByText(name, { exact: true }).count(), 0);
    await page.goto(base + "/vehicles/" + vehicleId);
    await page.getByRole("button", { name: "New job", exact: true }).click();
    const newJob = page.getByRole("dialog", { name: "New job", exact: true });
    await newJob.getByRole("radio", { name: /Quick job/ }).check();
    await newJob.getByLabel("Received by").selectOption(receiver);
    await newJob.getByLabel("Date received").fill(at);
    const serviceList = newJob.getByRole("group", { name: "Services" });
    for (const name of ["Routine maintenance", "Dyno", "General labor", "Electrical labor", "Import"]) {
      await serviceList.getByRole("checkbox", { name, exact: true }).check();
    }
    assert.equal(await serviceList.getByRole("checkbox", { name: "Electrical work", exact: true }).count(), 0);
    assert.equal(await newJob.locator('input[name="generalLabor"], input[name="electricalWork"], input[name="electricalLabor"]').count(), 0);
    assert.equal(await newJob.getByLabel("Details for Import").count(), 0);
    assert.equal(await newJob.getByLabel("Buying price", { exact: true }).count(), 0);
    await newJob.getByRole("button", { name: "Save and take payment" }).click();
    const editor = page.getByRole("dialog", { name: "Create invoice and take payment" });
    await editor.getByRole("region", { name: "Work done" }).getByText("Routine maintenance", { exact: true }).waitFor();
    assert.equal(await editor.getByLabel("Price for Routine maintenance").count(), 0);
    await editor.getByLabel("Price for Dyno", { exact: true }).fill("250");
    await editor.getByLabel("General labor", { exact: true }).fill("300");
    await editor.getByLabel("Electrical labor", { exact: true }).fill("100");
    assert.equal(await editor.getByLabel("Electrical work", { exact: true }).count(), 0);
    assert.equal(await editor.getByRole("checkbox", { name: "Import", exact: true }).count(), 0);
    await editor.getByRole("button", { name: "Add imported item" }).click();
    await editor.getByLabel("Product name").fill("Mobile import " + suffix);
    await editor.getByRole("group", { name: "Imported items" }).getByRole("combobox").selectOption(supplierId);
    await editor.getByLabel("Buying price", { exact: true }).fill("1400");
    await editor.getByLabel("Selling price", { exact: true }).fill("3500");
    assert.match(await editor.locator("output").textContent(), /4,150\.00/);
    const phoneJob = new URL(page.url()).pathname.split("/").at(-1);
    await editor.getByLabel("Amount paid (EGP)").fill("4150");
    await editor.getByLabel("Receive payment via").selectOption({ index: 1 });
    await editor.getByRole("button", { name: "Save invoice and receipt" }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/payment/"));
    const mobileInvoice = await db.document.findFirstOrThrow({ where: { sourceId: phoneJob, kind: "invoice" } });
    assert.equal(mobileInvoice.total, 415000n);
    const dyno = await db.line.findFirstOrThrow({ where: { documentId: mobileInvoice.id, description: "Dyno" } });
    assert.deepEqual([dyno.kind, dyno.total], ["service", 25000n]);
    const receiptUrl = "/print" + new URL(page.url()).pathname;
    assert.match(await html(receiptUrl + "?lang=en"), /<span>Dyno<\/span>/);
    assert.match(await html(receiptUrl + "?lang=ar"), /<span>دينو<\/span>/);
  } finally {
    await browser.close();
  }

  console.log("PASS workshop charges, imported items, supplier privacy, independent balances, partial credits, refunds, report totals and role permissions");
} finally {
  await db.$disconnect();
}
