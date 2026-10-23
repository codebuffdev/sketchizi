import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/production-build.yml", import.meta.url), "utf8");
const script = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");

test("production workflow installs Chromium and runs the browser smoke after build", () => {
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm install --no-save --no-package-lock playwright/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /node scripts\/browser-smoke\.mjs/);
});

test("browser smoke covers configured AWS template creation and editor handoff", () => {
  for (const pattern of [/What are you designing\?/, /AWS architecture/, /Three-Tier AWS Web Application/, /Configure first/, /AWS region/, /Environment/, /Use template/, /\.excalidraw/]) {
    assert.match(script, pattern);
  }
});

test("browser smoke covers blank canvas and narrow viewport overflow", () => {
  assert.match(script, /Start blank/);
  assert.match(script, /width: 390, height: 844/);
  assert.match(script, /scrollWidth >/);
  assert.match(script, /horizontal overflow/);
});
