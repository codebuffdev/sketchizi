import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGateSummary, renderMarkdown } from "./write-workbench-ci-summary.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(scriptDirectory, "..");
const LOG_DIRECTORY = path.join(PROJECT_ROOT, "artifacts", "ci-logs");

const npm = (args) => ({ command: "npm", args });
const npx = (args) => ({ command: "npx", args });
const npmRun = (script) => npm(["run", script]);

/**
 * Single cross-platform local release plan mirroring the GitHub Actions gate.
 * The npm-registry connectivity probe is diagnostic only; npm ci is authoritative.
 */
export function createReleasePlan(platform = process.platform) {
  const applicationScripts = [
    "test:networking",
    "test:catalog",
    "test:chat",
    "test:sync",
    "test:ui-defaults",
    "test:auth",
    "test:ai",
    "test:collaboration-host-auth",
    "test:device",
    "test:backend-warmup",
    "test:recovery",
    "test:community-gateway",
    "test:font-assets",
    "test:excalidraw-font-preflight",
    "test:font-family-defaults",
  ];
  const workbenchScripts = [
    "test:load-test-calibration",
    "test:simulation",
    "test:workbench-artifacts",
    "test:workbench-format",
    "test:infrastructure-profiles",
    "test:workbench-ui",
    "test:workbench-validation",
    "test:workbench-poc",
    "test:browser-verification-server",
    "test:browser-index-fixture",
    "test:workbench-ci-summary",
    "test:workbench-ci-contract",
    "test:workbench-local-release",
    "test:workbench-external-artifacts",
    "test:workbench-postgres-artifact-integration",
  ];

  return [
    {
      id: "toolchain",
      label: "Toolchain",
      logFile: "toolchain.log",
      blocking: true,
      commands: [
        { command: process.execPath, args: ["--version"] },
        npm(["--version"]),
      ],
    },
    {
      id: "package-lock-check-tests",
      label: "Package-lock consistency unit tests",
      logFile: "package-lock-check-tests.log",
      blocking: true,
      commands: [npmRun("test:package-lock-consistency")],
    },
    {
      id: "package-lock-consistency",
      label: "Package manifest and lockfile consistency",
      logFile: "package-lock-consistency.log",
      blocking: true,
      commands: [{ command: process.execPath, args: ["scripts/check-package-lock-consistency.mjs"] }],
    },
    {
      id: "registry-probe-tests",
      label: "Registry diagnostic unit tests",
      logFile: "npm-registry-probe-tests.log",
      blocking: true,
      commands: [npmRun("test:npm-registry-probe")],
    },
    {
      id: "registry-probe",
      label: "npm registry connectivity diagnostic (non-blocking)",
      logFile: "npm-registry-probe.log",
      blocking: false,
      commands: [npmRun("check:npm-registry")],
    },
    {
      id: "install",
      label: "Clean dependency install (npm ci)",
      logFile: "npm-ci.log",
      blocking: true,
      commands: [npm(["ci", "--no-audit", "--no-fund"])],
    },
    {
      id: "font-assets",
      label: "Excalidraw package and font assets",
      logFile: "excalidraw-font-assets.log",
      blocking: true,
      commands: [npmRun("check:excalidraw-font-assets")],
    },
    {
      id: "build",
      label: "Production build",
      logFile: "production-build.log",
      blocking: true,
      commands: [npmRun("build")],
    },
    {
      id: "application-tests",
      label: "Application regression suites",
      logFile: "application-regressions.log",
      blocking: true,
      commands: applicationScripts.map(npmRun),
    },
    {
      id: "workbench-tests",
      label: "Workbench regression suites",
      logFile: "workbench-regressions.log",
      blocking: true,
      commands: workbenchScripts.map(npmRun),
    },
    {
      id: "artifact-fixtures",
      label: "Generate representative OpenAPI and PostgreSQL artifacts",
      logFile: "artifact-fixtures.log",
      blocking: true,
      commands: [{ command: process.execPath, args: ["scripts/generate-workbench-artifact-fixtures.mjs"] }],
    },
    {
      id: "external-tools-install",
      label: "Install pinned OpenAPI/SQL validators and Playwright",
      logFile: "external-tools-install.log",
      blocking: true,
      commands: [npm(["install", "--no-save", "--no-package-lock", "--ignore-scripts", "@redocly/cli@2.64.1", "pgsql-parser@18.2.12", "playwright@1.64.1"])],
    },
    {
      id: "openapi-validation",
      label: "OpenAPI 3.1 validation with Redocly",
      logFile: "openapi-validation.log",
      blocking: true,
      commands: [npx(["redocly", "lint", "--config", "redocly.workbench.yaml", "artifacts/generated/openapi.json"])],
    },
    {
      id: "sql-validation",
      label: "Generated SQL syntax validation with PostgreSQL parser",
      logFile: "sql-validation.log",
      blocking: true,
      commands: [{ command: process.execPath, args: ["scripts/validate-workbench-generated-sql.mjs"] }],
    },
    {
      id: "postgresql-execution-validation",
      label: "Execute generated DDL against PostgreSQL and verify schema objects",
      logFile: "postgresql-execution-validation.log",
      blocking: true,
      commands: [{ command: process.execPath, args: ["scripts/validate-workbench-generated-sql-postgres.mjs"] }],
    },
    {
      id: "chromium-install",
      label: "Install Chromium for rendered-browser smoke",
      logFile: "chromium-install.log",
      blocking: true,
      commands: [npx(platform === "linux" ? ["playwright", "install", "--with-deps", "chromium"] : ["playwright", "install", "chromium"])],
    },
    {
      id: "browser-smoke",
      label: "Rendered-browser persistence smoke",
      logFile: "browser-smoke.log",
      blocking: true,
      commands: [npmRun("test:workbench-browser-e2e")],
    },
  ];
}

/** Execute plan with an injectable command runner for deterministic tests. */
export async function executeReleasePlan(stages, runCommand, onStage = () => {}) {
  const outcomes = Object.fromEntries(stages.map((stage) => [stage.id, "skipped"]));
  let blocked = false;

  for (const stage of stages) {
    if (blocked) {
      outcomes[stage.id] = "skipped";
      continue;
    }

    let outcome = "success";
    for (const command of stage.commands) {
      let result;
      try {
        result = await runCommand(command, stage);
      } catch (error) {
        result = { exitCode: 1, error: error?.message || String(error) };
      }
      if (result?.exitCode !== 0) {
        outcome = result?.cancelled ? "cancelled" : "failure";
        break;
      }
    }

    outcomes[stage.id] = outcome;
    onStage(stage, outcome);
    if (stage.blocking && outcome !== "success") blocked = true;
  }

  return outcomes;
}

function formatCommand({ command, args = [] }) {
  return [command, ...args].map((part) => {
    const value = String(part);
    return /[\s"']/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
  }).join(" ");
}

async function invokeCommand(command, stage) {
  const logPath = path.join(LOG_DIRECTORY, stage.logFile);
  const stream = createWriteStream(logPath, { flags: "a" });
  const title = `\n[${new Date().toISOString()}] $ ${formatCommand(command)}\n`;
  stream.write(title);
  console.log(`\n> ${formatCommand(command)}`);

  const spawnResult = await new Promise((resolve) => {
    let completed = false;
    const complete = (value) => {
      if (completed) return;
      completed = true;
      stream.write(`\n[exit code=${value.exitCode}; signal=${value.signal ?? "none"}]\n`);
      resolve(value);
    };
    const child = spawn(command.command, command.args ?? [], {
      cwd: PROJECT_ROOT,
      env: process.env,
      shell: process.platform === "win32" && !path.isAbsolute(command.command),
      windowsHide: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      stream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      stream.write(chunk);
    });
    child.once("error", (error) => {
      stream.write(`\nSPAWN ERROR: ${error.stack || error.message}\n`);
      complete({ exitCode: 1, error: error.message });
    });
    child.once("close", (code, signal) => {
      complete({ exitCode: code ?? 1, signal });
    });
  });

  stream.end();
  await finished(stream).catch(() => {});
  return spawnResult;
}

export function mapOutcomesToSummaryEnv(outcomes) {
  return {
    TOOLCHAIN_OUTCOME: outcomes.toolchain ?? "skipped",
    PACKAGE_LOCK_CHECK_TESTS_OUTCOME: outcomes["package-lock-check-tests"] ?? "skipped",
    PACKAGE_LOCK_CONSISTENCY_OUTCOME: outcomes["package-lock-consistency"] ?? "skipped",
    REGISTRY_PROBE_TESTS_OUTCOME: outcomes["registry-probe-tests"] ?? "skipped",
    REGISTRY_PROBE_OUTCOME: outcomes["registry-probe"] ?? "skipped",
    INSTALL_OUTCOME: outcomes.install ?? "skipped",
    FONT_ASSETS_OUTCOME: outcomes["font-assets"] ?? "skipped",
    BUILD_OUTCOME: outcomes.build ?? "skipped",
    APPLICATION_TESTS_OUTCOME: outcomes["application-tests"] ?? "skipped",
    WORKBENCH_TESTS_OUTCOME: outcomes["workbench-tests"] ?? "skipped",
    ARTIFACT_FIXTURES_OUTCOME: outcomes["artifact-fixtures"] ?? "skipped",
    EXTERNAL_TOOLS_INSTALL_OUTCOME: outcomes["external-tools-install"] ?? "skipped",
    OPENAPI_VALIDATION_OUTCOME: outcomes["openapi-validation"] ?? "skipped",
    SQL_VALIDATION_OUTCOME: outcomes["sql-validation"] ?? "skipped",
    POSTGRESQL_EXECUTION_VALIDATION_OUTCOME: outcomes["postgresql-execution-validation"] ?? "skipped",
    CHROMIUM_INSTALL_OUTCOME: outcomes["chromium-install"] ?? "skipped",
    BROWSER_SMOKE_OUTCOME: outcomes["browser-smoke"] ?? "skipped",
  };
}

async function writeSummary(outcomes) {
  const summary = createGateSummary(mapOutcomesToSummaryEnv(outcomes));
  const jsonPath = path.join(PROJECT_ROOT, "artifacts", "workbench-release-gate-summary.json");
  const markdownPath = path.join(PROJECT_ROOT, "artifacts", "workbench-release-gate-summary.md");
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${renderMarkdown(summary)}\n`, "utf8");
  console.log(`\n${renderMarkdown(summary)}`);
  console.log(`JSON report: ${path.relative(PROJECT_ROOT, jsonPath)}`);
  console.log(`Markdown report: ${path.relative(PROJECT_ROOT, markdownPath)}`);
  console.log(`Command logs: ${path.relative(PROJECT_ROOT, LOG_DIRECTORY)}/`);
  return summary;
}

async function main() {
  const artifactDirectory = path.join(PROJECT_ROOT, "artifacts");
  await mkdir(LOG_DIRECTORY, { recursive: true });
  // Remove stale reports so an interrupted run cannot leave previous success evidence behind.
  for (const stalePath of [
    path.join(LOG_DIRECTORY, "npm-registry-probe.json"),
    path.join(artifactDirectory, "workbench-browser-smoke-result.json"),
    path.join(artifactDirectory, "workbench-release-gate-summary.json"),
    path.join(artifactDirectory, "workbench-release-gate-summary.md"),
  ]) {
    await unlink(stalePath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  // Clear old log files so artifacts from prior runs cannot be mistaken for current output.
  for (const stage of createReleasePlan()) {
    await writeFile(path.join(LOG_DIRECTORY, stage.logFile), "", "utf8");
  }
  const plan = createReleasePlan();
  const outcomes = await executeReleasePlan(plan, invokeCommand, (stage, outcome) => {
    const pass = outcome === "success";
    console.log(`${pass ? "PASS" : "FAIL"} — ${stage.label}${stage.blocking ? "" : " (non-blocking diagnostic)"}`);
  });
  const summary = await writeSummary(outcomes);
  if (summary.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(async (error) => {
    console.error(`Local release check failed unexpectedly: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
