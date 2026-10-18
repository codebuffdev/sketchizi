import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectExcalidrawFontAssets, renderFontPreflight } from "../scripts/verify-excalidraw-font-assets.mjs";

async function makeProject(t, { declaredVersion = "0.18.0-c0ad61c", lockedVersion = declaredVersion, installedVersion = lockedVersion, fontFiles = ["ComicShanns/Regular.woff2"] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sketchizi-font-preflight-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "1.10.86", dependencies: { "@excalidraw/excalidraw": declaredVersion } }));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@excalidraw/excalidraw": { version: lockedVersion } } }));
  const packageRoot = path.join(root, "node_modules", "@excalidraw", "excalidraw");
  await mkdir(packageRoot, { recursive: true });
  if (installedVersion) await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: "@excalidraw/excalidraw", version: installedVersion }));
  for (const fontFile of fontFiles) {
    const output = path.join(packageRoot, "dist", "prod", "fonts", fontFile);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, Buffer.from([0, 1, 2]));
  }
  return root;
}

test("passes when declared, locked, and installed versions match and fonts exist", async (t) => {
  const root = await makeProject(t);
  const result = await inspectExcalidrawFontAssets(root);
  assert.equal(result.status, "passed");
  assert.equal(result.fonts.fontFileCount, 1);
  assert.equal(result.dependency.installedVersion, "0.18.0-c0ad61c");
  assert.match(renderFontPreflight(result), /font assets are consistent/);
});

test("fails when the installed dependency differs from the lockfile", async (t) => {
  const root = await makeProject(t, { installedVersion: "0.18.1" });
  const result = await inspectExcalidrawFontAssets(root);
  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.includes("does not match lockfile version")));
});

test("fails when the declared and locked dependency versions differ", async (t) => {
  const root = await makeProject(t, { lockedVersion: "0.18.1" });
  const result = await inspectExcalidrawFontAssets(root);
  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.includes("package.json declares")));
});

test("does not treat an empty font directory as successful self-hosting", async (t) => {
  const root = await makeProject(t, { fontFiles: [] });
  await mkdir(path.join(root, "node_modules", "@excalidraw", "excalidraw", "dist", "prod", "fonts"), { recursive: true });
  const result = await inspectExcalidrawFontAssets(root);
  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.includes("contains no")));
});

test("reports a missing installed dependency instead of assuming it exists", async (t) => {
  const root = await makeProject(t, { installedVersion: null, fontFiles: [] });
  const result = await inspectExcalidrawFontAssets(root);
  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.includes("confirm npm ci completed successfully")));
});
