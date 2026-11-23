import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Role } from "@prisma/client";
import { db } from "../lib/db";
import { command } from "../lib/commands";
import { today } from "../lib/rules";

async function createAccount(email: string, name: string, role: Role, password: string) {
  if (password.length < 12) throw new Error("Bootstrap password must be at least 12 characters.");
  const old = await db.user.findUnique({ where: { email } });
  if (old) return old;
  const id = randomUUID();
  const hash = await hashPassword(password);
  return db.user.create({ data: { id, email, name, role, accounts: {
    create: { id: randomUUID(), accountId: id, providerId: "credential", password: hash },
  } } });
}

async function main() {
  if (process.env.VAG_DEMO !== "true") {
    const email = process.env.BOOTSTRAP_EMAIL;
    const password = process.env.BOOTSTRAP_PASSWORD;
    if (!email || !password) throw new Error("Set BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD.");
    if (await db.user.count()) throw new Error("An account already exists.");
    await createAccount(email, process.env.BOOTSTRAP_NAME ?? "Workshop Owner", "owner", password);
    console.log("Initial owner created.");
    return;
  }
  const password = process.env.VAG_DEMO_PASSWORD || "Demo-Workshop-2026!";
  const actor = await createAccount("owner@vag-demo.test", "Omar Khaled", "owner", password);
  await createAccount("accountant@vag-demo.test", "Mariam Adel", "accountant", password);
  await createAccount("technician@vag-demo.test", "Youssef Nabil", "technician", password);
  async function add(action: "customer" | "vehicle" | "visit" | "account", key: string, input: unknown) {
    const result = await command(actor, action, "seed-vag-demo-" + key, input) as { id: string };
    return result.id;
  }
  await add("account", "cash-drawer", {name:"Workshop cash",kind:"cash"});
  await add("account", "bank-account", {name:"Business bank",kind:"bank"});
  const epoch = await db.setting.upsert({ where: { key: "demoEpoch" }, create: { key: "demoEpoch", value: today() }, update: {} });
  const base = new Date(String(epoch.value) + "T12:00Z");
  const demo = [
    ["Karim Mansour", "01015550101", "Volkswagen", "Golf GTI", "س ر د ٢٤٨١", "Stage 2", "tuning", "Stage 2 ECU calibration", "Road logs checked after calibration."],
    ["Nour Hassan", "01015550102", "Audi", "A3 8V", "م و ب ٣٩١٤", "Stock", "maintenance", "DSG oil and filter change", "Changed gearbox oil and filter."],
    ["Ahmed Samir", "01015550103", "CUPRA", "Formentor", "ع ن ر ١٢٤٥", "Stage 1", "inspection", "Pre-tune inspection", "Checked boost, plugs and service history."],
    ["Salma Farouk", "01015550104", "Škoda", "Octavia vRS", "د أ س ٤٦٣٢", "Stock", "repair", "Front brake replacement", "Replaced the front pads and tested the brakes."],
    ["Mahmoud Ali", "01015550105", "SEAT", "Leon FR", "ر ص د ٥٥١٢", "Stage 1", "installation", "Intake kit fitted", "Fitted intake kit and checked for leaks."],
    ["Hana Mostafa", "01015550106", "Volkswagen", "Passat", "م ن ج ٩٢٣٥", "Stock", "diagnostics", "Intermittent warning light", "Scanned the car and recorded the fault codes."],
  ];
  for (const [i, [name, phone, make, model, plate, stage, category, title, note]] of demo.entries()) {
    const partyId = await add("customer", "customer-" + i, { name, phone, note: "Demonstration record" });
    const mileage = 58000 + i * 4817;
    const vehicleId = await add("vehicle", "vehicle-" + i, { partyId, make, model, plate, stage, year: 2019 + i % 4, mileage });
    const at = today(new Date(base.getTime() - i * 86400000));
    await add("visit", "simple-visit-" + i, { partyId, vehicleId, title, category, note, at, mileage });
  }
  console.log("Demo customers, cars and visits are ready.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

