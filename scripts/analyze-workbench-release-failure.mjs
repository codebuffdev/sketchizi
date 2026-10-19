import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { redactDiagnosticText } from "./redact-workbench-diagnostic-secrets.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(scriptDirectory, "..");
const SUMMARY_PATH = "artifacts/workbench-release-gate-summary.json";
const JSON_REPORT_PATH = "artifacts/workbench-release-failure-analysis.json";
const MARKDOWN_REPORT_PATH = "artifacts/workbench-release-failure-analysis.md";

const STAGE_LOGS = new Map([
  ["Toolchain", "artifacts/ci-logs/toolchain.log"],
  ["Package-lock consistency unit tests", "artifacts/ci-logs/package-lock-check-tests.log"],
  ["Package manifest and lockfile consistency", "artifacts/ci-logs/package-lock-consistency.log"],
  ["Registry diagnostic unit tests", "artifacts/ci-logs/npm-registry-probe-tests.log"],
  ["Clean dependency install (npm ci)", "artifacts/ci-logs/npm-ci.log"],
  ["Excalidraw package and font assets", "artifacts/ci-logs/excalidraw-font-assets.log"],
  ["Production build", "artifacts/ci-logs/production-build.log"],
  ["Application regression suites", "artifacts/ci-logs/application-regressions.log"],
  ["Workbench regression suites", "artifacts/ci-logs/workbench-regressions.log"],
  ["Generated artifact fixtures", "artifacts/ci-logs/artifact-fixtures.log"],
  ["Install pinned external validators and Playwright", "artifacts/ci-logs/external-tools-install.log"],
  ["OpenAPI 3.1 external validation", "artifacts/ci-logs/openapi-validation.log"],
  ["PostgreSQL SQL syntax validation", "artifacts/ci-logs/sql-validation.log"],
  ["Apply generated DDL to PostgreSQL and verify catalog objects", "artifacts/ci-logs/postgresql-execution-validation.log"],
  ["Chromium installation", "artifacts/ci-logs/chromium-install.log"],
  ["Rendered-browser persistence smoke", "artifacts/ci-logs/browser-smoke.log"],
]);

const PATTERNS = [
  { category: "environment-registry-or-network", regex: /EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network.*(?:unreachable|error)|could not resolve|fetch failed/i, title: "Dependency registry or network access failed", action: "Check runner DNS/proxy/network access and retry the dependency install before changing application code.", confidence: "high" },
  { category: "environment-policy-block", regex: /ERR_BLOCKED_BY_ADMINISTRATOR|blocked by administrator|operation not permitted|permission denied/i, title: "Environment policy blocked a required operation", action: "Run this stage in a permitted CI runner or adjust the runner policy; do not classify this as an application defect without additional evidence.", confidence: "high" },
  { category: "dependency-resolution", regex: /npm error code ERESOLVE|unable to resolve dependency tree|lock file.*(?:out of sync|inconsistent)|package-lock.*(?:mismatch|inconsistent)/i, title: "Dependency resolution or lockfile consistency failed", action: "Inspect package.json and package-lock.json together, then run the lockfile consistency check and npm ci in a registry-enabled environment.", confidence: "high" },
  { category: "build-or-compile", regex: /vite.*(?:build|error)|failed to compile|build failed|cannot find module|module not found|syntaxerror|transform failed/i, title: "Build or module compilation failed", action: "Fix the first compiler or module-resolution error in the referenced log; downstream build-dependent checks may be skipped.", confidence: "medium" },
  { category: "browser-runner-or-assertion", regex: /browser.*(?:timeout|assertion|failed)|chromium|devtools|websocket.*(?:closed|failed)|navigation.*failed|pageerror/i, title: "Browser smoke or browser runner failed", action: "Check whether the log indicates runner/environment failure or an application assertion. Only treat the workflow as verified after the browser run actually completes.", confidence: "low" },
  { category: "test-assertion", regex: /not ok \d+|AssertionError|assertion failed|tests? failed|fail(?:ed|ure) tests?/i, title: "A test assertion or regression suite failed", action: "Start with the first failing test and its assertion details. Avoid changing unrelated code until the expected behavior is understood.", confidence: "medium" },
  { category: "application-runtime-defect", regex: /TypeError:|ReferenceError:|RangeError:|Cannot read properties of (?:undefined|null)|is not a function|undefined is not an object/i, title: "An application runtime error was recorded", action: "Inspect the first application stack frame and reproduce the failing input. Do not treat a runtime exception as an environment issue without independent evidence.", confidence: "medium" },
  { category: "openapi-validation", regex: /openapi|oas\d{0,2}\d{0,2}\d{0,2}|operationId|schema.*(?:invalid|required)/i, title: "OpenAPI validation reported a contract issue", action: "Review the first validator diagnostic and the generated OpenAPI fixture; fix the source generator or model contract rather than editing only the generated output.", confidence: "low" },
  { category: "sql-syntax-or-execution", regex: /syntax error at or near|parse error|postgres(?:ql)?.*(?:error|failed)|relation .* does not exist|duplicate key|constraint.*violat/i, title: "Generated SQL parsing or database execution failed", action: "Inspect the exact parser/database error and the generated SQL fixture. Use only a disposable test database and preserve the explicit schema-mutation safeguards.", confidence: "medium" },
];

async function readText(root, relativePath) {
  try { return await readFile(path.join(root, relativePath), "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function classifyEvidence(text) {
  if (!text) return null;
  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + match[0].length + 180);
      return { category: pattern.category, title: pattern.title, recommendedAction: pattern.action, confidence: pattern.confidence, excerpt: redactDiagnosticText(text.slice(start, end).replace(/\s+/g, " ").trim()) };
    }
  }
  return null;
}

export async function analyzeReleaseFailure({ root = PROJECT_ROOT, generatedAt = new Date().toISOString() } = {}) {
  const summaryText = await readText(root, SUMMARY_PATH);
  let summary = null;
  let summaryError = null;
  try {
    if (!summaryText) summaryError = "release-summary-missing";
    else summary = JSON.parse(summaryText);
  } catch { summaryError = "release-summary-invalid-json"; }

  const stages = Array.isArray(summary?.stages) ? summary.stages : [];
  const unsuccessful = stages.filter((stage) => stage.outcome !== "success");
  const failed = unsuccessful.filter((stage) => ["failure", "cancelled", "timed_out", "action_required", "unknown"].includes(stage.outcome));
  const orderedCandidates = failed.length ? failed : unsuccessful.filter((stage) => stage.outcome === "skipped");
  const candidates = [];
  for (const stage of orderedCandidates) {
    const logPath = STAGE_LOGS.get(stage.name) ?? null;
    const logText = logPath ? await readText(root, logPath) : null;
    candidates.push({ stage: stage.name, outcome: stage.outcome, logPath, logPresent: logText !== null, evidence: classifyEvidence(logText) });
  }

  const firstActionable = candidates.find((candidate) => candidate.evidence) ?? candidates[0] ?? null;
  let status;
  if (summaryError) status = "inconclusive";
  else if (summary?.status === "passed" && failed.length === 0 && unsuccessful.length === 0) status = "no-failure-detected";
  else if (firstActionable?.evidence) status = "actionable-evidence-found";
  else if (firstActionable) status = "failure-found-insufficient-log-evidence";
  else status = "no-failed-stage-recorded";

  const report = {
    schemaVersion: 1,
    generatedAt,
    releaseStatus: typeof summary?.status === "string" ? summary.status : "unknown",
    analysisStatus: status,
    summaryError,
    firstActionableFailure: firstActionable ? {
      stage: firstActionable.stage,
      outcome: firstActionable.outcome,
      logPath: firstActionable.logPath,
      logPresent: firstActionable.logPresent,
      ...(firstActionable.evidence ?? { category: "unclassified", title: "A non-successful stage was recorded but no recognized evidence pattern was found", recommendedAction: firstActionable.logPath ? `Inspect ${firstActionable.logPath} and identify the earliest concrete error before changing code.` : "Inspect the release summary and identify the earliest non-successful stage." , confidence: "low", excerpt: null }),
    } : null,
    unsuccessfulStages: unsuccessful.map(({ name, outcome }) => ({ name, outcome })),
    candidates,
    limitations: [
      "Classification is heuristic and based only on captured summary/log text; it does not prove root cause.",
      "A skipped stage is not treated as a primary failure when a failed stage exists.",
      "The release verdict is copied from the summary and is never changed by this analysis.",
    ],
  };
  const markdown = renderFailureAnalysisMarkdown(report);
  const artifactRoot = path.join(root, "artifacts");
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(path.join(root, JSON_REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, MARKDOWN_REPORT_PATH), `${markdown}\n`, "utf8");
  return { report, markdown, jsonPath: path.join(root, JSON_REPORT_PATH), markdownPath: path.join(root, MARKDOWN_REPORT_PATH) };
}

export function renderFailureAnalysisMarkdown(report) {
  const lines = ["# Workbench release failure analysis", "", `**Release status:** ${report.releaseStatus}`, `**Analysis status:** ${report.analysisStatus}`, ""];
  if (report.firstActionableFailure) {
    const failure = report.firstActionableFailure;
    lines.push("## First actionable failure", "", `**Stage:** ${failure.stage} (${failure.outcome})`, `**Category:** ${failure.category}`, `**Confidence:** ${failure.confidence}`, "", failure.title, "", failure.recommendedAction, "");
    if (failure.logPath) lines.push(`**Evidence log:** \`${failure.logPath}\` (${failure.logPresent ? "present" : "missing"})`, "");
    if (failure.excerpt) lines.push("### Evidence excerpt", "", `> ${failure.excerpt.replaceAll("\n", " ")}`, "");
  } else lines.push("No failed stage was recorded in the release summary.", "");
  lines.push("## Non-successful stages", "", ...(report.unsuccessfulStages.length ? report.unsuccessfulStages.map((stage) => `- ${stage.name}: ${stage.outcome}`) : ["- None"]), "", "## Limitations", "", ...report.limitations.map((item) => `- ${item}`), "");
  return lines.join("\n");
}

async function main() {
  const result = await analyzeReleaseFailure();
  console.log(result.markdown);
  console.log(`JSON analysis: ${path.relative(PROJECT_ROOT, result.jsonPath)}`);
  if (!["no-failure-detected", "no-failed-stage-recorded"].includes(result.report.analysisStatus)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
}
