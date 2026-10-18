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

test("a blocking install failure skips every downstream stage and preserves the failure", async () => {
  const plan = [
    { id: "install", blocking: true, commands: [{ label: "install" }] },
    { id: "font-assets", blocking: true, commands: [{ label: "fonts" }] },
    { id: "build", blocking: true, commands: [{ label: "build" }] },
  ];
  const seen = [];
  const outcomes = await executeReleasePlan(plan, async (command) => {
    seen.push(command.label);
    return { exitCode: command.label === "install" ? 1 : 0 };
  });
  assert.deepEqual(seen, ["install"]);
  assert.deepEqual(outcomes, { install: "failure", "font-assets": "skipped", build: "skipped" });
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

test("a failure inside a multi-command stage stops that stage and all blocking follow-ups", async () => {
  const plan = [
    { id: "application-tests", blocking: true, commands: [{ label: "test-one" }, { label: "test-two" }, { label: "test-three" }] },
    { id: "workbench-tests", blocking: true, commands: [{ label: "workbench" }] },
  ];
  const seen = [];
  const outcomes = await executeReleasePlan(plan, async (command) => {
    seen.push(command.label);
    return { exitCode: command.label === "test-two" ? 2 : 0 };
  });
  assert.deepEqual(seen, ["test-one", "test-two"]);
  assert.deepEqual(outcomes, { "application-tests": "failure", "workbench-tests": "skipped" });
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
