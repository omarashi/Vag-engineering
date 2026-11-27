import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { postAction, signIn } from "./support/http.mjs";

const base = process.env.TEST_URL;
if (!base || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw Error("Use the isolated test instance and database.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
const sample = "Role QA " + randomUUID().slice(0, 8);

const login = (username, password, permitted) => signIn(base, username, password, permitted);

function get(session, path) {
  return fetch(base + path, { headers: { Cookie: session }, redirect: "manual" });
}

async function page(session, path, status = 200) {
  const response = await get(session, path);
  assert.equal(response.status, status, path);
  return response.text();
}

async function action(session, name, data, status = 200, key = randomUUID()) {
  const response = await postAction(base, session, name, data, key);
  const result = await response.json();
  assert.equal(response.status, status, `${name}: ${JSON.stringify(result)}`);
  return result;
}

async function attach(session, target, status) {
  const body = new FormData();
  body.append("type", "document");
  body.append("target", target);
  body.append("file", new Blob(["%PDF-1.4\nRole test\n"], { type: "application/pdf" }), "role-test.pdf");
  const response = await fetch(base + "/api/attachments", { method: "POST", headers: { Origin: base, Cookie: session }, body });
  assert.equal(response.status, status, await response.text());
  if (status === 201) return (await db.attachment.findFirstOrThrow({ where: { documentId: target }, orderBy: { at: "desc" } })).id;
}

try {
  const owner = await login("owner");
  const accountant = await login("accountant");
  const username = `worker-${sample.slice(-8)}`;
  const password = `Initial-${randomUUID()}`;
  const loginProfile = { name: sample + " Technician", username, role: "technician", password, active: true };
  const settingsPage = await page(owner, "/settings");
  assert.match(settingsPage, /Add user/);
  assert.match(settingsPage, /Username/);
  const emailSignIn = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST", headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@vag-demo.test", password: "Demo-Workshop-2026!" }),
  });
  assert.equal(emailSignIn.status, 404);
  await page(owner, "/audit");
  for (const name of ["settings", "user", "account", "catalogue"]) await action(accountant, name, loginProfile, 403);
  for (const path of ["/settings", "/audit"]) await page(accountant, path, 404);
  assert.doesNotMatch(await page(accountant, "/more"), /href="\/(settings|audit)"/);
  assert.equal((await action(owner, "user", { ...loginProfile, username: "name@example.test" }, 422)).error, "invalidUsername");
  const { id: userId } = await action(owner, "user", loginProfile);
  assert.equal((await action(owner, "user", { ...loginProfile, username: username.toUpperCase() }, 409)).error, "duplicateUsername");
  const technician = await login(" " + username.toUpperCase() + " ", password);
  const editLogin = async (changes) => {
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return action(owner, "user", { id: row.id, name: row.name, username: row.username, role: row.role, active: row.active, updatedAt: row.updatedAt, ...changes });
  };
  const ownerAccount = await db.user.findUniqueOrThrow({ where: { username: "owner" } });
  for (const changes of [{ active: false }, { role: "accountant" }]) {
    const { error } = await action(owner, "user", { id: ownerAccount.id, updatedAt: ownerAccount.updatedAt,
      name: ownerAccount.name, username: ownerAccount.username, role: "owner", active: true, ...changes }, 422);
    assert.equal(error, "lastOwner");
  }

  const { id: employeeId } = await action(accountant, "employee", { name: sample, startedAt: day, weeklySalary: "3000" });
  await action(accountant, "employeeAbsence", { employeeId, action: "mark" });
  await action(accountant, "employeeDismiss", { id: employeeId, version: 0, endedAt: day, reason: "Test" }, 403);
  await action(accountant, "employee", { id: employeeId, version: 0, name: sample, endedAt: day, archived: true }, 403);
  assert.doesNotMatch(await page(accountant, "/payroll/" + employeeId), /Dismiss employee|name="endedAt"/);
  assert.match(await page(owner, "/payroll/" + employeeId), /Dismiss employee/);

  assert.doesNotMatch(await page(technician, "/more"), /href="\/(payroll|purchasing|inventory|cash|reports|settings|audit)"/);
  assert.doesNotMatch(await page(technician, "/overview"), /href="\/debts"|Outstanding customer balances/);
  const { id: partId } = await action(owner, "part", { code: sample, name: sample + " filter", price: "177.32", cost: "91.35" });
  await action(owner, "stock", { partId, kind: "adjustment", quantity: "4", reason: "Role test" });
  await action(technician, "part", { id: partId, price: "1" }, 403);
  const { id: partyId } = await action(technician, "customer", { name: sample });
  const { id: vehicleId } = await action(technician, "vehicle", { partyId, make: "Audi", model: "A3" });
  const { id: jobId } = await action(technician, "jobIntake", { partyId, vehicleId, jobMode: "stay", receivedBy: sample,
    at: day, services: ["maintenance"], serviceDetails: { maintenance: "Replaced filter" }, parts: [{ partId, quantity: "1" }] });
  const jobPath = "/jobs/" + jobId;
  assert.doesNotMatch(await page(accountant, "/jobs/billing?party=" + partyId), new RegExp(jobPath));
  await action(technician, "jobUpdate", { id: jobId, version: 0, status: "inProgress", work: "Checked oil level" });
  await action(technician, "jobUpdate", { id: jobId, version: 1, status: "delivered", deliveryDate: day });
  const jobScreen = await page(technician, jobPath);
  assert.match(jobScreen, /Replaced filter/);
  assert.match(jobScreen, /Checked oil level/);
  assert.match(jobScreen, /Parts used/);
  assert.doesNotMatch(jobScreen, /177\.32|17732|91\.35|Create invoice|Record a receipt|Save and take payment|Print A4/);
  assert.doesNotMatch(await page(technician, "/customers/" + partyId), /Outstanding balance|href="\/receipts/);
  await page(technician, "/jobs/billing", 404);
  assert.match(await page(accountant, "/jobs/billing?party=" + partyId), new RegExp(jobPath));
  assert.match(await page(accountant, jobPath), /Create invoice and take payment/);

  const drawer = await db.moneyAccount.findFirstOrThrow({ where: { kind: "cash", archived: false } });
  const payment = { visitId: jobId, visitVersion: 2, at: day, accountId: drawer.id, method: "cash", servicePrices: { maintenance: "100" }, amount: "277.32" };
  await action(technician, "visitReceipt", payment, 403);
  await action(technician, "payment", payment, 403);
  const { id: receiptId } = await action(accountant, "visitReceipt", payment);
  const { id: counterSaleId } = await action(accountant, "invoice", { customerName: sample + " counter customer", at: day,
    lines: [{ kind: "part", partId, quantity: "1", price: "177.32", discount: "7.32" }] });
  const counterSale = await db.document.findUniqueOrThrow({ where: { id: counterSaleId } });
  assert.equal(counterSale.vehicleId, null);
  assert.equal(counterSale.total, 17000n);
  await action(accountant, "customerDebtPayment", { partyId: counterSale.partyId, invoiceId:counterSaleId, amount: "70", at: day, accountId: drawer.id, method: "cash" });
  const invoice = await db.document.findFirstOrThrow({ where: { kind: "invoice", sourceId: jobId } });
  const receiptPath = "/print/payment/" + receiptId + "?lang=en";
  assert.match(await page(accountant, receiptPath), /277\.32/);
  assert.match(await page(owner, receiptPath), /Replaced filter/);
  assert.doesNotMatch(await page(accountant, "/jobs/billing?party=" + partyId), new RegExp(jobPath));
  for (const path of [receiptPath, "/payment/" + receiptId, "/record/" + invoice.id, "/print/record/" + invoice.id,
    "/print/statement/" + partyId]) await page(technician, path, 404);
  await page(technician, "/api/export?report=payments", 403);
  await page(accountant, "/api/export?report=payments", 200);
  const workshopFile = await attach(technician, jobId, 201);
  await page(technician, "/api/attachments/" + workshopFile, 200);
  await attach(technician, invoice.id, 403);
  const invoiceFile = await attach(accountant, invoice.id, 201);
  await page(technician, "/api/attachments/" + invoiceFile, 404);
  await page(accountant, "/api/attachments/" + invoiceFile, 200);

  const replacement = `Reset-${randomUUID()}`;
  await editLogin({ password: replacement });
  await page(technician, "/jobs", 307);
  await login(username, password, false);
  const resetSession = await login(username, replacement);
  const renamed = username + "-2";
  await editLogin({ role: "accountant", username: renamed });
  await page(resetSession, "/jobs", 307);
  assert.equal(await db.user.findUnique({ where: { username } }), null);
  const promoted = await login(renamed, replacement);
  await page(promoted, "/reports");
  const recoveryKey = randomUUID();
  const { id: expenseId } = await action(promoted, "expense", { title: sample, category: "Test", amount: "10", at: day }, 200, recoveryKey);
  assert.equal(JSON.parse(await page(promoted, "/api/requests/" + recoveryKey)).id, expenseId);
  await editLogin({ active: false, role: "technician" });
  await page(promoted, "/jobs", 307);
  assert.equal(await db.session.count({ where: { userId } }), 0);
  await login(renamed, replacement, false);
  await editLogin({ active: true });
  await page(promoted, "/jobs", 307);
  const enabled = await login(renamed, replacement);
  await page(enabled, "/reports", 404);
  await page(enabled, "/api/requests/" + recoveryKey, 404);
  const history = await db.audit.findMany({ where: { action: "user", entityId: userId } });
  assert.equal(history.length, 5);
  assert.ok(history.some(({ after }) => after.passwordReset === true));
  assert.ok(history.some(({ before, after }) => before?.role === "technician" && after.role === "accountant"));
  assert.ok(history.some(({ before, after }) => before?.username === username && after.username === renamed));
  assert.ok(history.some(({ after }) => after.active === false));
  assert.doesNotMatch(JSON.stringify(history), new RegExp(replacement));
  console.log("PASS role navigation, technician-to-accountant billing and print, files, exports, account audit, session revocation, and last Owner protection.");
} finally {
  await db.$disconnect();
}
