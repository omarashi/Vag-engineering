import { db } from "../lib/db";
import { command } from "../lib/commands";
import { today } from "../lib/rules";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("Use an isolated local database ending in _test.");
  }
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!password) throw new Error("Set the test bootstrap password.");
  const actor = await db.user.findUniqueOrThrow({ where: { username: "owner", role: "owner", active: true } });
  async function add(action: "user" | "customer" | "vehicle" | "visit" | "account", key: string, input: unknown) {
    const result = await command(actor, action, "fixture-workshop-" + key, input) as { id: string };
    return result.id;
  }
  await add("user", "accountant", { username: "accountant", name: "Mariam Adel", role: "accountant", password });
  await add("user", "technician", { username: "technician", name: "Youssef Nabil", role: "technician", password });
  await add("account", "bank-account", { name: "Business bank", kind: "bank" });

  const base = new Date(today() + "T12:00Z");
  const workshops = [
    ["Karim Mansour", "01015550101", "Volkswagen", "Golf GTI", "س ر د ٢٤٨١", "Stage 2", "tuning", "Stage 2 ECU calibration", "Road logs checked after calibration."],
    ["Nour Hassan", "01015550102", "Audi", "A3 8V", "م و ب ٣٩١٤", "Stock", "maintenance", "DSG oil and filter change", "Changed gearbox oil and filter."],
    ["Ahmed Samir", "01015550103", "CUPRA", "Formentor", "ع ن ر ١٢٤٥", "Stage 1", "inspection", "Pre-tune inspection", "Checked boost, plugs and service history."],
    ["Salma Farouk", "01015550104", "Škoda", "Octavia vRS", "د أ س ٤٦٣٢", "Stock", "installation", "Front brake replacement", "Replaced the front pads and tested the brakes."],
    ["Mahmoud Ali", "01015550105", "SEAT", "Leon FR", "ر ص د ٥٥١٢", "Stage 1", "installation", "Intake kit fitted", "Fitted the intake kit and checked for leaks."],
    ["Hana Mostafa", "01015550106", "Volkswagen", "Passat", "م ن ج ٩٢٣٥", "Stock", "diagnostics", "Intermittent warning light", "Scanned the car and recorded the fault codes."],
  ];
  for (const [i, [name, phone, make, model, plate, stage, category, title, note]] of workshops.entries()) {
    const partyId = await add("customer", "customer-" + i, { name, phone, note: "Test record" });
    const mileage = 58000 + i * 4817;
    const vehicleId = await add("vehicle", "vehicle-" + i, { partyId, make, model, plate, stage, year: 2019 + i % 4, mileage });
    const at = today(new Date(base.getTime() - i * 86400000));
    await add("visit", "visit-" + i, { partyId, vehicleId, title, category, note, at, mileage });
  }
  console.log("Isolated workshop test records are ready.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
