import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(scriptDirectory, "..");
const DEFAULT_BUNDLE = path.join(PROJECT_ROOT, "artifacts", "workbench-release-diagnostic-bundle.zip");
const MANIFEST_PATH = "workbench-release-diagnostic-manifest.json";
const MAX_ENTRIES = 10000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeArchivePath(name) {
  if (!name || name.includes("\\") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return false;
  return name.split("/").every((part) => part !== ".." && part !== ".");
}

/** Read a bounded, single-disk ZIP with stored or DEFLATE entries. */
export function readDiagnosticZip(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const searchStart = Math.max(0, buffer.length - 65557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("ZIP end-of-central-directory record is missing");
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const diskEntries = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) throw new Error("Multi-disk ZIP archives are not supported");
  if (entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) throw new Error("ZIP64 archives are not supported");
  if (entryCount > MAX_ENTRIES) throw new Error(`ZIP contains too many entries (${entryCount})`);
  if (eocd + 22 + commentLength > buffer.length || centralOffset + centralSize > eocd) throw new Error("ZIP directory bounds are invalid");

  const entries = new Map();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`Invalid central directory entry ${index}`);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const entryCommentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (end > buffer.length) throw new Error(`Central directory entry ${index} exceeds archive bounds`);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!safeArchivePath(name)) throw new Error(`Unsafe archive path: ${name}`);
    if (entries.has(name)) throw new Error(`Duplicate archive entry: ${name}`);
    if (flags & 1) throw new Error(`Encrypted ZIP entry is not supported: ${name}`);
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    if (uncompressedSize > MAX_FILE_BYTES) throw new Error(`ZIP entry exceeds size limit: ${name}`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_BYTES) throw new Error("ZIP exceeds total uncompressed size limit");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local header: ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`Compressed data exceeds archive bounds: ${name}`);
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    if (localName !== name) throw new Error(`Local/central filename mismatch: ${name}`);
    let data;
    try { data = method === 0 ? buffer.subarray(dataStart, dataEnd) : inflateRawSync(buffer.subarray(dataStart, dataEnd), { maxOutputLength: MAX_FILE_BYTES }); }
    catch { throw new Error(`Unable to decompress ZIP entry: ${name}`); }
    if (data.length !== uncompressedSize) throw new Error(`Uncompressed size mismatch: ${name}`);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP CRC mismatch: ${name}`);
    entries.set(name, Buffer.from(data));
    cursor = end;
  }
  if (cursor !== centralOffset + centralSize) throw new Error("Central directory size does not match its entries");
  return entries;
}

function isSha256(value) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value); }

export function verifyDiagnosticBundleEntries(entries) {
  const errors = [];
  const warnings = [];
  const manifestBuffer = entries.get(MANIFEST_PATH);
  if (!manifestBuffer) return { valid: false, errors: [`Embedded manifest is missing: ${MANIFEST_PATH}`], warnings, checkedFiles: 0, missingFiles: [], unexpectedFiles: [] };
  let manifest;
  try { manifest = JSON.parse(manifestBuffer.toString("utf8")); }
  catch { return { valid: false, errors: ["Embedded manifest is not valid JSON"], warnings, checkedFiles: 0, missingFiles: [], unexpectedFiles: [] }; }
  if (!manifest || manifest.schemaVersion !== 1 || manifest.bundleType !== "sketchizi-workbench-release-diagnostics" || !Array.isArray(manifest.files)) {
    return { valid: false, errors: ["Embedded manifest has an unsupported schema or invalid files list"], warnings, checkedFiles: 0, missingFiles: [], unexpectedFiles: [] };
  }

  const expected = new Map();
  for (const item of manifest.files) {
    if (!item || typeof item.path !== "string" || !safeArchivePath(item.path) || item.path === MANIFEST_PATH) {
      errors.push(`Manifest contains an invalid or reserved file path: ${String(item?.path)}`);
      continue;
    }
    if (expected.has(item.path)) { errors.push(`Manifest contains duplicate file entry: ${item.path}`); continue; }
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0) errors.push(`Manifest has invalid byte count: ${item.path}`);
    if (!isSha256(item.sha256)) errors.push(`Manifest has invalid SHA-256: ${item.path}`);
    expected.set(item.path, item);
  }
  const actualNames = new Set([...entries.keys()].filter((name) => name !== MANIFEST_PATH));
  const missingFiles = [...expected.keys()].filter((name) => !actualNames.has(name)).sort();
  const unexpectedFiles = [...actualNames].filter((name) => !expected.has(name)).sort();
  for (const name of missingFiles) errors.push(`Manifest file is missing from ZIP: ${name}`);
  for (const name of unexpectedFiles) errors.push(`Unexpected ZIP entry not covered by manifest: ${name}`);
  let checkedFiles = 0;
  for (const [name, item] of expected) {
    const data = entries.get(name);
    if (!data) continue;
    checkedFiles++;
    if (Number.isSafeInteger(item.bytes) && data.length !== item.bytes) errors.push(`Byte count mismatch for ${name}: manifest=${item.bytes}, actual=${data.length}`);
    if (isSha256(item.sha256)) {
      const actualHash = createHash("sha256").update(data).digest("hex");
      if (actualHash !== item.sha256.toLowerCase()) errors.push(`SHA-256 mismatch for ${name}`);
    }
  }
  if (manifest.releaseStatus !== "passed") warnings.push(`Bundle records release status '${String(manifest.releaseStatus)}'; integrity verification does not imply release success.`);
  if (manifest.completeness?.complete !== true) warnings.push("Manifest reports missing required release artifacts; inspect completeness.missingRequiredArtifacts.");
  return { valid: errors.length === 0, errors, warnings, checkedFiles, missingFiles, unexpectedFiles, releaseStatus: manifest.releaseStatus ?? "unknown", manifestGeneratedAt: manifest.generatedAt ?? null };
}

export async function verifyDiagnosticBundle(bundlePath = DEFAULT_BUNDLE) {
  const absolutePath = path.resolve(bundlePath);
  const archive = await readFile(absolutePath);
  const entries = readDiagnosticZip(archive);
  return { bundlePath: absolutePath, archiveBytes: archive.length, ...verifyDiagnosticBundleEntries(entries) };
}

export async function verifyDiagnosticBundleAndWriteReport(bundlePath = DEFAULT_BUNDLE, reportPath = path.join(PROJECT_ROOT, "artifacts", "workbench-release-diagnostic-verification.json")) {
  const absoluteBundlePath = path.resolve(bundlePath);
  let result;
  try {
    result = await verifyDiagnosticBundle(absoluteBundlePath);
  } catch (error) {
    result = {
      bundlePath: absoluteBundlePath,
      valid: false,
      errors: [`Diagnostic bundle verification failed: ${error?.message || error}`],
      warnings: [],
      checkedFiles: 0,
      missingFiles: [],
      unexpectedFiles: [],
      releaseStatus: "unknown",
    };
  }
  const report = {
    schemaVersion: 1,
    verificationStatus: result.valid ? "passed" : "failed",
    verifiedAt: new Date().toISOString(),
    bundlePath: path.relative(PROJECT_ROOT, result.bundlePath) || result.bundlePath,
    archiveBytes: result.archiveBytes ?? null,
    integrityValid: result.valid,
    checkedFiles: result.checkedFiles,
    releaseStatus: result.releaseStatus ?? "unknown",
    errors: result.errors,
    warnings: result.warnings,
    missingFiles: result.missingFiles ?? [],
    unexpectedFiles: result.unexpectedFiles ?? [],
  };
  await mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function main() {
  const bundlePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_BUNDLE;
  const reportPath = path.join(PROJECT_ROOT, "artifacts", "workbench-release-diagnostic-verification.json");
  const result = await verifyDiagnosticBundleAndWriteReport(bundlePath, reportPath);
  console.log(`Bundle: ${result.bundlePath}`);
  console.log(`Integrity: ${result.integrityValid ? "VALID" : "INVALID"}`);
  console.log(`Files checked: ${result.checkedFiles}`);
  console.log(`Recorded release status: ${result.releaseStatus}`);
  console.log(`Verification report: ${path.relative(PROJECT_ROOT, reportPath)}`);
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  if (result.verificationStatus !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
}
