import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyColorToElement, colorAtSelection, compactRuns, expandRunsForExport, getElementRuns,
  layoutRuns, mapWrappedToOriginal, rebaseRuns, withoutRuns,
} from "../src/features/canvas/textRuns.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const box = (text, extra = {}) => ({
  id: "t1", type: "text", x: 100, y: 50, width: text.length * 10, height: 25, angle: 0,
  text, originalText: text, strokeColor: "#1e1e1e", fontSize: 20, lineHeight: 1.25, fontFamily: 5,
  textAlign: "left", ...extra,
});
const apply = (element, patch) => ({ ...element, ...patch });
const shape = (runs) => runs.map((r) => [r.text, r.color ?? null]);
const measure = () => (text) => text.length * 10;

test("partial selection colors only the highlighted substring", () => {
  const el = box("text hello");
  const next = apply(el, applyColorToElement(el, "#e03131", { start: 5, end: 10 }));
  assert.equal(next.strokeColor, "#1e1e1e", "base color untouched");
  assert.deepEqual(shape(getElementRuns(next)), [["text ", null], ["hello", "#e03131"]]);
});

test("trying several swatches on the same range replaces the color, not stacks it", () => {
  let el = box("text hello");
  for (const color of ["#e03131", "#2f9e44", "#1971c2"]) el = apply(el, applyColorToElement(el, color, { start: 5, end: 10 }));
  assert.deepEqual(shape(getElementRuns(el)), [["text ", null], ["hello", "#1971c2"]]);
});

test("collapsed caret or no range updates the whole box and clears runs", () => {
  let el = box("text hello", { customData: { keep: 1 } });
  el = apply(el, applyColorToElement(el, "#e03131", { start: 5, end: 10 }));
  for (const range of [null, { start: 3, end: 3 }]) {
    const whole = apply(el, applyColorToElement(el, "#1971c2", range));
    assert.equal(whole.strokeColor, "#1971c2");
    assert.deepEqual(getElementRuns(whole), []);
    assert.deepEqual(whole.customData, { keep: 1 }, "unrelated customData preserved");
  }
  const bare = box("abc");
  assert.equal(apply(bare, applyColorToElement(bare, "#fff", null)).customData, undefined);
});

test("runs equal to the base color collapse away; adjacent equal runs merge", () => {
  assert.deepEqual(shape(compactRuns([{ text: "a", color: "#1E1E1E" }, { text: "b" }, { text: "c", color: "#f00" }, { text: "d", color: "#FF0000" }], "#1e1e1e")),
    [["ab", null], ["cd", "#ff0000"]]);
  // Coloring a range back to the base color removes runs entirely.
  let el = box("hello");
  el = apply(el, applyColorToElement(el, "#e03131", { start: 0, end: 2 }));
  el = apply(el, applyColorToElement(el, "#1e1e1e", { start: 0, end: 2 }));
  assert.equal(el.customData, undefined);
});

test("overlapping and reversed ranges split and merge correctly", () => {
  let el = box("abcdef");
  el = apply(el, applyColorToElement(el, "#f00", { start: 4, end: 1 }));
  el = apply(el, applyColorToElement(el, "#0f0", { start: 2, end: 5 }));
  assert.deepEqual(shape(getElementRuns(el)), [["a", null], ["b", "#ff0000"], ["cde", "#00ff00"], ["f", null]]);
});

test("colorAtSelection reports caret color, uniform highlight, or mixed", () => {
  let el = box("text hello");
  el = apply(el, applyColorToElement(el, "#e03131", { start: 5, end: 10 }));
  assert.equal(colorAtSelection(el, { start: 2, end: 2 }), "#1e1e1e");
  assert.equal(colorAtSelection(el, { start: 8, end: 8 }), "#e03131");
  assert.equal(colorAtSelection(el, { start: 5, end: 10 }), "#e03131");
  assert.equal(colorAtSelection(el, { start: 3, end: 8 }), null, "mixed");
  assert.equal(colorAtSelection(el, { start: 0, end: 0 }), "#1e1e1e");
});

test("typing keeps runs aligned with the edited text", () => {
  const runs = [{ text: "text " }, { text: "hello", color: "#e03131" }];
  assert.deepEqual(shape(rebaseRuns(runs, "text hello", "text hellox", "#1e1e1e")), [["text ", null], ["hellox", "#e03131"]]);
  assert.deepEqual(shape(rebaseRuns(runs, "text hello", "text hllo", "#1e1e1e")), [["text ", null], ["hllo", "#e03131"]]);
  assert.deepEqual(shape(rebaseRuns(runs, "text hello", "texty hello", "#1e1e1e")), [["texty ", null], ["hello", "#e03131"]]);
  assert.deepEqual(shape(rebaseRuns(runs, "text hello", "text ", "#1e1e1e")), [["text ", null]]);
});

test("wrapped container text maps back to original indices", () => {
  assert.deepEqual(mapWrappedToOriginal("ab cd", "ab\ncd"), [0, 1, -1, 3, 4]);
  assert.deepEqual(mapWrappedToOriginal("abcdef", "abc\ndef"), [0, 1, 2, -1, 3, 4, 5]);
  assert.deepEqual(mapWrappedToOriginal("a\nb", "a\nb"), [0, 1, 2]);
  assert.equal(mapWrappedToOriginal("abc", "xyz"), null);
});

test("layout advances x by each segment's measured width", () => {
  let el = box("text hello");
  el = apply(el, applyColorToElement(el, "#e03131", { start: 5, end: 10 }));
  const layout = layoutRuns(el, measure());
  const [line] = layout.lines;
  assert.deepEqual(line.segments.map((s) => [s.text, s.x, s.width, s.color]), [["text ", 0, 50, null], ["hello", 50, 50, "#e03131"]]);
  assert.equal(layout.lineHeight, 25);
});

test("layout honors alignment, wrapping and stale runs", () => {
  let el = box("ab cd", { text: "ab\ncd", width: 100, textAlign: "right" });
  el = apply(el, applyColorToElement(el, "#f00", { start: 3, end: 5 }));
  const layout = layoutRuns(el, measure());
  assert.equal(layout.lines.length, 2);
  assert.equal(layout.lines[1].offsetX, 80);
  assert.equal(layout.lines[1].segments[0].color, "#ff0000");
  assert.equal(layoutRuns({ ...el, originalText: "different length" }, measure()), null, "stale runs are ignored");
});

test("export splits a multi-color box into native single-color text elements", () => {
  let el = box("text hello");
  el = apply(el, applyColorToElement(el, "#e03131", { start: 5, end: 10 }));
  const [plain] = [box("plain")];
  const out = expandRunsForExport([plain, el], measure);
  assert.equal(out[0], plain, "uncolored text untouched");
  assert.equal(out.length, 3);
  assert.deepEqual(out.slice(1).map((e) => [e.text, e.strokeColor, e.x, e.y]), [["text ", "#1e1e1e", 100, 50], ["hello", "#e03131", 150, 50]]);
  assert.ok(out.slice(1).every((e) => e.containerId === null && !e.customData));
});

test("export keeps rotated segments on the original text's pivot", () => {
  let el = box("ab", { angle: Math.PI });
  el = apply(el, applyColorToElement(el, "#f00", { start: 1, end: 2 }));
  const [a, b] = expandRunsForExport([el], measure);
  // 180deg about the box center: first char ends up on the right, second on the left.
  assert.equal(Math.round(a.x), 110);
  assert.equal(Math.round(b.x), 100);
  assert.equal(a.angle, Math.PI);
});

test("withoutRuns strips only runs", () => {
  const el = box("hello", { customData: { runs: [{ text: "hello", color: "#f00" }], markdownHeading: 1 } });
  assert.deepEqual(withoutRuns(el).customData, { markdownHeading: 1 });
});

test("toolbar, canvas and export are wired to the runs model", () => {
  const toolbar = read("src/components/app/ContextualFormattingToolbar.jsx");
  assert.ok(toolbar.includes("applyColorToElement("));
  assert.ok(toolbar.includes("restoreTextSelection("));
  assert.ok(toolbar.includes("onMouseDown={(e) => e.preventDefault()}"));
  assert.ok(toolbar.includes("getTextSelectionColor("));
  const canvas = read("src/components/app/SketchiziCanvas.jsx");
  assert.ok(canvas.includes("RichTextRunsOverlay"));
  assert.ok(canvas.includes("attachTextRunsEditor("));
  const exporter = read("src/components/app/ExportStudioModal.jsx");
  assert.ok(exporter.includes("expandRichTextRuns("));
  assert.ok(read("src/styles/ui-modernization-toolbar-dock.css").includes("#6366F1 halo"));
});
