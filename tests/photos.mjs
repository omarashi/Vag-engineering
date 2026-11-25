import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, open, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { devices } from "../data/tooling/node_modules/playwright-core/index.mjs";
import { workshopPhotoMaxBytes as maxBytes, workshopPhotoMaxMegabytes } from "../lib/workshop-photo-limits.ts";
import { browserFixtures, launchBrowser } from "./support/browser.mjs";

const base = process.env.TEST_URL;
const database = new URL(process.env.DATABASE_URL);
if (!base || !database.pathname.endsWith("_test")) throw Error("Use the isolated test instance and database.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.href }) });
const browser = await launchBrowser();
const page = await browser.newPage(devices["Pixel 7"]);
const fixture = browserFixtures(page, base);
const directory = await mkdtemp(join(tmpdir(), "vag-photo-test-"));
const largePhoto = join(directory, "large-camera-photo.jpg");

try {
  const login = await page.request.post(base + "/api/auth/sign-in/email", {
    headers: { Origin: base }, data: { email: "owner@vag-demo.test", password: "Demo-Workshop-2026!" },
  });
  assert.equal(login.status(), 200);
  const business = (await db.setting.findUnique({ where: { key: "business" } }))?.value ?? {};
  if (!business.workshopPhotos) await fixture("settings", { ...business, version: business.version ?? 0, name: business.name ?? "VAG Engineering", workshopPhotos: true });
  const partyId = await fixture("customer", { name: "Photo test " + randomUUID() });
  const vehicleId = await fixture("vehicle", { partyId, make: "VW", model: "Golf" });
  await page.goto(base + "/jobs?new=job");
  const newJob = page.getByRole("dialog", { name: "New job" });
  await newJob.getByRole("combobox", { name: "Customer", exact: true }).selectOption(partyId);
  await newJob.getByRole("combobox", { name: "Car", exact: true }).selectOption(vehicleId);
  async function fillIntake() {
    await newJob.getByRole("radio", { name: /Car stays at the shop/ }).check();
    await newJob.getByLabel("Received by").fill("Photo tester");
    await newJob.getByRole("checkbox", { name: "Routine maintenance", exact: true }).check();
  }
  await fillIntake();
  const sample = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4600;
    canvas.height = 3200;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#d45139");
    gradient.addColorStop(1, "#243a54");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
  }), "base64");
  const file = await open(largePhoto, "w");
  try {
    await file.writeFile(sample);
    await file.truncate(200 * 1024 * 1024);
  } finally { await file.close(); }
  const checkIn = newJob.getByRole("group", { name: "Check-in photos (optional)" });
  await checkIn.locator('input[capture="environment"]').setInputFiles(largePhoto);
  await page.route("**/api/attachments", async (route) => {
    assert.equal((await route.fetch()).status(), 201);
    await route.abort();
  }, { times: 1 });
  const intakeRequest = page.waitForResponse((response) => response.url() === base + "/api/actions/jobIntake" && response.ok());
  await newJob.getByRole("button", { name: "Save job", exact: true }).click();
  const { id: jobId } = await (await intakeRequest).json();
  await newJob.getByRole("status").getByText(/Job saved/).waitFor();
  await newJob.getByRole("button", { name: "Retry photo upload" }).click();
  await page.waitForURL((url) => url.pathname === "/jobs/" + jobId);
  assert.equal(await db.document.count({ where: { partyId, kind: "job" } }), 1);
  assert.equal(await db.attachment.count({ where: { documentId: jobId } }), 1);
  await page.getByRole("img", { name: "large-camera-photo.jpg" }).waitFor();
  await page.waitForFunction(() => [...document.images].some((img) => img.alt === "large-camera-photo.jpg" && img.naturalWidth === 2400));

  const oversized = Buffer.alloc(maxBytes + 1024);
  sample.copy(oversized);
  const rejection = await page.request.post(base + "/api/attachments", {
    headers: { Origin: base, "Idempotency-Key": randomUUID() },
    multipart: { type: "document", target: jobId, file: { name: "oversized.jpg", mimeType: "image/jpeg", buffer: oversized } },
  });
  assert.equal(rejection.status(), 413);
  assert.equal((await rejection.json()).error, "photoTooLarge");

  await page.getByRole("button", { name: "Finish job", exact: true }).click();
  const finish = page.getByRole("dialog", { name: "Finish job" });
  const delivery = finish.getByRole("group", { name: "Delivery photos (optional)" });
  const galleryPhoto = process.env.VAG_TEST_HEIC_FILE ?? { name: "gallery.jpg", mimeType: "image/jpeg", buffer: sample };
  await delivery.locator('input[type="file"]:not([capture])').setInputFiles(galleryPhoto);
  await finish.getByRole("button", { name: "Save and take payment", exact: true }).click();
  const checkout = page.getByRole("dialog", { name: "Create invoice and take payment" });
  await checkout.waitFor();
  assert.equal((await db.document.findUniqueOrThrow({ where: { id: jobId } })).status, "delivered");
  assert.equal(await db.attachment.count({ where: { documentId: jobId } }), 2);
  await checkout.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Add photos" }).click();
  const dialog = page.getByRole("dialog", { name: "Add photos" });
  await dialog.locator('input[type="file"]:not([capture])').setInputFiles({ name: "additional.jpg", mimeType: "image/jpeg", buffer: sample });
  const upload = page.waitForResponse((response) => response.url() === base + "/api/attachments" && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  const result = await upload;
  assert.equal(result.status(), 201, await result.text());
  await dialog.waitFor({ state: "hidden" });
  const photos = await db.attachment.findMany({ where: { documentId: jobId } });
  assert.equal(photos.length, 3);
  for (const photo of photos) {
    assert.equal(photo.mime, "image/jpeg");
    assert.ok(photo.size <= maxBytes);
    assert.match(photo.name, /\.jpg$/);
  }

  await page.goto(base + "/vehicles/" + vehicleId + "?new=job");
  await fillIntake();
  await newJob.getByRole("group", { name: "Check-in photos (optional)" }).waitFor();
  await newJob.getByRole("button", { name: "Save job", exact: true }).click();
  await page.waitForURL("**/jobs/**");
  const noPhotoJob = new URL(page.url()).pathname.split("/").at(-1);
  await page.getByRole("button", { name: "Finish job", exact: true }).click();
  await finish.getByRole("group", { name: "Delivery photos (optional)" }).waitFor();
  await finish.getByRole("button", { name: "Save and take payment", exact: true }).click();
  await checkout.waitFor();
  assert.equal(await db.attachment.count({ where: { documentId: noPhotoJob } }), 0);
  assert.equal((await db.document.findUniqueOrThrow({ where: { id: noPhotoJob } })).status, "delivered");

  await page.goto(base + "/vehicles/" + vehicleId + "?new=job");
  await fillIntake();
  await checkIn.locator('input[capture="environment"]').setInputFiles({ name: "failed.jpg", mimeType: "image/jpeg", buffer: sample });
  await page.route("**/api/attachments", (route) => route.abort(), { times: 1 });
  await newJob.getByRole("button", { name: "Save job", exact: true }).click();
  await newJob.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL("**/jobs/**");
  const skippedPhotoJob = new URL(page.url()).pathname.split("/").at(-1);
  assert.equal(await db.attachment.count({ where: { documentId: skippedPhotoJob } }), 0);
  assert.equal(await db.document.count({ where: { partyId, kind: "job" } }), 3);
  console.log(`PASS optional check-in and delivery photos, retry without duplicates, photo-free jobs, gallery upload, and ${workshopPhotoMaxMegabytes} MB server limit (${process.env.VAG_TEST_HEIC_FILE ? "HEIC" : "JPEG"} delivery fixture).`);
} finally {
  await browser.close();
  await db.$disconnect();
  await unlink(largePhoto).catch((error) => { if (error.code !== "ENOENT") throw error; });
  await rmdir(directory);
}
