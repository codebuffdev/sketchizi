import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../scripts/browser-acceptance.mjs", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/staging-deployment-verification.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("browser acceptance validates safe URL and records browser runtime failures", () => {
  assert.match(script, /absolute HTTP\(S\) URL/);
  assert.match(script, /embedded credentials/);
  assert.match(script, /pageerror/);
  assert.match(script, /console error/);
  assert.match(script, /failed same-origin request/);
});

test("browser acceptance covers configured template, blank canvas, file menu and responsive viewport", () => {
  for (const pattern of [/Three-Tier AWS Web Application/, /AWS region/, /Environment/, /Start blank/, /\.excalidraw/, /File menu/, /width: 390, height: 844/, /horizontal overflow/]) {
    assert.match(script, pattern);
  }
});

test("staging workflow runs browser acceptance after deployment and browser setup", () => {
  assert.match(workflow, /npm install --no-save --no-package-lock playwright/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /node scripts\/browser-acceptance\.mjs/);
  assert.ok(workflow.indexOf("node scripts/verify-deployment.mjs") < workflow.indexOf("node scripts/browser-acceptance.mjs"));
});

test("browser acceptance is exposed as a package script", () => {
  assert.equal(packageJson.scripts["test:browser-acceptance-contract"], "node --test tests/browser-acceptance.test.js");
});
