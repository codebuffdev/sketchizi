import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(here, "../TopWorkspaceBar.jsx"), "utf8");
const styles = readFileSync(resolve(here, "../systemDesign.css"), "utf8");
const studio = readFileSync(resolve(here, "../SystemDesignStudio.jsx"), "utf8");

test("renders the compact three-zone command pill without Auto-Layout", () => {
  assert.match(component, /sd-command-zone-start/);
  assert.match(component, /sd-command-zone-actions/);
  assert.match(component, /sd-command-modes/);
  assert.doesNotMatch(component, /Auto-Layout|onAutoLayout|sd-auto-layout-trigger/);
  assert.doesNotMatch(studio, /onAutoLayout|actions\.autoLayout/);
});

test("exposes the requested icon-first actions and keyboard tooltips", () => {
  for (const label of [
    'label="Add Component" shortcut="A"',
    'label="Blueprints" shortcut="B"',
    'label="Export Stack" shortcut="E"',
    'label="Inspector & YAML" shortcut="I"',
    'label="Exit Studio"',
  ]) assert.ok(component.includes(label), `missing ${label}`);
  assert.match(component, /data-tooltip=\{tooltip\}/);
});

test("uses theme-inheriting SVG strokes for toolbar icons", () => {
  assert.match(component, /stroke="currentColor"/);
  assert.match(component, /strokeWidth="1\\.9"/);
  assert.match(component, /strokeLinecap="round"/);
  assert.match(component, /strokeLinejoin="round"/);
  assert.match(component, /fill="none"/);
  assert.doesNotMatch(component, /light = false|stroke=\\{light \\?/);
  assert.doesNotMatch(component, /<Icon\\s/);
});

test("uses shared light/dark theme tokens throughout the floating toolbar", () => {
  assert.match(studio, /className=\{\x60sd-root\$\{isDarkTheme \? " is-dark" : ""\}\x60\}/);
  assert.match(styles, /\\.sd-root\\.is-dark\\s*\\{[^}]*--sd-surface: rgba\\(30,41,59,\\.86\\)/s);
  assert.match(styles, /\\.sd-topbar-pill[^{]*\\{[^}]*background: var\\(--sd-surface\\)/s);
  assert.match(styles, /\\.sd-command-divider[^}]*background: var\\(--sd-border\\)/);
  assert.match(styles, /\\.sd-command-icon-btn[^}]*color: var\\(--sd-text-2\\)/);
  assert.match(styles, /\\.sd-command-modes[^}]*background: var\\(--sd-soft\\)/);
  assert.match(styles, /\\.sd-command-modes button\\.is-active[^}]*background: var\\(--sd-card\\)/);
  assert.match(styles, /\\.sd-command-sim-main, \\.sd-command-sim-caret[^}]*background: var\\(--sd-soft\\)/);
  assert.match(styles, /\\.sd-command-load[^}]*color: var\\(--sd-text-2\\)/);
  assert.match(styles, /\\.sd-command-icon-btn\\[data-tooltip\\]::after[^}]*background: var\\(--sd-card\\)/);
  assert.match(styles, /height: 32px/);
  assert.match(styles, /width: 32px/);
  assert.match(styles, /background: var\\(--sd-emerald\\)/);
  assert.doesNotMatch(styles.slice(styles.indexOf("/* Floating command bar:"), styles.indexOf("@media (max-width: 760px)")), /#ffffff|#1e293b|#f1f5f9|#475569|#0f172a|#cbd5e1/);
  assert.doesNotMatch(styles, /sd-auto-layout-trigger|sd-components-trigger/);
});
