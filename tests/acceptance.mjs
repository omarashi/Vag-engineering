import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { postAction, signIn } from "./support/http.mjs";

const base = process.env.TEST_URL;
if (!base) throw Error("Set TEST_URL to the isolated demo instance.");
const cookie = await signIn(base, "technician");
function action(name, data, key = randomUUID(), signed = true) {
  return postAction(base, signed ? cookie : "", name, data, key);
}
async function save(name, data, key) {
  const result = await action(name, data, key);
  assert.equal(result.status, 200, await result.clone().text());
  return (await result.json()).id;
}
const sample = "API " + randomUUID().slice(0, 8);
const partyId = await save("customer", { name: sample + " عميل" });
const otherId = await save("customer", { name: sample + " Other" });
const car = { partyId, make: "Volkswagen", model: "Golf", plate: "ل ج م ٦٥٤" };
const color = "Pearl Blue " + sample;
const vehicleId = await save("vehicle", { ...car, color });
assert.equal(await save("vehicle", { ...car, id: vehicleId, version: 0, note: "Updated by an older car form" }), vehicleId);
const colorSearch = await fetch(base + "/vehicles?" + new URLSearchParams({ q: color }), { headers: { Cookie: cookie } });
const colorSearchHtml=await colorSearch.text();
assert.match(colorSearchHtml,new RegExp("/vehicles/" + vehicleId));
assert.ok(colorSearchHtml.includes(`<strong><bdi>Golf ${color}</bdi></strong>`));
const customerList=await fetch(base+"/customers?"+new URLSearchParams({q:sample}),{headers:{Cookie:cookie}});
assert.match(await customerList.text(),new RegExp("<small><bdi>Golf "+color+"</bdi></small>"));
const info = { partyId, vehicleId, title: sample + " Stage 1", category: "tuning", note: "غيرنا خريطة الموتور", at: "2025-11-17", mileage: "٤٥٠٠٠" };
const key = randomUUID();
const id = await save("visit", info, key);
assert.equal(await save("visit", info, key), id);
assert.equal((await action("visit", { ...info, partyId: otherId })).status, 422);
assert.equal((await action("visit", { ...info, at: "2099-11-17" })).status, 422);
assert.equal((await action("visit", { ...info, services: [] })).status, 422);
assert.equal((await action("visit", { ...info, services: ["tuning", "unknown"] })).status, 422);
const visitsBy = (service) => fetch(base + "/visits?" + new URLSearchParams({ service, q: sample }), { headers: { Cookie: cookie } });
assert.match(await (await visitsBy("tuning")).text(), new RegExp(sample + " Stage 1"));
assert.equal((await action("visit", { ...info, services: ["repair"] })).status, 422);
assert.equal(await save("visit", { ...info, id, version: 0, title: sample + " Stage 2", services: ["tuning", "inspection", "installation"] }), id);
assert.match(await (await visitsBy("inspection")).text(), new RegExp(sample + " Stage 2"));
assert.match(await (await visitsBy("installation")).text(), new RegExp(sample + " Stage 2"));
assert.doesNotMatch(await (await visitsBy("diagnostics")).text(), new RegExp(sample + " Stage 2"));
assert.equal((await action("visit", { ...info, id, version: 0 })).status, 409);
assert.equal((await action("visit", info, randomUUID(), false)).status, 401);
const service = await fetch(base + "/visits/" + id, { headers: { Cookie: cookie } });
assert.equal(service.status, 200);
assert.equal(new URL(service.url).pathname, "/jobs/" + id);
assert.match(await service.text(), /Stage 2/);
const untitled = { partyId, vehicleId, at: info.at, services: ["maintenance", "tuning"],
  serviceDetails: { maintenance: "Replaced the cabin filter" } };
const untitledId = await save("visit", untitled);
const visitHeading = async (id) => {
  const response = await fetch(base + "/visits/" + id, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return (await response.text()).match(/<h1><bdi>([^<]+)<\/bdi><\/h1>/)?.[1];
};
assert.equal(await visitHeading(untitledId), "Routine maintenance, Software tuning");
assert.equal(await save("visit", { ...untitled, id: untitledId, version: 0, services: ["maintenance", "inspection"] }), untitledId);
assert.equal(await visitHeading(untitledId), "Routine maintenance, Inspection");
const detailSearch = await fetch(base + "/visits?q=cabin+FILTER", { headers: { Cookie: cookie } });
assert.match(await detailSearch.text(), new RegExp("/jobs/" + untitledId));
assert.equal(await save("visit", { ...untitled, id, version: 1 }), id);
assert.equal(await visitHeading(id), sample + " Stage 2");
for (const path of ["/appointments", "/quotations"]) {
  assert.equal((await fetch(base + path, { headers: { Cookie: cookie } })).status, 404, path);
}
assert.equal((await action("appointment", {})).status, 404);
for (const removed of ["quote", "quoteApprove", "cashCount"]) assert.equal((await action(removed, {})).status, 404, removed);
const jobId = await save("job", { partyId, vehicleId, title: sample + " Check-in" });
assert.equal((await action("jobUpdate", { id: jobId, version: 0, status: "waitingParts" })).status, 422);
for (const path of ["/more", "/jobs", "/jobs/history", "/jobs/" + jobId, "/overview", "/customers", "/vehicles"]) {
  assert.equal((await fetch(base + path, { headers: { Cookie: cookie } })).status, 200, path);
}
for (const path of ["/receipts", "/invoices", "/jobs/billing", "/inventory", "/purchasing", "/cash", "/cash/transactions", "/balances", "/debts", "/payroll", "/reports", "/business", "/opening", "/audit", "/settings"]) {
  assert.equal((await fetch(base + path, { headers: { Cookie: cookie } })).status, 404, path);
}
assert.equal((await fetch(base + "/jobs/" + id, { headers: { Cookie: cookie } })).status, 200);
assert.equal(await save("jobUpdate", { id: jobId, version: 0, status: "cancelled", reason: "Customer cancelled" }), jobId);
const jobsBy = (path, status) => fetch(base + path + "?" + new URLSearchParams({ q: sample, status }), { headers: { Cookie: cookie } });
const jobLink = new RegExp("/jobs/" + jobId);
assert.doesNotMatch(await (await jobsBy("/jobs", "")).text(), jobLink);
assert.match(await (await jobsBy("/jobs/history", "cancelled")).text(), jobLink);
assert.match(await (await jobsBy("/jobs", "cancelled")).text(), jobLink);
const intake = { partyId, vehicleId, services: ["maintenance", "inspection"], at: info.at, jobMode: "stay", receivedBy: sample + " Nevine" };
assert.equal((await action("jobIntake", { ...intake, receivedBy: " " })).status, 422);
assert.equal((await action("jobIntake", { ...intake, deliveryDate: "2025-11-19" })).status, 422);
const intakeKey = randomUUID();
const intakeId = await save("jobIntake", intake, intakeKey);
assert.equal(await save("jobIntake", intake, intakeKey), intakeId);
const intakeLink = new RegExp("/jobs/" + intakeId);
assert.match(await (await jobsBy("/jobs", "inProgress")).text(), intakeLink);
assert.doesNotMatch(await (await jobsBy("/jobs/history", "")).text(), intakeLink);
assert.equal((await action("jobUpdate", { id: intakeId, version: 0, status: "delivered" })).status, 422);
assert.equal((await action("jobUpdate", { id: intakeId, version: 0, status: "ready" })).status, 422);
const deliver = { id: intakeId, version: 0, status: "delivered", deliveryDate: "2025-11-19" };
assert.equal((await action("jobUpdate", { ...deliver, deliveryDate: "2025-11-16" })).status, 422);
assert.equal((await action("jobUpdate", { ...deliver, deliveryDate: "2099-01-01" })).status, 422);
const deliveryKey = randomUUID();
assert.equal(await save("jobUpdate", deliver, deliveryKey), intakeId);
assert.equal(await save("jobUpdate", deliver, deliveryKey), intakeId);
assert.doesNotMatch(await (await jobsBy("/jobs", "")).text(), intakeLink);
assert.equal((await action("jobIntake", { ...intake, id: intakeId, version: 0 })).status, 409);
assert.match(await (await jobsBy("/jobs/history", "delivered")).text(), intakeLink);
assert.equal((await fetch(base + "/api/export?report=payroll", { headers: { Cookie: cookie } })).status, 403);
console.log("PASS held jobs, direct delivery, retired job statuses, legacy visits, validation, retries, and access scope.");

