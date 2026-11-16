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

test("browser smoke exercises canvas-first Create, templates, blank drawing and replacement guard", () => {
  assert.match(script, /getByRole\("button", \{ name: "Create drawing" \}\)/);
  assert.match(script, /getByRole\("menuitem", \{ name: \/\^Templates\/ \}\)/);
  assert.match(script, /getByRole\("menuitem", \{ name: \/\^Blank drawing\/ \}\)/);
  assert.match(script, /page\.once\("dialog", async \(dialog\) => \{/);
  assert.match(script, /await dialog\.dismiss\(\)/);
  assert.match(script, /await dialog\.accept\(\)/);
  assert.match(script, /keyboard\.press\("Escape"\)/);
});

test("production workflow builds and performs browser smoke even when unrelated regression tests fail", () => {
  assert.match(workflow, /id: regression\s+continue-on-error: true/);
  assert.match(workflow, /Enforce regression suite result/);
  assert.match(workflow, /steps\.regression\.outcome == 'failure'/);
  const build = workflow.indexOf("run: npm run build");
  const smoke = workflow.indexOf("node scripts/browser-smoke.mjs");
  const enforce = workflow.indexOf("name: Enforce regression suite result");
  assert.ok(build > 0 && smoke > build && enforce > smoke);
});
