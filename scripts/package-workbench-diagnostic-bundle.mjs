import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeReleaseFailure } from "./analyze-workbench-release-failure.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { redactDiagnosticText, shouldRedactDiagnosticPath } from "./redact-workbench-diagnostic-secrets.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(scriptDirectory, "..");
const ARTIFACT_ROOT = path.join(PROJECT_ROOT, "artifacts");
const BUNDLE_NAME = "workbench-release-diagnostic-bundle.zip";
const MANIFEST_NAME = "workbench-release-diagnostic-manifest.json";
const REQUIRED_PATHS = [
  "artifacts/workbench-release-gate-summary.json",
  "artifacts/workbench-release-gate-summary.md",
  "artifacts/ci-logs/toolchain.log",
  "artifacts/ci-logs/npm-ci.log",
  "artifacts/ci-logs/production-build.log",
  "artifacts/ci-logs/application-regressions.log",
  "artifacts/ci-logs/workbench-regressions.log",
  "artifacts/ci-logs/artifact-fixtures.log",
  "artifacts/generated/openapi.json",
  "artifacts/generated/schema.sql",
  "artifacts/workbench-browser-smoke-result.json",
  "artifacts/workbench-release-failure-analysis.json",
  "artifacts/workbench-release-failure-analysis.md",
];

async function walkFiles(directory, root, results = []) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return results; throw error; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkFiles(fullPath, root, results);
    else if (entry.isFile()) results.push({ fullPath, relativePath: path.relative(root, fullPath).split(path.sep).join("/") });
  }
  return results;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Create a standards-compliant, dependency-free ZIP archive using DEFLATE. */
export function createZip(entries, generatedAt = new Date()) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime(generatedAt);
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function createDiagnosticBundle({ root = PROJECT_ROOT, generatedAt = new Date().toISOString() } = {}) {
  const artifactRoot = path.join(root, "artifacts");
  // Generate the analysis before discovering files so both reports enter the bundle.
  await analyzeReleaseFailure({ root, generatedAt });
  const discovered = await walkFiles(artifactRoot, root);
  const excluded = new Set([
    path.join(root, "artifacts", BUNDLE_NAME),
    path.join(root, "artifacts", MANIFEST_NAME),
  ]);
  const sourceFiles = discovered.filter((file) => !excluded.has(file.fullPath));
  const files = [];
  const zipEntries = [];
  for (const file of sourceFiles) {
    const sourceData = await readFile(file.fullPath);
    // Preserve original local logs, but only package redacted copies of diagnostic logs/reports.
    const data = shouldRedactDiagnosticPath(file.relativePath)
      ? Buffer.from(redactDiagnosticText(sourceData.toString("utf8")), "utf8")
      : sourceData;
    files.push({ path: file.relativePath, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), ...(shouldRedactDiagnosticPath(file.relativePath) ? { redactedForSharing: true } : {}) });
    zipEntries.push({ name: file.relativePath, data });
  }
  const presentPaths = new Set(files.map((file) => file.path));
  const missing = REQUIRED_PATHS.filter((requiredPath) => !presentPaths.has(requiredPath));
  let releaseStatus = "unknown";
  let failedStages = [];
  let skippedStages = [];
  let summaryReadError = null;
  try {
    const summary = JSON.parse(await readFile(path.join(root, "artifacts", "workbench-release-gate-summary.json"), "utf8"));
    releaseStatus = typeof summary.status === "string" ? summary.status : "unknown";
    const stages = Array.isArray(summary.stages) ? summary.stages : [];
    failedStages = stages.filter((stage) => ["failure", "cancelled", "timed_out", "action_required", "unknown"].includes(stage.outcome)).map(({ name, outcome }) => ({ name, outcome }));
    skippedStages = stages.filter((stage) => stage.outcome === "skipped").map(({ name, outcome }) => ({ name, outcome }));
  } catch (error) {
    summaryReadError = error?.code === "ENOENT" ? "summary-missing" : "summary-invalid-json";
  }
  const manifest = {
    schemaVersion: 1,
    bundleType: "sketchizi-workbench-release-diagnostics",
    generatedAt,
    releaseStatus,
    failedStages,
    skippedStages,
    summaryReadError,
    completeness: { requiredArtifactCount: REQUIRED_PATHS.length, missingRequiredArtifacts: missing, complete: missing.length === 0 },
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    notes: [
      "A missing artifact means it was not present at packaging time; it may correspond to a skipped stage, failed generation, or a stage that has not run.",
      "The release verdict is copied from the gate summary and is never changed by packaging diagnostics.",
      "Failure analysis uses heuristic log patterns; its classification is evidence triage, not proof of root cause.",
      "File hashes cover the exact bytes included in the bundle.",
      "Diagnostic log copies and failure-analysis reports are redacted for common credential formats; original local log files are not modified.",
    ],
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  zipEntries.push({ name: MANIFEST_NAME, data: manifestText });
  const bundle = createZip(zipEntries, new Date(generatedAt));
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(path.join(artifactRoot, MANIFEST_NAME), manifestText);
  await writeFile(path.join(artifactRoot, BUNDLE_NAME), bundle);
  return { manifest, bundlePath: path.join(artifactRoot, BUNDLE_NAME), manifestPath: path.join(artifactRoot, MANIFEST_NAME), bundleBytes: bundle.length };
}

async function main() {
  const result = await createDiagnosticBundle();
  console.log(`Diagnostic bundle: ${path.relative(PROJECT_ROOT, result.bundlePath)} (${result.bundleBytes} bytes)`);
  console.log(`Manifest: ${path.relative(PROJECT_ROOT, result.manifestPath)}`);
  console.log(`Release status: ${result.manifest.releaseStatus}`);
  console.log(`Required artifacts missing: ${result.manifest.completeness.missingRequiredArtifacts.length}`);
  for (const missing of result.manifest.completeness.missingRequiredArtifacts) console.log(`MISSING: ${missing}`);
  if (result.manifest.releaseStatus !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
}
