import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReleaseReadinessReport, renderReleaseReadinessMarkdown } from "../scripts/release-readiness.mjs";

async function fixture(t, { fonts = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sketchizi-release-ready-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "sketchizi", version: "1.10.86", scripts: { build: "vite build" }, dependencies: { "@excalidraw/excalidraw": "0.18.0-c0ad61c" }, devDependencies: { vite: "^5.4.8" } }));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@excalidraw/excalidraw": { version: "0.18.0-c0ad61c" } } }));
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  await mkdir(path.join(root, "node_modules/.bin"), { recursive: true });
  await writeFile(path.join(root, "node_modules/.bin", process.platform === "win32" ? "vite.cmd" : "vite"), "placeholder");
  if (fonts) {
    const excalidraw = path.join(root, "node_modules/@excalidraw/excalidraw");
    await mkdir(path.join(excalidraw, "dist/prod/fonts"), { recursive: true });
    await writeFile(path.join(excalidraw, "package.json"), JSON.stringify({ version: "0.18.0-c0ad61c" }));
    await writeFile(path.join(excalidraw, "dist/prod/fonts/Regular.woff2"), "font");
  }
  for (const file of [
    "supabase/migrations/202610230001_architecture_review_collaboration.sql",
    "supabase/migrations/202610230002_architecture_review_realtime.sql",
    "scripts/test-shared-review-integration.mjs",
    "docs/design-studio/phase5m-browser-smoke-and-release-gate.md",
  ]) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "fixture");
  }
  return root;
}

const configuredEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "public-test-key",
  SUPABASE_USER_A_JWT: "user-a-token",
  SUPABASE_USER_B_JWT: "user-b-token",
  SUPABASE_WORKSPACE_ID: "workspace-test",
};

test("reports readiness only when prerequisites, artifacts, and integration configuration exist", async (t) => {
  const root = await fixture(t);
  const report = await createReleaseReadinessReport(root, configuredEnv);
  assert.equal(report.status, "ready-for-release-validation");
  assert.equal(report.checks.liveIntegration.configured, true);
  assert.equal(report.checks.productionBuild.status, "not-run");
  assert.match(renderReleaseReadinessMarkdown(report), /does not claim that a production build/);
});

test("blocks release validation when fonts or live integration configuration are missing", async (t) => {
  const root = await fixture(t, { fonts: false });
  const report = await createReleaseReadinessReport(root, {});
  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((item) => item.includes("build prerequisites")));
  assert.ok(report.blockers.some((item) => item.includes("Supabase integration")));
  assert.ok(report.checks.liveIntegration.missingVariables.includes("SUPABASE_USER_B_JWT"));
});
