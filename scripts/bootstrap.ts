import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../lib/db";
import { internalLoginEmail, normalizeUsername, validUsername } from "../lib/usernames";

async function main() {
  const username = normalizeUsername(process.env.BOOTSTRAP_USERNAME ?? "");
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!username || !password) throw new Error("Set BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD.");
  if (!validUsername(username)) throw new Error("Use 3?30 English letters, digits, periods, underscores, or hyphens for the username.");
  if (password.length < 12) throw new Error("Bootstrap password must be at least 12 characters.");
  if (await db.user.count()) throw new Error("An account already exists.");

  const id = randomUUID();
  await db.user.create({ data: {
    id, username, email: internalLoginEmail(id), name: process.env.BOOTSTRAP_NAME || "Workshop Owner", role: "owner",
    accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) } },
  } });
  console.log("Initial owner created.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
