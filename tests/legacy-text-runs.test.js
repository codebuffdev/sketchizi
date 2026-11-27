import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { stripLegacyTextRuns } from "../src/features/canvas/legacyTextRuns.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const text = (extra = {}) => ({ id: "t", type: "text", text: "text 111", originalText: "text 111", strokeColor: "#1e1e1e", ...extra });

test("legacy runs are flattened: text kept, per-run colors ignored, other customData preserved", () => {
  const legacy = text({ customData: { runs: [{ text: "text " }, { text: "111", color: "#e03131" }], markdownHeading: 1 } });
  const { elements, changed } = stripLegacyTextRuns([legacy]);
  assert.equal(changed, true);
  assert.equal(elements[0].text, "text 111");
  assert.equal(elements[0].strokeColor, "#1e1e1e");
  assert.deepEqual(elements[0].customData, { markdownHeading: 1 });
});

test("customData disappears when runs were its only content", () => {
  const { elements } = stripLegacyTextRuns([text({ customData: { runs: [{ text: "text 111", color: "#fff" }] } })]);
  assert.equal(elements[0].customData, undefined);
});

test("scenes without runs are returned untouched", () => {
  const scene = [text(), { id: "r", type: "rectangle" }];
  const result = stripLegacyTextRuns(scene);
  assert.equal(result.changed, false);
  assert.equal(result.elements, scene);
});

test("the runs feature is gone from canvas, editor and toolbars", () => {
  for (const gone of ["textRuns", "runsDom", "textEditorRunsMirror", "richTextRender", "textSelectionTracker"]) {
    assert.equal(existsSync(new URL(`../src/features/canvas/${gone}.js`, import.meta.url)), false, gone);
  }
  assert.equal(existsSync(new URL("../src/components/app/RichTextRunsOverlay.jsx", import.meta.url)), false);
  const canvas = read("src/components/app/SketchiziCanvas.jsx");
  assert.ok(!canvas.includes("RichTextRunsOverlay") && !canvas.includes("attachTextRunsEditor"));
  for (const file of ["src/components/app/ContextualFormattingToolbar.jsx", "src/components/app/ToolOptionsDock.jsx"]) {
    const source = read(file);
    assert.ok(!/TEXT_RUNS_CHANGED|applyColorToElement|withoutRuns|getTextEditSelection/.test(source), file);
  }
});

test("swatches keep the editor open and recolor the whole box", () => {
  const toolbar = read("src/components/app/ContextualFormattingToolbar.jsx");
  assert.ok(toolbar.includes("onMouseDown={(e) => e.preventDefault()}"));
  assert.ok(toolbar.includes("editingTextElement?.id"));
});
