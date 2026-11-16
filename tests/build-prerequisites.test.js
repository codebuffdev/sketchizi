import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkBuildPrerequisites, renderBuildPrerequisites } from "../scripts/check-build-prerequisites.mjs";

async function makeProject(t, { vite = true, fonts = true, html = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sketchizi-build-prereq-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "1.10.86", scripts: { build: "vite build" }, dependencies: { "@excalidraw/excalidraw": "0.18.0-c0ad61c" }, devDependencies: { vite: "^5.4.8" } }));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@excalidraw/excalidraw": { version: "0.18.0-c0ad61c" } } }));
  if (html) await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  if (vite) {
    await mkdir(path.join(root, "node_modules", ".bin"), { recursive: true });
    await writeFile(path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite"), "placeholder");
  }
  if (fonts) {
    const packageRoot = path.join(root, "node_modules", "@excalidraw", "excalidraw");
    await mkdir(path.join(packageRoot, "dist", "prod", "fonts"), { recursive: true });
    await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ version: "0.18.0-c0ad61c" }));
    await writeFile(path.join(packageRoot, "dist", "prod", "fonts", "Regular.woff2"), "font");
  }
  return root;
}

test("reports ready only when entry page, Vite, and pinned font assets exist", async (t) => {
  const root = await makeProject(t);
  const report = await checkBuildPrerequisites(root);
  assert.equal(report.status, "ready");
  assert.equal(report.nextCommand, "npm run build");
  assert.match(renderBuildPrerequisites(report), /prerequisites: READY/);
});

test("identifies missing Vite and provides an actionable dependency-install step", async (t) => {
  const root = await makeProject(t, { vite: false });
  const report = await checkBuildPrerequisites(root);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some((issue) => issue.includes("Run npm ci")));
});

test("does not report ready when the installed font package is absent", async (t) => {
  const root = await makeProject(t, { fonts: false });
  const report = await checkBuildPrerequisites(root);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some((issue) => issue.includes("Installed @excalidraw/excalidraw package.json is missing")));
});

test("reports a missing HTML entry page explicitly", async (t) => {
  const root = await makeProject(t, { html: false });
  const report = await checkBuildPrerequisites(root);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some((issue) => issue.includes("index.html is missing")));
});
