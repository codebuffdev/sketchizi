import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkBuildPrerequisites } from "./check-build-prerequisites.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_FILES = [
  "supabase/migrations/202610230001_architecture_review_collaboration.sql",
  "supabase/migrations/202610230002_architecture_review_realtime.sql",
  "scripts/test-shared-review-integration.mjs",
  "docs/design-studio/phase5m-browser-smoke-and-release-gate.md",
];
const INTEGRATION_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_USER_A_JWT",
  "SUPABASE_USER_B_JWT",
  "SUPABASE_WORKSPACE_ID",
];

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

export async function createReleaseReadinessReport(root = projectRoot, env = process.env) {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const build = await checkBuildPrerequisites(root);
  const requiredFiles = await Promise.all(REQUIRED_FILES.map(async (file) => ({ path: file, present: await exists(path.join(root, file)) })));
  const missingIntegrationVariables = INTEGRATION_ENV.filter((name) => !String(env[name] ?? "").trim());
  const integration = {
    configured: missingIntegrationVariables.length === 0,
    missingVariables: missingIntegrationVariables,
    note: "Configuration presence only; this does not authenticate users or contact Supabase.",
  };
  const blockers = [];
  if (build.status !== "ready") blockers.push("Production build prerequisites are blocked.");
  for (const file of requiredFiles.filter((item) => !item.present)) blockers.push(`Required release artifact is missing: ${file.path}`);
  if (!integration.configured) blockers.push("Live two-user Supabase integration is not configured in this environment.");

  return {
    schemaVersion: 1,
    project: { name: packageJson.name ?? "unknown", version: packageJson.version ?? null },
    status: blockers.length === 0 ? "ready-for-release-validation" : "blocked",
    checks: {
      buildPrerequisites: build,
      requiredFiles,
      liveIntegration: integration,
      browserSmoke: { status: "manual", command: "npm run test:browser-smoke-contract", note: "Contract tests do not replace a real browser smoke test against the deployed site." },
      productionBuild: { status: "not-run", command: "npm run build" },
    },
    blockers,
    recommendedSequence: [
      "npm ci",
      "npm run check:build-prerequisites",
      "npm run test:all",
      "npm run build",
      "npm run test:shared-review-integration (with protected credentials configured)",
      "Run browser smoke tests against the deployed preview and verify two-user Realtime behavior.",
    ],
  };
}

export function renderReleaseReadinessMarkdown(report) {
  const lines = [
    `# Sketchizi Release Readiness`,
    "",
    `- **Status:** ${report.status}`,
    `- **Version:** ${report.project.version ?? "unknown"}`,
    `- **Build prerequisites:** ${report.checks.buildPrerequisites.status}`,
    `- **Live Supabase integration configured:** ${report.checks.liveIntegration.configured ? "yes" : "no"}`,
    `- **Production build:** ${report.checks.productionBuild.status}`,
    `- **Browser smoke:** ${report.checks.browserSmoke.status}`,
    "",
    "## Blockers",
    ...(report.blockers.length ? report.blockers.map((item) => `- ${item}`) : ["- None detected by this static readiness check."]),
    "",
    "## Required release sequence",
    ...report.recommendedSequence.map((item, index) => `${index + 1}. \`${item}\``),
    "",
    "> This report checks repository files and local configuration only. It does not claim that a production build, deployed browser test, or live Supabase integration has passed.",
  ];
  return lines.join("\n");
}

async function main() {
  const report = await createReleaseReadinessReport();
  console.log(renderReleaseReadinessMarkdown(report));
  console.log(`SKETCHIZI_RELEASE_READINESS_JSON=${JSON.stringify(report)}`);
  if (process.argv.includes("--strict") && report.status !== "ready-for-release-validation") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Release readiness check failed: ${error?.stack || error}`); process.exitCode = 1; });
}
