import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyColor, createRichText, plainText, toHtml } from "../src/features/canvas/richTextModel.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("whole box selected: color changes the entire box and clears inline overrides", () => {
  let doc = applyColor(createRichText("hello world"), "#ff0000", { start: 0, end: 5 });
  assert.equal(doc.color ?? null, null);
  doc = applyColor(doc, "#3d79b9"); // no highlight
  assert.equal(doc.color, "#3d79b9");
  assert.deepEqual(doc.runs, [{ text: "hello world", color: null }]);
  assert.equal(toHtml(doc), "hello world");
});

test("collapsed range behaves like whole-box mode", () => {
  const doc = applyColor(createRichText("abc"), "#d25555", { start: 2, end: 2 });
  assert.equal(doc.color, "#d25555");
  assert.ok(!toHtml(doc).includes("<span"));
});

test("highlighted portion gets an inline span; the rest is unchanged", () => {
  const base = { ...createRichText("hello world"), color: "#2f2f33" };
  const doc = applyColor(base, "#ff0000", { start: 6, end: 11 });
  assert.equal(doc.color, "#2f2f33");
  assert.deepEqual(doc.runs, [{ text: "hello ", color: null }, { text: "world", color: "#ff0000" }]);
  assert.equal(toHtml(doc), 'hello <span style="color: #ff0000">world</span>');
  assert.equal(plainText(doc), "hello world");
});

test("reversed and overlapping highlights split and merge runs correctly", () => {
  let doc = applyColor(createRichText("abcdef"), "#ff0000", { start: 4, end: 1 });
  assert.deepEqual(doc.runs.map((r) => [r.text, r.color]), [["a", null], ["bcd", "#ff0000"], ["ef", null]]);
  doc = applyColor(doc, "#00ff00", { start: 2, end: 5 });
  assert.deepEqual(doc.runs.map((r) => [r.text, r.color]), [["a", null], ["b", "#ff0000"], ["cde", "#00ff00"], ["f", null]]);
  doc = applyColor(doc, "#00ff00", { start: 0, end: 6 });
  assert.deepEqual(doc.runs, [{ text: "abcdef", color: "#00ff00" }]);
});

test("html output escapes text, keeps line breaks and rejects unsafe colors", () => {
  const doc = applyColor(createRichText("<b>&\nx"), "red; background:url(x)", { start: 0, end: 3 });
  assert.ok(!toHtml(doc).includes("<span"), "unsafe color is not emitted");
  const ok = applyColor(createRichText("<b>&\nx"), "#abc", { start: 0, end: 3 });
  assert.equal(toHtml(ok), '<span style="color: #abc">&lt;b&gt;</span>&amp;<br>x');
});

test("color swatches and toolbar buttons keep the text selection", () => {
  const toolbar = read("src/components/app/ContextualFormattingToolbar.jsx");
  assert.ok(toolbar.includes("onMouseDown={(e) => e.preventDefault()}"));
  assert.ok(toolbar.includes("onMouseDown={keepTextSelection}"));
  assert.ok(toolbar.includes("applyRichTextColor(rawPatch.strokeColor)"));
});

test("rich text box picks inline vs whole-box mode from the live selection", () => {
  const box = read("src/features/canvas/RichTextBox.jsx");
  assert.ok(box.includes("selection.isCollapsed"));
  assert.ok(box.includes("applyColor("));
});
