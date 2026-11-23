import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(here, "../TopWorkspaceBar.jsx"), "utf8");
const styles = readFileSync(resolve(here, "../systemDesign.css"), "utf8");

test("renders the compact three-zone command pill without Auto-Layout", () => {
  assert.match(component, /sd-command-zone-start/);
  assert.match(component, /sd-command-zone-actions/);
  assert.match(component, /sd-command-modes/);
  assert.doesNotMatch(component, /Auto-Layout|onAutoLayout|sd-auto-layout-trigger/);
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

test("uses explicit high-contrast inline SVG strokes for toolbar icons", () => {
  assert.match(component, /width="17" height="17"/);
  assert.match(component, /stroke=\{light \? "#ffffff" : "#1e293b"\}/);
  assert.match(component, /strokeWidth="1\.9"/);
  assert.match(component, /strokeLinecap="round"/);
  assert.match(component, /strokeLinejoin="round"/);
  assert.match(component, /fill="none"/);
  assert.doesNotMatch(component, /<Icon\s/);
});

test("keeps the mode switch and simulation load control compact", () => {
  assert.match(component, /item\.id === "k8s" \? "K8s"/);
  assert.match(component, /sd-command-load/);
  assert.match(component, /aria-pressed=\{simulate\}/);
  assert.match(styles, /height: 44px/);
  assert.match(styles, /padding: 5px 8px/);
  assert.match(styles, /border-radius: 14px/);
  assert.match(styles, /background: #ffffff/);
  assert.match(styles, /width: 32px/);
  assert.match(styles, /height: 32px/);
  assert.match(styles, /background: #f1f5f9/);
  assert.match(styles, /background: #059669/);
  assert.doesNotMatch(styles, /sd-auto-layout-trigger|sd-components-trigger/);
});
