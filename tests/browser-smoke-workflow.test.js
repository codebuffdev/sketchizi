import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/production-build.yml", import.meta.url), "utf8");
const script = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");

test("production workflow installs Chromium and runs the browser smoke after build", () => {
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm install --prefix \/tmp\/sketchizi-browser-tools --no-save --no-package-lock playwright/);
  assert.match(workflow, /\/tmp\/sketchizi-browser-tools\/node_modules\/\.bin\/playwright install --with-deps chromium/);
  assert.match(workflow, /node scripts\/browser-smoke\.mjs/);
});

test("browser smoke covers configured AWS template creation and editor handoff", () => {
  for (const pattern of [/What are you designing\?/, /AWS architecture/, /Three-Tier AWS Web Application/, /Configure first/, /AWS region/, /Environment/, /Use template/, /\.excalidraw/]) {
    assert.match(script, pattern);
  }
});

test("System Design browser smoke uses the shared Icon Library and top-bar actions", () => {
  assert.match(script, /Add Component/);
  assert.match(script, /System Design \(22\)/);
  assert.match(script, /Add \$\{label\} to canvas/);
  assert.doesNotMatch(script, /Auto-Layout components/);
  assert.doesNotMatch(script, /primitiveDock|System design primitives/);
  assert.match(script, /\.sd-dock/);
});

test("browser drawing smoke waits for the current active-tab status marker", async () => {
  const drawingScript = await readFile(new URL("../scripts/browser-drawing-smoke.mjs", import.meta.url), "utf8");
  assert.match(drawingScript, /\.canvas-tab\.is-active \.canvas-tab-status-dot/);
  assert.doesNotMatch(drawingScript, /canvas-tab-status-dot\.is-ready/);
});

test("browser smoke covers blank canvas and narrow viewport overflow", () => {
  assert.match(script, /Start blank/);
  assert.match(script, /width: 390, height: 844/);
  assert.match(script, /scrollWidth >/);
  assert.match(script, /horizontal overflow/);
});

test("browser smoke follows the current canvas and DevOps entry points", () => {
  assert.match(script, /getByRole\("button", \{ name: "Canvas style" \}\)/);
  assert.match(script, /getByRole\("button", \{ name: "Browse templates" \}\)/);
  assert.match(script, /getByRole\("button", \{ name: "Create new tab" \}\)/);
  assert.match(script, /getByRole\("button", \{ name: "DevOps" \}\)/);
  assert.match(script, /getByRole\("menu", \{ name: "DevOps tools" \}\)/);
});

test("production workflow builds and performs browser smoke even when unrelated regression tests fail", () => {
  assert.match(workflow, /id: regression\s+continue-on-error: true/);
  assert.match(workflow, /Enforce regression suite result/);
  assert.match(workflow, /steps\.regression\.outcome == 'failure'/);
  const build = workflow.indexOf("run: npm run build");
  const smoke = workflow.indexOf("node scripts/browser-smoke.mjs");
  const enforce = workflow.indexOf("name: Enforce regression suite result");
  assert.ok(build > 0 && smoke > build && enforce > smoke);
});

test("browser smoke launches studios from the command palette, not the retired Smart Studio pill", async () => {
  // Regression guard: the pill was removed from the header, but the smoke script
  // kept waiting on `.smart-studio-pill` because it only runs in the build job.
  assert.doesNotMatch(script, /locator\(["'`]\.smart-studio-pill/);
  assert.doesNotMatch(script, /name: "Studio quick launch"/);
  assert.match(script, /press\("Control\+K"\)/);

  // Every accessible name the script relies on must exist in the real source,
  // so selector drift fails fast in unit tests instead of in the browser job.
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const app = await read("src/App.jsx");
  assert.ok(app.includes('aria-label={libraryOpen ? "Close icon library" : "Open icon library"}'));
  const iconLibrary = await read("src/IconLibraryPanel.jsx");
  assert.ok(iconLibrary.includes('aria-label="Icon Library"'));
  assert.ok(iconLibrary.includes("System Design (22)"));
  const palette = await read("src/components/app/CommandPalette.jsx");
  const registry = await read("src/features/commands/commandRegistry.js");
  const docker = await read("src/features/docker-compose/ui/DockerComposeStudio.jsx");
  const k8s = await read("src/features/kubernetes-studio/ui/KubernetesStudio.jsx");

  assert.match(script, /name: "Sketchizi command palette"/);
  assert.match(script, /name: "Search commands"/);
  assert.ok(palette.includes('aria-label="Sketchizi command palette"'));
  assert.ok(palette.includes('aria-label="Search commands"'));

  for (const [commandLabel, dialogTitle, closeLabel, source] of [
    ["Docker Compose Studio", "Docker Compose Studio", "Close Docker Compose Studio", docker],
    ["Kubernetes Studio", "K8s Studio", "Close K8s Studio", k8s],
  ]) {
    assert.ok(script.includes(`openStudioFromCommandPalette(page, "${commandLabel}")`), commandLabel);
    assert.ok(registry.includes(`label: "Open ${commandLabel}"`), `registry command: ${commandLabel}`);
    assert.ok(script.includes(`name: "${dialogTitle}"`), `script dialog: ${dialogTitle}`);
    assert.match(source, new RegExp(`<h1 id="[a-z0-9-]+-title">${dialogTitle}</h1>`), `dialog title: ${dialogTitle}`);
    assert.ok(script.includes(`name: "${closeLabel}"`), `script close: ${closeLabel}`);
    assert.ok(source.includes(`aria-label="${closeLabel}"`), `close button: ${closeLabel}`);
  }
});

test("browser drawing smoke follows the nested Primary Dock child rails", async () => {
  const dock = await readFile(new URL("../src/components/app/primaryDockModel.js", import.meta.url), "utf8");
  assert.match(script, /data-slot="shapes"/);
  assert.match(script, /name: "Shapes tools"/);
  assert.match(script, /name: "Bucket Fill"/);
  assert.match(script, /data-slot="selection"/);
  assert.match(script, /name: "Select tools"/);
  assert.doesNotMatch(script, /"Draw to Shape"/);
  assert.match(dock, /id: "bucketfill", label: "Bucket Fill"/);
});
