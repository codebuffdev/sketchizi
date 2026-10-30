import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");

test("contextual formatting toolbar is mounted in the standard canvas workspace, not only Zen Mode", () => {
  assert.match(canvas, /<ContextualFormattingToolbar[\s\S]*?canEdit=\{canEdit && !viewModeEnabled\}/);
  assert.doesNotMatch(canvas, /zenModeEnabled[\s\S]{0,100}<ContextualFormattingToolbar/);
});

test("text creation exposes formatting controls before the first text element exists", () => {
  assert.match(toolbar, /const textTool = activeToolType === "text" \|\| noteTool/);
  assert.match(toolbar, /const activeToolMode = drawingTool \? "draw" : noteTool \? "text" : textTool \? "text"/);
  assert.match(toolbar, /activeToolMode === "text" && \["fontFamily", "fontSize", "textAlign"\]\.includes\(group\.id\)/);
  assert.match(toolbar, /\(!liveSelection\.length && !toolMode\)/);
});

test("custom Notes tool activates the same floating text-formatting controls", () => {
  assert.match(toolbar, /window\.addEventListener\("sketchizi:activate-tool", onCustomTool\)/);
  assert.match(toolbar, /setCustomToolMode\("note"\)/);
  assert.match(toolbar, /const noteTool = customToolMode === "note"/);
  assert.match(toolbar, /const noteFormattingMode = noteTool \|\| noteSelection/);
  assert.match(toolbar, /const strokePalette = noteFormattingMode \? NOTE_TEXT_COLORS : STROKE_COLORS/);
  assert.match(toolbar, /const backgroundPalette = noteFormattingMode \? NOTE_BACKGROUND_COLORS : FILL_COLORS/);
});

test("toolbar remains unavailable to viewers and non-editable sessions", () => {
  assert.match(canvas, /canEdit=\{canEdit && !viewModeEnabled\}/);
  assert.match(toolbar, /if \(!canEdit \|\| \(!liveSelection\.length && !toolMode\) \|\| !position\) return null/);
});
