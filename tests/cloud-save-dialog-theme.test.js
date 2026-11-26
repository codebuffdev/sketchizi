import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("cloud save dialog carries the active theme and App passes it", () => {
  assert.match(read("../src/features/workspace/CloudSaveDialog.jsx"), /className="cloud-save-dialog-backdrop" data-theme=\{theme\}/);
  assert.match(read("../src/App.jsx"), /<CloudSaveDialog isDarkTheme=\{isDarkTheme\}/);
  assert.match(read("../src/styles.css"), /cloud-save-dialog-theme\.css/);
});

test("light palette matches the spec; dark palette keeps the existing surfaces", () => {
  const css = read("../src/styles/cloud-save-dialog-theme.css");
  const light = css.slice(0, css.indexOf('[data-theme="dark"]'));
  const dark = css.slice(css.indexOf('[data-theme="dark"]'), css.indexOf(".cloud-save-dialog-backdrop { background"));
  for (const v of ["rgba(15, 23, 42, 0.35)", "#ffffff", "rgba(15, 23, 42, 0.1)", "0 20px 40px rgba(15, 23, 42, 0.14)", "#0f172a", "#64748b",
    "#f8fafc", "#cbd5e1", "#7c3aed", "#6d28d9", "#f1f5f9", "#334155"]) assert.ok(light.includes(v), `light missing ${v}`);
  for (const v of ["#181a20", "#111318", "rgba(255, 255, 255, 0.1)", "#f8fafc", "#7c3aed"]) assert.ok(dark.includes(v), `dark missing ${v}`);
  assert.match(css, /blur\(4px\)/);
});

test("graphite focus override from styles.css is outranked", () => {
  const css = read("../src/styles/cloud-save-dialog-theme.css");
  assert.match(css, /select:focus,[\s\S]*?\{\s*outline: 2px solid var\(--cs-focus-ring\) !important; border-color: var\(--cs-focus\) !important;/);
});
