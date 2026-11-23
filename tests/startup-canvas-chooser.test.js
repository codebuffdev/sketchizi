import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const chooserCss = await readFile(new URL("../src/styles/startup-canvas-chooser.css", import.meta.url), "utf8");

test("Start with chooser exposes all four primary workspace options", () => {
  for (const label of ["Infinity", "Pages", "Todo", "System Design"]) {
    assert.match(appSource, new RegExp(`<span>${label}</span>`), `missing ${label} option`);
  }
  assert.match(appSource, /chooseStartupCanvas\("system-design"\)/);
  assert.match(appSource, /Architect systems, simulate load &amp; export stacks\./);
});

test("System Design startup choice closes the chooser and opens the active workspace", () => {
  const choiceStart = appSource.indexOf("const chooseStartupCanvas = useCallback");
  const choiceEnd = appSource.indexOf("// \"Open Local File\"", choiceStart);
  assert.notEqual(choiceStart, -1);
  assert.notEqual(choiceEnd, -1);
  const choiceHandler = appSource.slice(choiceStart, choiceEnd);
  assert.match(choiceHandler, /setStartupChooserOpen\(false\)/);
  assert.match(choiceHandler, /if \(mode === "system-design"\)\s*\{\s*systemDesign\.open\(\);\s*return;/);
  assert.match(choiceHandler, /if \(mode === "todo"\)\s*\{\s*openTodoTab\(\);/);
  assert.match(choiceHandler, /sketchizi:choose-canvas-mode/);
});

test("four-card chooser is balanced and responsive without changing file-open layout", () => {
  assert.match(chooserCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(chooserCss, /max-width: 560px/);
  assert.match(chooserCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(chooserCss, /\.startup-canvas-options-open\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(chooserCss, /border-color: #059669/);
});
