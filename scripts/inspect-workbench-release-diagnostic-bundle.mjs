import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readDiagnosticZip, verifyDiagnosticBundleEntries } from "./verify-workbench-diagnostic-bundle.mjs";
import { analyzeReleaseFailure } from "./analyze-workbench-release-failure.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(scriptDirectory, "..");

/** Verify a downloaded CI diagnostic ZIP, then analyze it without touching project artifacts. */
export async function inspectDiagnosticBundle(bundlePath) {
  const absoluteBundlePath = path.resolve(bundlePath);
  const archive = await readFile(absoluteBundlePath);
  const entries = readDiagnosticZip(archive);
  const verification = verifyDiagnosticBundleEntries(entries);
  if (!verification.valid) {
    const error = new Error(`Diagnostic bundle integrity verification failed: ${verification.errors.join("; ")}`);
    error.code = "WORKBENCH_DIAGNOSTIC_BUNDLE_INVALID";
    error.verification = verification;
    throw error;
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "workbench-ci-diagnostic-import-"));
  try {
    for (const [entryName, data] of entries) {
      if (entryName === "workbench-release-diagnostic-manifest.json") continue;
      const destination = path.resolve(temporaryRoot, ...entryName.split("/"));
      const relative = path.relative(temporaryRoot, destination);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Unsafe extraction path: ${entryName}`);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, data, { flag: "wx" });
    }

    const analysis = await analyzeReleaseFailure({ root: temporaryRoot });
    const outputDirectory = path.dirname(absoluteBundlePath);
    const outputStem = path.basename(absoluteBundlePath, path.extname(absoluteBundlePath));
    const jsonPath = path.join(outputDirectory, `${outputStem}.failure-analysis.json`);
    const markdownPath = path.join(outputDirectory, `${outputStem}.failure-analysis.md`);
    const report = {
      schemaVersion: 1,
      inspectedAt: new Date().toISOString(),
      sourceBundle: path.basename(absoluteBundlePath),
      integrity: {
        valid: true,
        checkedFiles: verification.checkedFiles,
        releaseStatus: verification.releaseStatus,
        warnings: verification.warnings,
      },
      analysis: analysis.report,
    };
    const markdown = [
      "# Imported Workbench CI diagnostic analysis",
      "",
      `**Source bundle:** ${path.basename(absoluteBundlePath)}`,
      `**Integrity:** valid (${verification.checkedFiles} files checked)`,
      `**Recorded release status:** ${verification.releaseStatus}`,
      `**Analysis status:** ${analysis.report.analysisStatus}`,
      "",
      analysis.markdown,
      "",
      "## Interpretation boundary",
      "",
      "Integrity verifies the downloaded evidence bytes; it does not establish that the release passed. Failure classification is heuristic and does not prove root cause.",
      "",
    ].join("\n");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${markdown}\n`, "utf8");
    return { verification, analysis: analysis.report, jsonPath, markdownPath, report };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const bundlePath = process.argv[2];
  if (!bundlePath || bundlePath === "--help" || bundlePath === "-h") {
    console.log("Usage: node scripts/inspect-workbench-release-diagnostic-bundle.mjs <downloaded-diagnostics.zip>");
    console.log("Verifies bundle integrity and writes adjacent .failure-analysis.json and .failure-analysis.md reports.");
    if (!bundlePath) process.exitCode = 2;
    return;
  }
  const result = await inspectDiagnosticBundle(bundlePath);
  console.log(`Bundle integrity: VALID (${result.verification.checkedFiles} files checked)`);
  console.log(`Recorded release status: ${result.verification.releaseStatus}`);
  console.log(`Failure analysis: ${result.analysis.analysisStatus}`);
  console.log(`JSON report: ${result.jsonPath}`);
  console.log(`Markdown report: ${result.markdownPath}`);
  for (const warning of result.verification.warnings) console.warn(`WARNING: ${warning}`);
  // Exit status indicates the import/inspection operation, not the recorded release verdict.
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    if (error?.verification?.errors) for (const item of error.verification.errors) console.error(`INTEGRITY ERROR: ${item}`);
    process.exitCode = error?.code === "WORKBENCH_DIAGNOSTIC_BUNDLE_INVALID" ? 1 : 1;
  });
}
