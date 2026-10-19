import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runnerUrl = new URL("../scripts/run-workbench-browser-smoke.mjs", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);

test("browser runner uses built-in Node WebSocket and Chromium DevTools Protocol without Playwright", async () => {
  const source = await readFile(runnerUrl, "utf8");
  assert.match(source, /new WebSocket\(/);
  assert.match(source, /Page\.navigate/);
  assert.match(source, /Runtime\.exceptionThrown/);
  assert.doesNotMatch(source, /from [\"']playwright[\"']/);
});

test("browser runner fails promptly and explicitly when Chromium blocks navigation", async () => {
  const source = await readFile(runnerUrl, "utf8");
  assert.match(source, /if \(navigation\.errorText\) throw new Error/);
  assert.match(source, /blocked navigation to the local smoke page/);
  assert.match(source, /browser policy or environment restriction/);
});

test("browser workflow test command includes runner contract tests", async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));
  assert.match(packageJson.scripts["test:workbench-browser-workflow"], /workbench-browser-runner\.test\.mjs/);
});


test("browser smoke result classifies administrator-blocked navigation as an environment policy block", async () => {
  const source = await readFile(runnerUrl, "utf8");
  assert.match(source, /failureCategory: null/);
  assert.match(source, /result\.failureCategory = "environment-policy-block"/);
  assert.match(source, /Run the browser smoke in a CI or local environment where Chromium is permitted to navigate to the loopback test server/);
  assert.match(source, /Do not treat this result as a passing browser test/);
});

test("browser smoke runner records distinct categories for launch, timeout, assertion, and generic failures", async () => {
  const source = await readFile(runnerUrl, "utf8");
  for (const category of [
    "browser-launch-or-devtools",
    "browser-smoke-timeout",
    "browser-assertion-or-page-error",
    "browser-runner-error",
  ]) assert.ok(source.includes(`result.failureCategory = "${category}"`), `missing category ${category}`);
  assert.match(source, /remediation: null/);
});
