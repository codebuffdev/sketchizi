import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReleasePlan, executeReleasePlan, mapOutcomesToSummaryEnv } from "../scripts/run-workbench-release-check.mjs";
import { createGateSummary } from "../scripts/write-workbench-ci-summary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const ciWorkflow = await readFile(path.join(root, ".github", "workflows", "workbench-release-gate.yml"), "utf8");

test("the documented release command points to the local gate runner", () => {
  assert.equal(packageJson.scripts["verify:workbench-release"], "node scripts/run-workbench-release-check.mjs");
});

test("local release plan references only npm scripts that exist", () => {
  const refs = createReleasePlan().flatMap((stage) => stage.commands)
    .filter((command) => command.command === "npm")
    .flatMap((command) => {
      const runIndex = command.args.indexOf("run");
      return runIndex >= 0 ? [command.args[runIndex + 1]] : [];
    });
  assert.ok(refs.length >= 25);
  const missing = [...new Set(refs)].filter((script) => !(script in packageJson.scripts));
  assert.deepEqual(missing, []);
});

test("local release plan preserves install, font preflight, build, regressions, and browser smoke order", () => {
  const plan = createReleasePlan("win32");
  const ids = plan.map((stage) => stage.id);
  assert.deepEqual(ids, [
    "toolchain", "package-lock-check-tests", "package-lock-consistency", "registry-probe-tests", "registry-probe", "install", "font-assets", "build",
    "application-tests", "workbench-tests", "artifact-fixtures", "external-tools-install", "openapi-validation", "sql-validation", "postgresql-execution-validation", "chromium-install", "browser-smoke",
  ]);
  assert.ok(plan.find((stage) => stage.id === "install").commands[0].args.includes("ci"));
  assert.ok(plan.find((stage) => stage.id === "build").commands.some((command) => command.args.includes("build")));
  assert.ok(plan.find((stage) => stage.id === "browser-smoke").commands.some((command) => command.args.includes("test:workbench-browser-e2e")));
  assert.ok(ciWorkflow.includes("name: Clean install, production build, regression suites"));
});

test("an install failure does not block independent diagnostics but skips dependent build stages", async () => {
  const plan = [
    { id: "install", blocking: true, requires: [], commands: [{ label: "install" }] },
    { id: "font-assets", blocking: true, requires: ["install"], commands: [{ label: "fonts" }] },
    { id: "build", blocking: true, requires: ["install"], commands: [{ label: "build" }] },
    { id: "simulation-tests", blocking: true, requires: [], commands: [{ label: "simulation" }] },
    { id: "fixtures", blocking: true, requires: [], commands: [{ label: "fixtures" }] },
  ];
  const seen = [];
  const outcomes = await executeReleasePlan(plan, async (command) => {
    seen.push(command.label);
    return { exitCode: command.label === "install" ? 1 : 0 };
  });
  assert.deepEqual(seen, ["install", "simulation", "fixtures"]);
  assert.deepEqual(outcomes, {
    install: "failure", "font-assets": "skipped", build: "skipped",
    "simulation-tests": "success", fixtures: "success",
  });
});

test("a failed registry connectivity diagnostic is non-blocking", async () => {
  const plan = [
    { id: "registry-probe", blocking: false, commands: [{ label: "probe" }] },
    { id: "install", blocking: true, commands: [{ label: "install" }] },
  ];
  const seen = [];
  const outcomes = await executeReleasePlan(plan, async (command) => {
    seen.push(command.label);
    return { exitCode: command.label === "probe" ? 1 : 0 };
  });
  assert.deepEqual(seen, ["probe", "install"]);
  assert.deepEqual(outcomes, { "registry-probe": "failure", install: "success" });
});

test("a failure stops the current stage but only skips stages that depend on it", async () => {
  const plan = [
    { id: "application-tests", blocking: true, requires: [], commands: [{ label: "test-one" }, { label: "test-two" }, { label: "test-three" }] },
    { id: "build", blocking: true, requires: ["application-tests"], commands: [{ label: "build" }] },
    { id: "artifact-fixtures", blocking: true, requires: [], commands: [{ label: "fixtures" }] },
  ];
  const seen = [];
  const outcomes = await executeReleasePlan(plan, async (command) => {
    seen.push(command.label);
    return { exitCode: command.label === "test-two" ? 2 : 0 };
  });
  assert.deepEqual(seen, ["test-one", "test-two", "fixtures"]);
  assert.deepEqual(outcomes, { "application-tests": "failure", build: "skipped", "artifact-fixtures": "success" });
});

test("release plan declares only real prerequisite boundaries", () => {
  const byId = Object.fromEntries(createReleasePlan().map((stage) => [stage.id, stage]));
  assert.deepEqual(byId["font-assets"].requires, ["install"]);
  assert.deepEqual(byId.build.requires, ["install"]);
  assert.deepEqual(byId["openapi-validation"].requires, ["artifact-fixtures", "external-tools-install"]);
  assert.deepEqual(byId["sql-validation"].requires, ["artifact-fixtures", "external-tools-install"]);
  assert.deepEqual(byId["postgresql-execution-validation"].requires, ["artifact-fixtures"]);
  assert.deepEqual(byId["browser-smoke"].requires, ["chromium-install"]);
  assert.deepEqual(byId["workbench-tests"].requires, []);
});

test("local outcomes map to the shared release summary schema", () => {
  const summary = createGateSummary(mapOutcomesToSummaryEnv({
    toolchain: "success",
    "package-lock-check-tests": "success",
    "package-lock-consistency": "success",
    "registry-probe-tests": "success",
    "registry-probe": "failure",
    install: "failure",
    "font-assets": "skipped",
    build: "skipped",
    "application-tests": "skipped",
    "workbench-tests": "skipped",
    "artifact-fixtures": "skipped",
    "external-tools-install": "skipped",
    "openapi-validation": "skipped",
    "sql-validation": "skipped",
    "postgresql-execution-validation": "skipped",
    "chromium-install": "skipped",
    "browser-smoke": "skipped",
  }));
  assert.equal(summary.status, "not-passed");
  assert.equal(summary.firstNonSuccess.name, "Clean dependency install (npm ci)");
  assert.equal(summary.registryDiagnostics.blocking, false);
  assert.equal(summary.registryDiagnostics.outcome, "failure");
});

test("every release-plan stage has an isolated diagnostic log", () => {
  const plan = createReleasePlan();
  const names = plan.map((stage) => stage.logFile);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("package-lock-check-tests.log"));
  assert.ok(names.includes("package-lock-consistency.log"));
  assert.ok(names.includes("npm-ci.log"));
  assert.ok(names.includes("production-build.log"));
  assert.ok(names.includes("browser-smoke.log"));
  assert.ok(names.includes("artifact-fixtures.log"));
  assert.ok(names.includes("openapi-validation.log"));
  assert.ok(names.includes("sql-validation.log"));
  assert.ok(names.includes("postgresql-execution-validation.log"));
});


test("local release gate verifies the packaged bundle and preserves a strict exit status", async () => {
  const runner = await readFile(path.join(root, "scripts", "run-workbench-release-check.mjs"), "utf8");
  const packageIndex = runner.indexOf("createDiagnosticBundle({ root: PROJECT_ROOT })");
  const verifyIndex = runner.indexOf("scripts/verify-workbench-diagnostic-bundle.mjs", packageIndex);
  assert.ok(packageIndex >= 0 && verifyIndex > packageIndex, "bundle must be packaged before verification");
  assert.match(runner.slice(verifyIndex), /if \(verification\.exitCode !== 0\)[\s\S]*?process\.exitCode = 1/);
  assert.match(runner, /workbench-release-diagnostic-verification\.json/);
});
