import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDiagnosticBundle, createZip } from "../scripts/package-workbench-diagnostic-bundle.mjs";

const fixedTime = "2026-10-19T08:00:00.000Z";

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-diagnostic-bundle-"));
  await mkdir(path.join(root, "artifacts", "ci-logs"), { recursive: true });
  await mkdir(path.join(root, "artifacts", "generated"), { recursive: true });
  await writeFile(path.join(root, "artifacts", "workbench-release-gate-summary.json"), JSON.stringify({ status: "not-passed", stages: [{ name: "Install", outcome: "failure" }, { name: "Browser smoke", outcome: "skipped" }] }));
  await writeFile(path.join(root, "artifacts", "workbench-release-gate-summary.md"), "NOT PASSED\n");
  await writeFile(path.join(root, "artifacts", "ci-logs", "toolchain.log"), "node v22\n");
  await writeFile(path.join(root, "artifacts", "generated", "openapi.json"), "{}\n");
  await writeFile(path.join(root, "artifacts", "generated", "schema.sql"), "SELECT 1;\n");
  return root;
}

test("creates a ZIP bundle with an embedded manifest and exact file hashes", async () => {
  const root = await fixtureRoot();
  try {
    const result = await createDiagnosticBundle({ root, generatedAt: fixedTime });
    assert.ok(result.bundleBytes > 100);
    const zip = await readFile(result.bundlePath);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.releaseStatus, "not-passed");
    assert.deepEqual(manifest.failedStages, [{ name: "Install", outcome: "failure" }]);
    assert.deepEqual(manifest.skippedStages, [{ name: "Browser smoke", outcome: "skipped" }]);
    assert.equal(manifest.generatedAt, fixedTime);
    assert.ok(manifest.files.some((file) => file.path === "artifacts/generated/openapi.json"));
    const toolchain = manifest.files.find((file) => file.path === "artifacts/ci-logs/toolchain.log");
    assert.equal(toolchain.sha256, createHash("sha256").update("node v22\n").digest("hex"));
    assert.ok(manifest.completeness.missingRequiredArtifacts.includes("artifacts/workbench-browser-smoke-result.json"));
    assert.equal(manifest.completeness.complete, false);
    assert.ok(!manifest.files.some((file) => file.path.endsWith("diagnostic-bundle.zip")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("diagnostic packaging never converts a failed gate into a pass", async () => {
  const root = await fixtureRoot();
  try {
    await createDiagnosticBundle({ root, generatedAt: fixedTime });
    const manifest = JSON.parse(await readFile(path.join(root, "artifacts", "workbench-release-diagnostic-manifest.json"), "utf8"));
    assert.equal(manifest.releaseStatus, "not-passed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("dependency-free ZIP writer emits a valid empty archive", () => {
  const zip = createZip([], new Date(fixedTime));
  assert.equal(zip.readUInt32LE(0), 0x06054b50);
  assert.equal(zip.readUInt16LE(8), 0);
  assert.equal(zip.readUInt16LE(10), 0);
});
