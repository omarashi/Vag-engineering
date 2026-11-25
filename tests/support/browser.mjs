import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

export function launchBrowser() {
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const executablePath = process.env.VAG_EDGE_PATH ?? (process.platform==="win32" && existsSync(edge) ? edge : undefined);
  return chromium.launch({ executablePath, headless: true });
}

export function browserFixtures(page, base) {
  return async (action, data) => {
    const response = await page.request.post(base + "/api/actions/" + action, {
      headers: { Origin: base, "Idempotency-Key": randomUUID() }, data,
    });
    assert.equal(response.status(), 200, await response.text());
    return (await response.json()).id;
  };
}
