import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

const STAGES = [
  ["Toolchain", "TOOLCHAIN_OUTCOME"],
  ["Registry diagnostic unit tests", "REGISTRY_PROBE_TESTS_OUTCOME"],
  ["Clean dependency install (npm ci)", "INSTALL_OUTCOME"],
  ["Excalidraw package and font assets", "FONT_ASSETS_OUTCOME"],
  ["Production build", "BUILD_OUTCOME"],
  ["Application regression suites", "APPLICATION_TESTS_OUTCOME"],
  ["Workbench regression suites", "WORKBENCH_TESTS_OUTCOME"],
  ["Playwright installation", "PLAYWRIGHT_INSTALL_OUTCOME"],
  ["Chromium installation", "CHROMIUM_INSTALL_OUTCOME"],
  ["Rendered-browser persistence smoke", "BROWSER_SMOKE_OUTCOME"],
];

const FAILURE_GUIDANCE = new Map([
  ["Toolchain", "Inspect artifacts/ci-logs/toolchain.log and confirm the runner's Node.js/npm versions are supported."],
  ["Registry diagnostic unit tests", "Inspect artifacts/ci-logs/npm-registry-probe-tests.log. Fix the dependency-free registry diagnostic tests before interpreting later skipped release stages."],
  ["Clean dependency install (npm ci)", "Inspect artifacts/ci-logs/npm-registry-probe.log and npm-registry-probe.json first, then artifacts/ci-logs/npm-ci.log. Distinguish DNS/network access errors from package-lock consistency and dependency-resolution errors before changing application code."],
  ["Excalidraw package and font assets", "Inspect artifacts/ci-logs/excalidraw-font-assets.log. Compare the declared, locked, and installed Excalidraw versions, then confirm the expected dist/prod/fonts directory contains font files."],
  ["Production build", "Inspect artifacts/ci-logs/production-build.log after the dependency and font-asset preflight passes."],
  ["Application regression suites", "Inspect artifacts/ci-logs/application-regressions.log and identify the first failing npm test command."],
  ["Workbench regression suites", "Inspect artifacts/ci-logs/workbench-regressions.log and identify the first failing npm test command."],
  ["Playwright installation", "Inspect artifacts/ci-logs/playwright-install.log. Confirm the pinned Playwright version is available to the runner and the install did not mutate the lockfile."],
  ["Chromium installation", "Inspect artifacts/ci-logs/chromium-install.log. Confirm the runner can download Chromium and its required system dependencies."],
  ["Rendered-browser persistence smoke", "Inspect artifacts/ci-logs/browser-smoke.log and artifacts/workbench-browser-smoke-result.json; use the first failed browser assertion as the next fix."],
]);

export function createGateSummary(env = process.env, generatedAt = new Date().toISOString()) {
  const stages = STAGES.map(([name, envKey]) => ({
    name,
    outcome: normalizeOutcome(env[envKey]),
  }));
  const firstNonSuccess = stages.find((stage) => stage.outcome !== "success") ?? null;
  const context = {
    repository: nonEmpty(env.GITHUB_REPOSITORY),
    ref: nonEmpty(env.GITHUB_REF),
    sha: nonEmpty(env.GITHUB_SHA),
    runId: nonEmpty(env.GITHUB_RUN_ID),
    runAttempt: nonEmpty(env.GITHUB_RUN_ATTEMPT),
    runUrl: buildRunUrl(env),
  };
  const registryProbeOutcome = env.REGISTRY_PROBE_OUTCOME
    ? normalizeOutcome(env.REGISTRY_PROBE_OUTCOME)
    : null;
  const registryDiagnostics = registryProbeOutcome
    ? {
        outcome: registryProbeOutcome,
        blocking: false,
        logPath: "artifacts/ci-logs/npm-registry-probe.log",
        jsonPath: "artifacts/ci-logs/npm-registry-probe.json",
        message: registryProbeOutcome === "success"
          ? "The registry probe succeeded; npm ci remains the authoritative install gate."
          : "The registry probe did not confirm access. Inspect this diagnostic first, then use npm-ci.log for the actual install result. The probe is non-blocking and does not alter the release verdict.",
      }
    : null;
  return {
    schemaVersion: 3,
    generatedAt,
    status: firstNonSuccess ? "not-passed" : "passed",
    context,
    registryDiagnostics,
    stages,
    firstNonSuccess: firstNonSuccess
      ? {
          name: firstNonSuccess.name,
          outcome: firstNonSuccess.outcome,
          guidance: FAILURE_GUIDANCE.get(firstNonSuccess.name),
        }
      : null,
    scope: [
      "This release gate is a clean-install/build/regression and Workbench persistence smoke test.",
      "It is not a full end-to-end test of every Sketchizi drawing workflow.",
      "It does not certify production capacity or validate adapters against real customer k6/JMeter exports.",
    ],
  };
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildRunUrl(env) {
  const repository = nonEmpty(env.GITHUB_REPOSITORY);
  const runId = nonEmpty(env.GITHUB_RUN_ID);
  if (!repository || !runId || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^\d+$/.test(runId)) {
    return null;
  }
  const server = (nonEmpty(env.GITHUB_SERVER_URL) || "https://github.com").replace(/\/+$/, "");
  return `${server}/${repository}/actions/runs/${runId}`;
}

function normalizeOutcome(value) {
  const allowed = new Set(["success", "failure", "cancelled", "skipped", "timed_out", "action_required", "stale", "unknown"]);
  return allowed.has(value) ? value : "unknown";
}

export function renderMarkdown(summary) {
  const lines = [
    "# Workbench release gate summary",
    "",
    `**Overall status:** ${summary.status === "passed" ? "PASS" : "NOT PASSED"}`,
    `**Generated:** ${summary.generatedAt}`,
  ];
  const context = summary.context ?? {};
  if (context.repository) lines.push(`**Repository:** ${context.repository}`);
  if (context.ref) lines.push(`**Ref:** ${context.ref}`);
  if (context.sha) lines.push(`**Commit:** \`${context.sha}\``);
  if (context.runAttempt) lines.push(`**Run attempt:** ${context.runAttempt}`);
  if (context.runUrl) lines.push(`**Workflow run:** ${context.runUrl}`);
  lines.push("", "| Stage | Outcome |", "|---|---|", ...summary.stages.map((stage) => `| ${stage.name} | ${stage.outcome} |`), "");

  if (summary.firstNonSuccess) {
    lines.push(
      "## First stage needing attention",
      "",
      `**${summary.firstNonSuccess.name}: ${summary.firstNonSuccess.outcome}**`,
      "",
      summary.firstNonSuccess.guidance || "Inspect the diagnostic artifact, starting with the earliest non-successful stage.",
      "",
      "Downstream stages may be skipped because this stage did not complete successfully. Fix the earliest failing stage first.",
      "",
    );
  }

  if (summary.registryDiagnostics) {
    lines.push(
      "## Registry connectivity diagnostic (non-blocking)",
      "",
      `**Probe outcome:** ${summary.registryDiagnostics.outcome}`,
      "",
      summary.registryDiagnostics.message,
      "",
      `Detailed log: \`${summary.registryDiagnostics.logPath}\``,
      `Structured result: \`${summary.registryDiagnostics.jsonPath}\``,
      "",
    );
  }

  lines.push("## Scope notes", "", ...summary.scope.map((note) => `- ${note}`), "");
  lines.push(
    "Detailed console output is retained in the `workbench-release-gate-diagnostics` workflow artifact under `artifacts/ci-logs/`.",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const summary = createGateSummary();
  const artifactDirectory = path.join(projectRoot, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  const jsonPath = path.join(artifactDirectory, "workbench-release-gate-summary.json");
  const markdownPath = path.join(artifactDirectory, "workbench-release-gate-summary.md");
  const jsonContent = `${JSON.stringify(summary, null, 2)}\n`;
  const markdownContent = `${renderMarkdown(summary)}\n`;
  await writeFile(jsonPath, jsonContent, "utf8");
  await writeFile(markdownPath, markdownContent, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdownContent}\n`, "utf8");
  }
  console.log(markdownContent);
  console.log(`JSON summary: ${path.relative(projectRoot, jsonPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Could not write Workbench release gate summary: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
