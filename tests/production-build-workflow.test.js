import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(projectRoot, ".github", "workflows", "production-build.yml");

async function workflow() {
  return readFile(workflowPath, "utf8");
}

test("production verification runs for pushes, pull requests, and manual dispatch", async () => {
  const source = await workflow();
  assert.match(source, /push:/);
  assert.match(source, /pull_request:/);
  assert.match(source, /workflow_dispatch:/);
});

test("workflow installs exact lockfile dependencies using Node 20", async () => {
  const source = await workflow();
  assert.match(source, /node-version:\s*20/);
  assert.match(source, /cache:\s*npm/);
  assert.match(source, /npm ci --no-audit --no-fund/);
});

test("workflow checks prerequisites and runs regression tests before building", async () => {
  const source = await workflow();
  const prerequisite = source.indexOf("npm run check:build-prerequisites");
  const tests = source.indexOf("npm run test:all");
  const build = source.indexOf("npm run build");
  assert.ok(prerequisite >= 0 && tests > prerequisite && build > tests);
});

test("workflow publishes dist only when a production build creates it", async () => {
  const source = await workflow();
  assert.match(source, /actions\/upload-artifact@v4/);
  assert.match(source, /path:\s*dist\//);
  assert.match(source, /if-no-files-found:\s*error/);
});

test("workflow uses read-only repository permissions and a bounded job duration", async () => {
  const source = await workflow();
  assert.match(source, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(source, /timeout-minutes:\s*20/);
});

test("workflow waits for the production preview before browser testing", async () => {
  const source = await workflow();
  const start = source.indexOf("Start production preview");
  const wait = source.indexOf("Wait for production preview readiness");
  const smoke = source.indexOf("Run template creation browser smoke test");
  assert.ok(start >= 0 && wait > start && smoke > wait);
  assert.match(source, /curl --fail --silent http:\/\/127\.0\.0\.1:4173\//);
});

test("workflow emits a CI summary and preserves preview logs after failures", async () => {
  const source = await workflow();
  assert.match(source, /Write CI verification summary/);
  assert.match(source, /GITHUB_STEP_SUMMARY/);
  assert.match(source, /Upload preview logs on failure/);
  assert.match(source, /if: failure\(\)/);
});
