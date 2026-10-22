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
    "test:workbench-local-release",
    "test:workbench-diagnostic-bundle",
    "test:workbench-external-artifacts",
    "test:workbench-postgres-artifact-integration",
    "test:excalidraw-font-preflight",
    "test:workbench-browser-e2e",
  ]) {
    assert.ok(referencedNpmScripts.includes(script), `workflow does not invoke ${script}`);
  }
  assert.match(workflow, /playwright@1\.64\.1/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /@redocly\/cli@2\.64\.1/);
  assert.match(workflow, /pgsql-parser@18\.2\.12/);
  assert.match(workflow, /redocly lint --config redocly\.workbench\.yaml artifacts\/generated\/openapi\.json/);
  assert.match(workflow, /validate-workbench-generated-sql\.mjs/);
  assert.match(workflow, /image: postgres:17-alpine/);
  assert.match(workflow, /Apply generated DDL twice against PostgreSQL and assert catalog objects/);
  assert.match(workflow, /validate-workbench-generated-sql-postgres\.mjs/);
  assert.match(workflow, /WORKBENCH_POSTGRES_URL:/);
  assert.match(workflow, /WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION:\s*["']true["']/);
  assert.ok(workflow.includes("services:\n      postgres:\n        image: postgres:17-alpine"));
  assert.match(workflow, /POSTGRESQL_EXECUTION_VALIDATION_OUTCOME:\s*\$\{\{\s*steps\.postgresql-execution-validation\.outcome\s*\}\}/);
});

test("only the disposable CI PostgreSQL service opts into schema mutation", () => {
  const gateStart = workflow.indexOf("name: Apply generated DDL twice against PostgreSQL and assert catalog objects");
  const gateEnd = workflow.indexOf("- name:", gateStart + 8);
  assert.ok(gateStart >= 0 && gateEnd > gateStart, "PostgreSQL gate block must exist");
  const gateBlock = workflow.slice(gateStart, gateEnd);
  assert.match(gateBlock, /WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION:\s*["']true["']/);
  assert.doesNotMatch(gateBlock, /WORKBENCH_POSTGRES_ALLOW_REMOTE:/, "the local GitHub service must not enable remote database mutation");
  assert.equal((workflow.match(/WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION:/g) || []).length, 1, "schema mutation opt-in must be scoped to the PostgreSQL step");
});

test("diagnostics are generated and uploaded even when an earlier gate fails", () => {
  const summaryIndex = workflow.indexOf("name: Write release gate summary");
  const artifactIndex = workflow.indexOf("name: Upload CI diagnostics and browser report");
  const productionIndex = workflow.indexOf("name: Upload production bundle");
  assert.ok(summaryIndex >= 0 && artifactIndex > summaryIndex, "summary must precede diagnostics upload");
  assert.ok(productionIndex > artifactIndex, "production bundle upload must follow diagnostics upload");
  assert.match(workflow.slice(summaryIndex, artifactIndex), /if: always\(\)/);
  assert.match(workflow.slice(artifactIndex, productionIndex), /if: always\(\)/);
  assert.match(workflow.slice(summaryIndex, artifactIndex), /name: Package one downloadable release diagnostic bundle/);
  assert.match(workflow.slice(summaryIndex, artifactIndex), /node scripts\/package-workbench-diagnostic-bundle\.mjs/);
  assert.match(workflow.slice(summaryIndex, artifactIndex), /name: Verify packaged diagnostic bundle integrity/);
  assert.match(workflow.slice(summaryIndex, artifactIndex), /name: Verify packaged diagnostic bundle integrity\s+timeout-minutes: \d+\s+if: always\(\)/);
  assert.match(workflow.slice(summaryIndex, artifactIndex), /node scripts\/verify-workbench-diagnostic-bundle\.mjs artifacts\/workbench-release-diagnostic-bundle\.zip/);
  assert.match(workflow.slice(artifactIndex, productionIndex), /artifacts\/workbench-release-diagnostic-verification\.json/);
  assert.match(workflow.slice(artifactIndex, productionIndex), /name: workbench-release-gate-diagnostics/);
  assert.match(workflow.slice(artifactIndex, productionIndex), /artifacts\/workbench-release-diagnostic-bundle\.zip/);
  assert.match(workflow.slice(artifactIndex, productionIndex), /artifacts\/workbench-release-diagnostic-manifest\.json/);
  assert.match(workflow.slice(productionIndex), /if: success\(\)/);
  assert.match(workflow.slice(productionIndex), /name: sketchizi-workbench-dist/);
});

test("workflow gives failure logs useful labels and retention windows", () => {
  for (const log of [
    "package-lock-check-tests.log",
    "package-lock-consistency.log",
    "npm-ci.log",
    "excalidraw-font-assets.log",
    "production-build.log",
    "application-regressions.log",
    "workbench-regressions.log",
    "artifact-fixtures.log",
    "external-tools-install.log",
    "openapi-validation.log",
    "sql-validation.log",
    "postgresql-execution-validation.log",
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
    ["PACKAGE_LOCK_CHECK_TESTS_OUTCOME", "package-lock-check-tests"],
    ["PACKAGE_LOCK_CONSISTENCY_OUTCOME", "package-lock-consistency"],
    ["REGISTRY_PROBE_TESTS_OUTCOME", "registry-probe-tests"],
    ["REGISTRY_PROBE_OUTCOME", "registry-probe"],
    ["INSTALL_OUTCOME", "install"],
    ["FONT_ASSETS_OUTCOME", "font-assets"],
    ["BUILD_OUTCOME", "build"],
    ["APPLICATION_TESTS_OUTCOME", "application-tests"],
    ["WORKBENCH_TESTS_OUTCOME", "workbench-tests"],
    ["ARTIFACT_FIXTURES_OUTCOME", "artifact-fixtures"],
    ["EXTERNAL_TOOLS_INSTALL_OUTCOME", "external-tools-install"],
    ["OPENAPI_VALIDATION_OUTCOME", "openapi-validation"],
    ["SQL_VALIDATION_OUTCOME", "sql-validation"],
    ["POSTGRESQL_EXECUTION_VALIDATION_OUTCOME", "postgresql-execution-validation"],
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


test("package manifest and lockfile are checked offline before registry access and npm ci", () => {
  const checkerTestsIndex = workflow.indexOf("name: Test dependency-free package-lock checker");
  const checkerIndex = workflow.indexOf("name: Check package manifest and lockfile consistency (offline)");
  const registryIndex = workflow.indexOf("name: Diagnose npm registry connectivity (non-blocking)");
  const installIndex = workflow.indexOf("name: Install locked dependencies");
  assert.ok(checkerTestsIndex >= 0 && checkerIndex > checkerTestsIndex, "lockfile checker tests must precede lockfile check");
  assert.ok(registryIndex > checkerIndex && installIndex > registryIndex, "offline checks must precede registry probe and install");
  assert.match(workflow.slice(checkerIndex, registryIndex), /node scripts\/check-package-lock-consistency\.mjs/);
  assert.match(workflow, /npm run test:package-lock-consistency/);
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


test("external artifact validators run on generated fixtures before the browser smoke test", () => {
  const generation = workflow.indexOf("name: Generate representative OpenAPI and PostgreSQL artifacts");
  const install = workflow.indexOf("name: Install pinned external validators and Playwright");
  const openapi = workflow.indexOf("name: Validate generated OpenAPI 3.1 document");
  const sql = workflow.indexOf("name: Parse generated PostgreSQL DDL");
  const postgresExecution = workflow.indexOf("name: Apply generated DDL twice against PostgreSQL and assert catalog objects");
  const chromium = workflow.indexOf("name: Install Chromium for rendered-browser smoke test");
  const upload = workflow.indexOf("name: Upload CI diagnostics and browser report");
  assert.ok(generation >= 0 && install > generation && openapi > install && sql > openapi && postgresExecution > sql && chromium > postgresExecution && upload > chromium);
  assert.match(workflow.slice(upload), /artifacts\/generated\//);
  assert.match(workflow.slice(postgresExecution, chromium), /sudo apt-get install -y postgresql-client/);
});

test("release gate continues independent diagnostics after earlier failures without masking the gate result", () => {
  for (const stepName of [
    "Run application regression suites",
    "Run Workbench regression suites",
    "Generate representative OpenAPI and PostgreSQL artifacts",
    "Install pinned external validators and Playwright",
    "Install Chromium for rendered-browser smoke test",
  ]) {
    const stepIndex = workflow.indexOf(`- name: ${stepName}`);
    assert.ok(stepIndex >= 0, `missing step ${stepName}`);
    const nextStepIndex = workflow.indexOf("      - name:", stepIndex + 10);
    const block = workflow.slice(stepIndex, nextStepIndex < 0 ? workflow.length : nextStepIndex);
    assert.match(block, /if: always\(\)/, `${stepName} must run after prior failures`);
  }
  assert.match(workflow, /if: \$\{\{ always\(\) && steps\.install\.outcome == 'success' \}\}/);
  assert.match(workflow, /if: \$\{\{ always\(\) && steps\.external-tools-install\.outcome == 'success' && steps\.artifact-fixtures\.outcome == 'success' \}\}/);
  assert.match(workflow, /if: \$\{\{ always\(\) && steps\.artifact-fixtures\.outcome == 'success' \}\}/);
  assert.match(workflow, /if: \$\{\{ always\(\) && steps\.chromium-install\.outcome == 'success' \}\}/);
  assert.match(workflow, /id: gate-summary[\s\S]*?if: always\(\)/);
});

test("CI release stages have explicit timeouts aligned with the local release runner", () => {
  assert.match(workflow, /jobs:\s*\n  build-and-regression:[\s\S]*?timeout-minutes: 90/);
  const expected = new Map([
    ["Diagnose npm registry connectivity (non-blocking)", 1],
    ["Install locked dependencies", 10],
    ["Verify pinned Excalidraw package and self-hosted font assets", 3],
    ["Build production bundle", 5],
    ["Run application regression suites", 10],
    ["Run Workbench regression suites", 15],
    ["Generate representative OpenAPI and PostgreSQL artifacts", 3],
    ["Install pinned external validators and Playwright", 10],
    ["Validate generated OpenAPI 3.1 document", 3],
    ["Parse generated PostgreSQL DDL", 3],
    ["Apply generated DDL twice against PostgreSQL and assert catalog objects", 5],
    ["Install Chromium for rendered-browser smoke test", 10],
    ["Run rendered-browser persistence smoke test", 3],
    ["Record dependency tree for diagnostics", 2],
    ["Write release gate summary", 2],
    ["Package one downloadable release diagnostic bundle", 2],
    ["Verify packaged diagnostic bundle integrity", 2],
    ["Upload CI diagnostics and browser report", 3],
    ["Upload production bundle", 3],
  ]);
  for (const [name, minutes] of expected) {
    const start = workflow.indexOf(`- name: ${name}`);
    assert.ok(start >= 0, `missing CI stage ${name}`);
    const next = workflow.indexOf("\n      - name:", start + 1);
    const block = workflow.slice(start, next < 0 ? workflow.length : next);
    assert.match(block, new RegExp(`timeout-minutes: ${minutes}(?:\\s|$)`), `${name} must have a ${minutes}-minute timeout`);
  }
});
