import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function signIn(base, username, password = "Demo-Workshop-2026!", permitted = true) {
  const response = await fetch(base + "/api/auth/sign-in/username", {
    method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
  });
  assert.equal(response.ok, permitted, await response.clone().text());
  return response.headers.getSetCookie().map((row) => row.split(";")[0]).join("; ");
}

export function postAction(base, session, name, data, key = randomUUID()) {
  return fetch(base + "/api/actions/" + name, {
    method: "POST", headers: { Origin: base, "Content-Type": "application/json", "Idempotency-Key": key,
      ...(session ? { Cookie: session } : {}) }, body: JSON.stringify(data),
  });
}
