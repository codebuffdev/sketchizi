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
  assert.ok(lines.length <= 18, `App.jsx has ${lines.length} system-design integration lines`);
  assert.match(app, /useSystemDesignWorkspace\(\{ apiRef/);
  assert.match(app, /lazy\(\(\) => import\("\.\/features\/system-design\/SystemDesignStudio\.jsx"\)\)/);
  assert.doesNotMatch(app, /simulateTraffic|orthogonalRouter|useState\([^)]*loadRps/);
});

test("studio chrome: one top-centre pill, no duplicated Sketchizi controls", () => {
  const top = read(path.join(dir, "TopWorkspaceBar.jsx"));
  for (const text of ["Simulate", "Studio mode", "Close system design studio"]) assert.ok(top.includes(text), text);
  assert.match(top, /STUDIO_MODES/);
  // Sketchizi's header owns tabs, save status, zoom (top-left / top-right). The studio must not render its own.
  for (const text of ["New tab", "Zoom in", "Zoom out", "sd-topbar-right", "sd-topbar-left", "persistencePill"]) assert.ok(!top.includes(text), `duplicate control: ${text}`);
  assert.match(top, /className="sd-components-trigger"/);
  assert.match(top, /onClick=\{onOpenIconLibrary\}/);
  assert.match(top, /className="sd-auto-layout-trigger"/);
  assert.match(top, /onClick=\{onAutoLayout\}/);
  const studio = read(path.join(dir, "SystemDesignStudio.jsx"));
  assert.doesNotMatch(studio, /CollapsibleQuickDock|sd-dock/);
  const insp = read(path.join(dir, "ContextualInspectorDrawer.jsx"));
  for (const text of ["Replicas", "Capacity", "Cache hit rate", "Health override", "Line style", "Accent", "YAML", "Inspect"]) assert.ok(insp.includes(text), text);
  assert.match(insp, /\{selection && <div className="sd-surface sd-pill-bar"/);
  assert.doesNotMatch(insp, /if \(!selection\) return null/);
  assert.match(studio, /useState\(false\)/, "inspector must start closed");
  assert.match(read(path.join(dir, "TopWorkspaceBar.jsx")), /Inspector/);
  assert.match(insp, /\{open && \(\s*<aside/, "drawer only mounts when explicitly opened");
  const overlay = read(path.join(dir, "SystemDesignNodeOverlay.jsx"));
  assert.match(overlay, /PORTS\.map/);
  assert.match(overlay, /animateMotion/);
  assert.match(overlay, /dblclick/);
  assert.match(overlay, /PrimitiveIcon/);
  assert.doesNotMatch(overlay, /sd-node-dot/, "plain colour dots were replaced by icons");
});

test("single-visual contract: no ring on the card and Sketchizi native toolbars remain visible", () => {
  const css = read(path.join(dir, "systemDesign.css"));
  assert.doesNotMatch(css, /sketchizi-tool-options-dock|display:\s*none\s*!important/);
  assert.doesNotMatch(css, /\.sd-dock|\.sd-more-menu/);
  const selected = css.match(/\.sd-node\.is-selected \{[^}]*\}/)[0];
  assert.doesNotMatch(selected, /border-color|(?<!inset )0 0 0 \d+px/, "selected card must not draw a second outline next to Excalidraw's selection box");
  // Studio bar sits below Sketchizi's first row and derives from ITS variables.
  assert.match(css, /--sd-bar-top: calc\(var\(--header-top, 12px\) \+ var\(--top-row-height, 42px\)/);
  assert.match(css, /--sd-rail-clear: calc\(var\(--header-rail-right, 12px\) \+ var\(--header-rail-width, 56px\)/);
  // Top-bar dropdowns must sit above the drawer rather than being clipped by it.
  assert.match(css, /\.sd-topbar \{ position: absolute; z-index: 3;/);
  assert.doesNotMatch(css, /\.sd-dock/);
  assert.doesNotMatch(css, /\.sd-sim-btn|\.sd-topbar-right|\.sd-zoom|\.sd-tabs|\.sd-persist/);
});

test("command registry exposes the studio and every feature file exists", () => {
  assert.match(read(path.join(root, "src/features/commands/commandRegistry.js")), /studios\.system-design/);
  const files = readdirSync(dir);
  for (const f of ["primitives.js", "trafficSimulator.js", "orthogonalRouter.js", "useSystemDesignWorkspace.js", "TopWorkspaceBar.jsx", "SystemDesignNodeOverlay.jsx", "ContextualInspectorDrawer.jsx"]) assert.ok(files.includes(f), f);
});


test("connector UX has pointer-captured ports, whole-card snapping, click-to-connect, and minimum card sizing", () => {
  const overlay = read(path.join(dir, "SystemDesignNodeOverlay.jsx"));
  const css = read(path.join(dir, "systemDesign.css"));
  assert.match(overlay, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(overlay, /event\.stopPropagation\(\)/);
  assert.match(overlay, /nodeAt\(graph\.nodes, point, drag\.fromId, 20\)/);
  assert.match(overlay, /host\.addEventListener\("click", onClick, true\)/);
  assert.match(overlay, /event\.key\.toLowerCase\(\) !== "c"/);
  assert.match(overlay, /sd-edge-preview/);
  assert.match(css, /\.sd-port \{ position: absolute; width: 24px; height: 24px/);
  assert.match(css, /\.sd-port::before \{ content: ""; position: absolute; inset: 7px/);
  assert.match(css, /\.sd-node \{ min-width: 204px; min-height: 88px/);
  assert.match(css, /\.sd-node-foot \.sd-status \{ flex-shrink: 0; white-space: nowrap; \}/);
});
