import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github", "workflows", "workbench-release-gate.yml");
const packagePath = path.join(root, "package.json");
const workflow = await readFile(workflowPath, "utf8");
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

const referencedNpmScripts = [...workflow.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)]
  .map((match) => match[1]);

test("every npm script referenced by the release workflow exists in package.json", () => {
  assert.ok(referencedNpmScripts.length > 0, "expected npm run references in workflow");
  const missing = [...new Set(referencedNpmScripts)].filter((name) => !(name in packageJson.scripts));
  assert.deepEqual(missing, [], `workflow references missing npm scripts: ${missing.join(", ")}`);
});

test("release workflow runs on pushes, pull requests, and manual dispatch", () => {
  assert.match(workflow, /^on:\s*\n(?:.*\n)*?  push:\s*\n/m);
  assert.match(workflow, /^  pull_request:\s*$/m);
  assert.match(workflow, /^  workflow_dispatch:\s*$/m);
});

test("clean installation and production build are hard release gates", () => {
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /name: Install locked dependencies[\s\S]*?id: install/);
  assert.match(workflow, /name: Verify pinned Excalidraw package and self-hosted font assets[\s\S]*?id: font-assets/);
  assert.match(workflow, /npm run check:excalidraw-font-assets/);
  assert.match(workflow, /name: Build production bundle[\s\S]*?id: build/);
});

test("release gate includes the browser server, fixture, summary, and rendered browser smoke", () => {
  for (const script of [
    "test:browser-verification-server",
    "test:browser-index-fixture",
    "test:workbench-ci-summary",
    "test:workbench-ci-contract",
    "test:excalidraw-font-preflight",
    "test:workbench-browser-e2e",
  ]) {
    assert.ok(referencedNpmScripts.includes(script), `workflow does not invoke ${script}`);
  }
  assert.match(workflow, /playwright@1\.64\.1/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});

test("diagnostics are generated and uploaded even when an earlier gate fails", () => {
  const summaryIndex = workflow.indexOf("name: Write release gate summary");
  const artifactIndex = workflow.indexOf("name: Upload CI diagnostics and browser report");
  const productionIndex = workflow.indexOf("name: Upload production bundle");
  assert.ok(summaryIndex >= 0 && artifactIndex > summaryIndex, "summary must precede diagnostics upload");
  assert.ok(productionIndex > artifactIndex, "production bundle upload must follow diagnostics upload");
  assert.match(workflow.slice(summaryIndex, artifactIndex), /if: always\(\)/);
  assert.match(workflow.slice(artifactIndex, productionIndex), /if: always\(\)/);
  assert.match(workflow.slice(artifactIndex, productionIndex), /name: workbench-release-gate-diagnostics/);
  assert.match(workflow.slice(productionIndex), /if: success\(\)/);
  assert.match(workflow.slice(productionIndex), /name: sketchizi-workbench-dist/);
});

test("workflow gives failure logs useful labels and retention windows", () => {
  for (const log of [
    "npm-ci.log",
    "excalidraw-font-assets.log",
    "production-build.log",
    "application-regressions.log",
    "workbench-regressions.log",
    "playwright-install.log",
    "chromium-install.log",
    "browser-smoke.log",
  ]) {
    assert.ok(workflow.includes(log), `missing diagnostic log path ${log}`);
  }
  assert.match(workflow, /retention-days: 14/);
});

test("release summary receives outcomes from the exact workflow step IDs", () => {
  const summaryStart = workflow.indexOf("name: Write release gate summary");
  const artifactStart = workflow.indexOf("name: Upload CI diagnostics and browser report", summaryStart);
  assert.ok(summaryStart >= 0 && artifactStart > summaryStart, "summary step block must exist");
  const summaryBlock = workflow.slice(summaryStart, artifactStart);
  const expectedMappings = [
    ["TOOLCHAIN_OUTCOME", "toolchain"],
    ["REGISTRY_PROBE_TESTS_OUTCOME", "registry-probe-tests"],
    ["REGISTRY_PROBE_OUTCOME", "registry-probe"],
    ["INSTALL_OUTCOME", "install"],
    ["FONT_ASSETS_OUTCOME", "font-assets"],
    ["BUILD_OUTCOME", "build"],
    ["APPLICATION_TESTS_OUTCOME", "application-tests"],
    ["WORKBENCH_TESTS_OUTCOME", "workbench-tests"],
    ["PLAYWRIGHT_INSTALL_OUTCOME", "playwright-install"],
    ["CHROMIUM_INSTALL_OUTCOME", "chromium-install"],
    ["BROWSER_SMOKE_OUTCOME", "browser-smoke"],
  ];
  for (const [variable, stepId] of expectedMappings) {
    assert.match(
      summaryBlock,
      new RegExp(`${variable}:\\s*\\$\\{\\{\\s*steps\\.${stepId}\\.outcome\\s*\\}\\}`),
      `${variable} must map to steps.${stepId}.outcome`,
    );
  }
  assert.match(summaryBlock, /run: node scripts\/write-workbench-ci-summary\.mjs/);
});


test("npm registry probe runs before npm ci, is non-blocking, and keeps logs", () => {
  const probeIndex = workflow.indexOf("name: Diagnose npm registry connectivity (non-blocking)");
  const installIndex = workflow.indexOf("name: Install locked dependencies");
  assert.ok(probeIndex >= 0 && installIndex > probeIndex, "registry probe must run before npm ci");
  const probeBlock = workflow.slice(probeIndex, installIndex);
  assert.match(probeBlock, /continue-on-error:\s*true/);
  assert.match(probeBlock, /id: registry-probe/);
  assert.match(probeBlock, /npm run check:npm-registry/);
  assert.match(probeBlock, /npm-registry-probe\.log/);
  assert.match(workflow, /npm run test:npm-registry-probe/);
  assert.match(workflow, /id: registry-probe-tests/);
  assert.match(workflow, /REGISTRY_PROBE_TESTS_OUTCOME:\s*\$\{\{\s*steps\.registry-probe-tests\.outcome\s*\}\}/);
  assert.match(workflow, /npm-registry-probe\.json/);
});
