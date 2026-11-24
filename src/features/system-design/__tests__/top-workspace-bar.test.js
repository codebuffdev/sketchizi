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
  assert.ok(component.includes('stroke="currentColor"'));
  assert.ok(component.includes('strokeWidth="1.9"'));
  assert.ok(component.includes('strokeLinecap="round"'));
  assert.ok(component.includes('strokeLinejoin="round"'));
  assert.ok(component.includes('fill="none"'));
  assert.ok(!component.includes('light = false'));
  assert.ok(!component.includes('stroke={light ?'));
  assert.doesNotMatch(component, /<Icon\\s/);
});

test("uses shared light/dark theme tokens throughout the floating toolbar", () => {
  assert.ok(studio.includes('className={`sd-root${isDarkTheme ? " is-dark" : ""}`}'));
  assert.ok(styles.includes(".sd-root.is-dark {"));
  assert.ok(styles.includes("--sd-surface: rgba(30,41,59,.86)"));
  assert.ok(styles.includes(".sd-surface { pointer-events: auto; background: var(--sd-surface)"));
  assert.ok(styles.includes(".sd-command-divider { height: 22px; margin: 0 2px; background: var(--sd-border)"));
  assert.ok(styles.includes("color: var(--sd-text-2)"));
  assert.ok(styles.includes(".sd-command-modes {"));
  assert.ok(styles.includes("background: var(--sd-soft)"));
  assert.ok(styles.includes("background: var(--sd-card)"));
  assert.ok(styles.includes(".sd-command-sim-main, .sd-command-sim-caret"));
  assert.ok(styles.includes(".sd-command-load {"));
  assert.ok(styles.includes("border: 1px solid var(--sd-border)"));
  const toolbarStyles = styles.slice(styles.indexOf("/* Floating command bar:"), styles.indexOf("@media (max-width: 760px)"));
  assert.doesNotMatch(toolbarStyles, /background:\\s*#(?:ffffff|1e293b|f1f5f9|475569|0f172a|cbd5e1)/);
  assert.doesNotMatch(styles, /sd-auto-layout-trigger|sd-components-trigger/);
});
