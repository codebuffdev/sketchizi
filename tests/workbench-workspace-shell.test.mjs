import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/responsive-final.css", import.meta.url), "utf8");

test("open Workbench participates in the desktop workspace grid instead of overlaying the canvas", () => {
  assert.match(app, /desktop-workspace-workbench-open/);
  assert.match(app, /<\/section>\s*<WorkbenchPanel[\s\S]*?<aside\s+className=\{`desktop-context-region/);
  const canvasStart = app.indexOf('<section className="desktop-canvas-region"');
  const panelStart = app.indexOf("<WorkbenchPanel", canvasStart);
  const canvasEnd = app.indexOf("</section>", canvasStart);
  assert.ok(panelStart > canvasEnd, "WorkbenchPanel must be a sibling after the canvas section");
  assert.match(styles, /\.desktop-workspace\.desktop-workspace-workbench-open\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /\.desktop-workspace\.desktop-workspace-workbench-open \.workbench-panel\s*\{[^}]*position:\s*relative/);
});

test("narrow viewports retain an overlay fallback rather than compressing the canvas into a tiny column", () => {
  assert.match(styles, /@media \(max-width:\s*700px\)[\s\S]*?\.desktop-workspace\.desktop-workspace-workbench-open\s*\{\s*display:\s*block/);
  assert.match(styles, /\.desktop-workspace\.desktop-workspace-workbench-open \.workbench-panel\s*\{[^}]*position:\s*absolute/);
});
