import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readDiagnosticZip, verifyDiagnosticBundleEntries } from "./verify-workbench-diagnostic-bundle.mjs";

const ALLOWED_CONCLUSIONS = new Set(["success", "failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale", "startup_failure"]);

function parseJson(text, label) {
  try { return JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

/** Independently verify a receipt against the downloaded ZIP bytes and its embedded manifest. */
export async function verifyCiEvidenceReceipt({ receiptPath, bundlePath }) {
  if (!receiptPath) throw new Error("receiptPath is required");
  const absoluteReceiptPath = path.resolve(receiptPath);
  const receipt = parseJson(await readFile(absoluteReceiptPath, "utf8"), "CI evidence receipt");
  if (receipt.schemaVersion !== 1 || receipt.receiptType !== "sketchizi-workbench-ci-evidence") {
    throw new Error("Unsupported or invalid CI evidence receipt schema");
  }
  const run = receipt.run;
  if (!run || !Number.isSafeInteger(run.id) || run.id <= 0) throw new Error("Receipt run.id must be a positive safe integer");
  if (run.workflowName !== "Workbench release gate") throw new Error("Receipt references an unexpected workflow");
  if (run.status !== "completed") throw new Error("Receipt run must be completed");
  if (!ALLOWED_CONCLUSIONS.has(run.conclusion)) throw new Error("Receipt contains an unrecognized run conclusion");
  if (!/^[a-f0-9]{40}$/.test(run.headSha || "")) throw new Error("Receipt contains an invalid commit SHA");
  let runUrl;
  try { runUrl = new URL(run.url); } catch { throw new Error("Receipt run URL must be an absolute HTTPS URL"); }
  if (runUrl.protocol !== "https:") throw new Error("Receipt run URL must use HTTPS");
  if (receipt.collection?.localHead !== run.headSha || receipt.collection?.requestedRef !== run.headBranch) {
    throw new Error("Receipt collection metadata does not match the recorded CI run identity");
  }

  const filename = receipt.diagnosticBundle?.filename;
  if (filename !== "workbench-release-diagnostic-bundle.zip") throw new Error("Receipt references an unexpected diagnostic bundle filename");
  const resolvedBundle = path.resolve(bundlePath || path.join(path.dirname(absoluteReceiptPath), filename));
  if (path.basename(resolvedBundle) !== filename) throw new Error("Bundle path does not match the receipt filename");
  const bytes = await readFile(resolvedBundle);
  const info = await stat(resolvedBundle);
  if (!Number.isSafeInteger(receipt.diagnosticBundle.bytes) || receipt.diagnosticBundle.bytes !== info.size) {
    throw new Error("Diagnostic bundle byte count does not match the receipt");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(receipt.diagnosticBundle.sha256 || "") || digest !== receipt.diagnosticBundle.sha256) {
    throw new Error("Diagnostic bundle SHA-256 does not match the receipt");
  }

  let verification;
  try { verification = verifyDiagnosticBundleEntries(readDiagnosticZip(bytes)); }
  catch (error) { throw new Error(`Diagnostic bundle cannot be independently verified: ${error.message}`); }
  if (!verification.valid) throw new Error(`Diagnostic bundle integrity verification failed: ${verification.errors.join("; ")}`);
  if (receipt.integrity?.valid !== true || receipt.integrity.checkedFiles !== verification.checkedFiles) {
    throw new Error("Receipt integrity summary does not match the embedded manifest verification");
  }
  if (receipt.integrity.recordedReleaseStatus !== verification.releaseStatus) {
    throw new Error("Receipt release status does not match the diagnostic bundle manifest");
  }
  if (run.conclusion === "success" && verification.releaseStatus !== "passed") {
    throw new Error("CI reports success but the diagnostic bundle records a non-passing release status");
  }
  return {
    valid: true,
    receiptPath: absoluteReceiptPath,
    bundlePath: resolvedBundle,
    runId: run.id,
    conclusion: run.conclusion,
    sha256: digest,
    bytes: info.size,
    checkedFiles: verification.checkedFiles,
    recordedReleaseStatus: verification.releaseStatus,
    warnings: verification.warnings,
  };
}

async function main() {
  const [receiptPath, bundlePath] = process.argv.slice(2);
  if (!receiptPath || receiptPath === "--help" || receiptPath === "-h") {
    console.log("Usage: node scripts/verify-workbench-ci-evidence-receipt.mjs <receipt.json> [diagnostic-bundle.zip]");
    if (!receiptPath) process.exitCode = 2;
    return;
  }
  const result = await verifyCiEvidenceReceipt({ receiptPath, bundlePath });
  console.log(`Receipt verification: VALID`);
  console.log(`CI run: ${result.runId} (${result.conclusion})`);
  console.log(`Bundle: ${result.bytes} bytes; SHA-256 ${result.sha256}`);
  console.log(`Manifest files verified: ${result.checkedFiles}`);
  console.log(`Recorded release status: ${result.recordedReleaseStatus}`);
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
}
