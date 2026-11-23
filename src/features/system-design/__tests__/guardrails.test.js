import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(dir, "../../..");
const read = (p) => readFileSync(p, "utf8");

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (d < 0.08) return null; // neutral
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}

test("system design styles contain no purple-family colours and no purple keywords", () => {
  const css = read(path.join(dir, "systemDesign.css"));
  for (const hex of css.match(/#[0-9a-fA-F]{6}\b/g) || []) {
    const h = hue(hex);
    assert.ok(h === null || h < 235 || h > 335, `${hex} has purple hue ${h}`);
  }
  assert.doesNotMatch(css, /purple|violet|indigo|magenta/i);
  for (const rgba of css.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) {
    const hex = `#${[1, 2, 3].map((i) => Number(rgba[i]).toString(16).padStart(2, "0")).join("")}`;
    const h = hue(hex);
    assert.ok(h === null || h < 235 || h > 335, `${rgba[0]} purple`);
  }
});

test("CSS braces balance and typography contract holds", () => {
  const css = read(path.join(dir, "systemDesign.css"));
  assert.equal(css.split("{").length, css.split("}").length);
  assert.match(css, /JetBrains Mono.*Consolas.*monospace/);
  assert.match(css, /backdrop-filter: blur/);
  assert.match(css, /border-radius: 14px/);
});

test("App.jsx stays thin: one hook call, one lazy studio mount, no workspace state inline", () => {
  const app = read(path.join(root, "src/App.jsx"));
  const lines = app.split("\n").filter((l) => /systemDesign|SystemDesign|system-design/.test(l));
  assert.ok(lines.length <= 8, `App.jsx has ${lines.length} system-design lines`);
  assert.match(app, /useSystemDesignWorkspace\(\{ apiRef/);
  assert.match(app, /lazy\(\(\) => import\("\.\/features\/system-design\/SystemDesignStudio\.jsx"\)\)/);
  assert.doesNotMatch(app, /simulateTraffic|orthogonalRouter|useState\([^)]*loadRps/);
});

test("studio chrome exposes the required controls", () => {
  const top = read(path.join(dir, "TopWorkspaceBar.jsx"));
  for (const text of ["Canvas", "Simulate Traffic", "Snap", "Zoom in", "Zoom out", "New tab"]) assert.ok(top.includes(text), text);
  assert.match(top, /STUDIO_MODES/);
  const dock = read(path.join(dir, "CollapsibleQuickDock.jsx"));
  assert.match(dock, /Auto-Layout/);
  assert.match(dock, /onPointerEnter/);
  const insp = read(path.join(dir, "ContextualInspectorDrawer.jsx"));
  for (const text of ["Replicas", "Capacity", "Cache hit rate", "Health override", "Line style", "Accent"]) assert.ok(insp.includes(text), text);
  assert.match(insp, /if \(!selection\) return null/);
  const overlay = read(path.join(dir, "SystemDesignNodeOverlay.jsx"));
  assert.match(overlay, /PORTS\.map/);
  assert.match(overlay, /animateMotion/);
  assert.match(overlay, /dblclick/);
});

test("command registry exposes the studio and every feature file exists", () => {
  assert.match(read(path.join(root, "src/features/commands/commandRegistry.js")), /studios\.system-design/);
  const files = readdirSync(dir);
  for (const f of ["primitives.js", "trafficSimulator.js", "orthogonalRouter.js", "useSystemDesignWorkspace.js", "TopWorkspaceBar.jsx", "CollapsibleQuickDock.jsx", "SystemDesignNodeOverlay.jsx", "ContextualInspectorDrawer.jsx"]) assert.ok(files.includes(f), f);
});
