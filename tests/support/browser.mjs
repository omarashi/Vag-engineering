import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "../../data/tooling/node_modules/playwright-core/index.mjs";

export function launchEdge() {
  const executablePath = process.env.VAG_EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
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
