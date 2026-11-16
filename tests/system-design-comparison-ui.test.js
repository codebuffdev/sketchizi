import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const component = fs.readFileSync("src/components/app/ArchitectureValidationPanel.jsx", "utf8");
const css = fs.readFileSync("src/styles/architecture-validation.css", "utf8");
test("comparison UI is integrated into the existing architecture validation panel", () => {
  assert.match(component, /Compare system designs/);
  assert.match(component, /compareSystemDesignArchitectures\(currentSystemDesignGraph, parsed\)/);
});
test("comparison UI validates alternative graph JSON and reports errors accessibly", () => {
  assert.match(component, /JSON\.parse\(comparisonDesignJson\)/);
  assert.match(component, /role="alert"/);
  assert.match(component, /Array\.isArray\(parsed\.nodes\).*Array\.isArray\(parsed\.edges\)/s);
});
test("comparison shows scores, metric deltas, caveat and export action", () => {
  for (const token of ["scoreDelta", "systemComparison.metrics.map", "systemComparison.caveat", "Export comparison report (JSON)"]) assert.ok(component.includes(token), token);
});
test("comparison styles support narrow viewports", () => {
  assert.match(css, /system-design-comparison-ui/);
  assert.match(css, /@media\(max-width:480px\)/);
});
test("comparison UI can load saved Sketchizi and Excalidraw designs", () => {
  assert.match(component, /loadSavedDesignForComparison/);
  assert.match(component, /\.sketchizi/);
  assert.match(component, /\.excalidraw/);
  assert.match(component, /raw\?\.type === "sketchizi" \? raw\.diagram : raw/);
  assert.match(component, /setComparisonDesignJson\(JSON\.stringify\(graph, null, 2\)\)/);
});
test("saved design import rejects unsupported files and clears file input for retry", () => {
  assert.match(component, /Choose a valid \.sketchizi, \.excalidraw, or graph JSON file/);
  assert.match(component, /event\.target\.value = ""/);
});
