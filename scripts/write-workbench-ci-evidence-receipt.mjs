import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readDiagnosticZip, verifyDiagnosticBundleEntries } from "./verify-workbench-diagnostic-bundle.mjs";

const EXPECTED_WORKFLOW = "Workbench release gate";
const ALLOWED_CONCLUSIONS = new Set([
  "success", "failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale", "startup_failure",
]);

function parseJsonText(text, label) {
  try { return JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function requiredSha(value, name) {
  const sha = requiredString(value, name);
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error(`${name} must be a 40-character Git commit SHA`);
  return sha.toLowerCase();
}

/** Create a traceable local receipt for a verified GitHub Actions diagnostic bundle. */
export async function createCiEvidenceReceipt({ metadataPath, bundlePath, outputDirectory }) {
  if (!metadataPath || !bundlePath) throw new Error("metadataPath and bundlePath are required");
  const absoluteMetadataPath = path.resolve(metadataPath);
  const absoluteBundlePath = path.resolve(bundlePath);
  const metadata = parseJsonText(await readFile(absoluteMetadataPath, "utf8"), "CI run metadata");
  if (metadata.schemaVersion !== 1) throw new Error(`Unsupported CI run metadata schemaVersion: ${metadata.schemaVersion}`);

  const run = metadata.run;
  if (!run || typeof run !== "object") throw new Error("CI run metadata must contain a run object");
  const runId = Number(run.id);
  if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error("run.id must be a positive safe integer");
  const workflowName = requiredString(run.workflowName, "run.workflowName");
  if (workflowName !== EXPECTED_WORKFLOW) throw new Error(`Unexpected workflow '${workflowName}'`);
  const status = requiredString(run.status, "run.status");
  if (status !== "completed") throw new Error(`Run ${runId} is not completed (status: ${status})`);
  const conclusion = requiredString(run.conclusion, "run.conclusion");
  if (!ALLOWED_CONCLUSIONS.has(conclusion)) throw new Error(`Unrecognized run conclusion '${conclusion}'`);
  const headBranch = requiredString(run.headBranch, "run.headBranch");
  const requestedRef = requiredString(metadata.requestedRef, "requestedRef");
  if (headBranch !== requestedRef) throw new Error(`Run branch '${headBranch}' does not match requested ref '${requestedRef}'`);
  const headSha = requiredSha(run.headSha, "run.headSha");
  const localHead = requiredSha(metadata.localHead, "localHead");
  if (headSha !== localHead) throw new Error("CI run SHA does not match the intended local HEAD");
  const event = requiredString(run.event, "run.event");
  const runUrlText = requiredString(run.url, "run.url");
  let runUrl;
  try { runUrl = new URL(runUrlText); }
  catch { throw new Error("run.url must be an absolute HTTPS URL"); }
  if (runUrl.protocol !== "https:") throw new Error("run.url must use HTTPS");
  const collectedAtText = requiredString(metadata.collectedAt, "collectedAt");
  if (!Number.isFinite(Date.parse(collectedAtText))) throw new Error("collectedAt must be a valid timestamp");

  const bundleBytes = await readFile(absoluteBundlePath);
  const bundleStat = await stat(absoluteBundlePath);
  let directVerification;
  try {
    directVerification = verifyDiagnosticBundleEntries(readDiagnosticZip(bundleBytes));
  } catch (error) {
    throw new Error(`Diagnostic ZIP cannot be verified independently: ${error.message}`);
  }
  if (!directVerification.valid) {
    throw new Error(`Diagnostic ZIP integrity verification failed: ${directVerification.errors.join("; ")}`);
  }
  const digest = createHash("sha256").update(bundleBytes).digest("hex");
  const bundleName = path.basename(absoluteBundlePath);
  if (bundleName !== "workbench-release-diagnostic-bundle.zip") {
    throw new Error(`Unexpected diagnostic bundle name '${bundleName}'`);
  }

  const outputRoot = path.resolve(outputDirectory || path.dirname(absoluteBundlePath));
  const stem = path.basename(absoluteBundlePath, path.extname(absoluteBundlePath));
  const analysisJsonPath = path.join(path.dirname(absoluteBundlePath), `${stem}.failure-analysis.json`);
  const analysisMarkdownPath = path.join(path.dirname(absoluteBundlePath), `${stem}.failure-analysis.md`);
  const analysis = parseJsonText(await readFile(analysisJsonPath, "utf8"), "failure-analysis report");
  if (analysis.sourceBundle !== bundleName) throw new Error("Failure-analysis report references a different source bundle");
  if (analysis.integrity?.valid !== true) throw new Error("Failure-analysis report does not confirm valid bundle integrity");
  if (!Number.isInteger(analysis.integrity?.checkedFiles) || analysis.integrity.checkedFiles < 1) {
    throw new Error("Failure-analysis report has no valid checkedFiles count");
  }
  if (analysis.integrity.checkedFiles !== directVerification.checkedFiles) {
    throw new Error("Failure-analysis report checkedFiles count does not match the bundle's independently verified manifest");
  }
  if ((analysis.integrity.releaseStatus ?? "unknown") !== directVerification.releaseStatus) {
    throw new Error("Failure-analysis report release status does not match the bundle's independently verified manifest");
  }
  await readFile(analysisMarkdownPath, "utf8");

  const receipt = {
    schemaVersion: 1,
    receiptType: "sketchizi-workbench-ci-evidence",
    createdAt: new Date().toISOString(),
    collection: {
      collectedAt: new Date(collectedAtText).toISOString(),
      requestedRef,
      localHead,
    },
    run: {
      id: runId,
      url: runUrl.href,
      workflowName,
      status,
      conclusion,
      event,
      headBranch,
      headSha,
    },
    diagnosticBundle: {
      filename: bundleName,
      bytes: bundleStat.size,
      sha256: digest,
    },
    integrity: {
      valid: true,
      checkedFiles: directVerification.checkedFiles,
      warnings: directVerification.warnings,
      recordedReleaseStatus: directVerification.releaseStatus,
    },
    analysisReports: {
      json: path.basename(analysisJsonPath),
      markdown: path.basename(analysisMarkdownPath),
      analysisStatus: analysis.analysis?.analysisStatus ?? analysis.analysis?.status ?? null,
    },
    interpretationBoundary: "This receipt binds local evidence bytes to recorded run metadata. It is not cryptographically signed by GitHub and does not independently prove GitHub authorship, successful application behavior, or a passing release.",
  };

  const jsonPath = path.join(outputRoot, "workbench-ci-evidence-receipt.json");
  const markdownPath = path.join(outputRoot, "workbench-ci-evidence-receipt.md");
  const markdown = [
    "# Workbench CI Evidence Receipt",
    "",
    `- **Run:** [#${runId}](${runUrl.href})`,
    `- **Workflow:** ${workflowName}`,
    `- **Branch:** \`${headBranch}\``,
    `- **Commit:** \`${headSha}\``,
    `- **Event:** ${event}`,
    `- **Conclusion:** ${conclusion}`,
    `- **Collected:** ${new Date(collectedAtText).toISOString()}`,
    `- **Bundle:** \`${bundleName}\` (${bundleStat.size} bytes)`,
    `- **SHA-256:** \`${digest}\``,
    `- **Bundle integrity:** valid (${directVerification.checkedFiles} files checked)`,
    `- **Analysis:** ${receipt.analysisReports.analysisStatus ?? "available"}`,
    "",
    "## Interpretation boundary",
    "",
    receipt.interpretationBoundary,
    "",
  ].join("\n");
  await writeFile(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown, "utf8");
  return { receipt, jsonPath, markdownPath };
}

async function main() {
  const [metadataPath, bundlePath] = process.argv.slice(2);
  if (!metadataPath || !bundlePath || metadataPath === "--help" || metadataPath === "-h") {
    console.log("Usage: node scripts/write-workbench-ci-evidence-receipt.mjs <run-metadata.json> <verified-diagnostic-bundle.zip>");
    console.log("Writes a JSON and Markdown receipt binding CI run metadata to the downloaded bundle hash and imported integrity report.");
    if (!metadataPath || !bundlePath) process.exitCode = 2;
    return;
  }
  const result = await createCiEvidenceReceipt({ metadataPath, bundlePath });
  console.log(`Evidence receipt: ${result.jsonPath}`);
  console.log(`Evidence receipt (Markdown): ${result.markdownPath}`);
  console.log(`Diagnostic bundle SHA-256: ${result.receipt.diagnosticBundle.sha256}`);
  console.log(`Recorded CI conclusion: ${result.receipt.run.conclusion}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
