import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/workbench.css", import.meta.url), "utf8");

test("relationship inspector previews source, target and selected relationship before creation", () => {
  assert.match(panel, /CONNECTION PREVIEW/);
  assert.match(panel, /selectedEntity\.name \|\| "Source component"/);
  assert.match(panel, /target\?\.name \|\| "Choose target"/);
  assert.match(panel, /aria-live="polite"/);
});

test("relationship inspector blocks duplicate typed relationships before submission", () => {
  assert.match(panel, /const existingRelation = target \? workbench\.relations\.find/);
  assert.match(panel, /This typed relationship already exists\./);
  assert.match(panel, /disabled=\{!canEdit \|\| busy \|\| !valid\}/);
});

test("relationship preview explains incompatible endpoints and styles valid and invalid states", () => {
  assert.match(panel, /endpointValidation\.reason/);
  assert.match(panel, /workbench-relation-preview\$\{target && valid \? " is-valid" : target \? " is-invalid" : ""\}/);
  assert.match(css, /\.workbench-relation-preview\.is-valid/);
  assert.match(css, /\.workbench-relation-preview\.is-invalid/);
});
