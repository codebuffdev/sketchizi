import test from "node:test";
import assert from "node:assert/strict";
import { getMarkdownListEdit } from "../src/features/canvas/markdownListShortcuts.js";

const edit = (value, key, cursor = value.length) => getMarkdownListEdit({
  value, selectionStart: cursor, selectionEnd: cursor, key,
});

test("converts typed hyphen or asterisk plus Space to a larger black-circle bullet", () => {
  assert.deepEqual(edit("-", " "), { start: 0, end: 1, text: "● " });
  assert.deepEqual(edit("*", " "), { start: 0, end: 1, text: "● " });
  assert.equal(edit("x-", " "), null);
  assert.equal(edit("ordinary text", " "), null);
});

test("converts a typed numbered marker to a more prominent dot", () => {
  assert.deepEqual(edit("1.", " "), { start: 0, end: 2, text: "1․ " });
  assert.deepEqual(edit("12.", " "), { start: 0, end: 3, text: "12․ " });
});

test("continues numbered lists with the next number", () => {
  assert.deepEqual(edit("1․ First item", "Enter"), { start: 13, end: 13, text: "\n2․ " });
});

test("continues black-circle bullet lists", () => {
  assert.deepEqual(edit("● First item", "Enter"), { start: 12, end: 12, text: "\n● " });
});

test("Enter on an empty list item exits the list", () => {
  assert.deepEqual(edit("● ", "Enter"), { start: 0, end: 2, text: "\n" });
  assert.deepEqual(edit("3․ ", "Enter"), { start: 0, end: 3, text: "\n" });
});

test("Backspace on an empty black-circle bullet restores a literal hyphen", () => {
  assert.deepEqual(edit("● ", "Backspace"), { start: 0, end: 2, text: "-" });
});

test("Backspace on a black-circle bullet with content restores hyphen prefix", () => {
  assert.deepEqual(edit("● First item", "Backspace", 2), { start: 0, end: 2, text: "- " });
});

test("Backspace on an empty numbered marker restores plain number", () => {
  assert.deepEqual(edit("1․ ", "Backspace"), { start: 0, end: 3, text: "1" });
  assert.deepEqual(edit("12․ ", "Backspace"), { start: 0, end: 4, text: "12" });
});

test("Backspace on a numbered marker with content restores plain number and separator", () => {
  assert.deepEqual(edit("1․ First item", "Backspace", 3), { start: 0, end: 3, text: "1 " });
});

test("supports indentation and multiple paragraphs", () => {
  assert.deepEqual(edit("Intro\n  -", " "), { start: 6, end: 9, text: "  ● " });
  assert.deepEqual(edit("Intro\n  ● Item", "Enter"), { start: 14, end: 14, text: "\n  ● " });
});

test("does not interfere with selected text or ordinary paragraphs", () => {
  assert.equal(getMarkdownListEdit({ value: "1. Item", selectionStart: 2, selectionEnd: 4, key: "Enter" }), null);
  assert.equal(edit("plain paragraph", "Enter"), null);
});

import { getMarkdownHeadingInputEdit, MARKDOWN_HEADING_SIZES } from "../src/features/canvas/markdownListShortcuts.js";

test("heading prefix typed before existing text strips only the prefix", () => {
  for (const [hashes, size] of [["#", 32], ["##", 26], ["###", 22]]) {
    const value = `${hashes}hello`;
    const edit = getMarkdownListEdit({ value, selectionStart: hashes.length, selectionEnd: hashes.length, key: " " });
    assert.equal(edit.headingFontSize, size);
    assert.equal(edit.headingLevel, hashes.length);
    assert.equal(value.slice(0, edit.start) + edit.text + value.slice(edit.end), "hello");
    assert.equal(edit.start, 0); // caret ends at index 0
  }
  assert.deepEqual(MARKDOWN_HEADING_SIZES, { 1: 32, 2: 26, 3: 22 });
});

test("heading shortcut applies on the current line only", () => {
  const value = "first\n#second";
  const edit = getMarkdownListEdit({ value, selectionStart: 7, selectionEnd: 7, key: " " });
  assert.equal(edit.start, 6);
  assert.equal(value.slice(0, edit.start) + edit.text + value.slice(edit.end), "first\nsecond");
  assert.equal(getMarkdownListEdit({ value: "####hi", selectionStart: 4, selectionEnd: 4, key: " " }), null);
  assert.equal(getMarkdownListEdit({ value: "a#hi", selectionStart: 2, selectionEnd: 2, key: " " }), null);
});

test("input fallback converts '# hello' with caret after the space", () => {
  const edit = getMarkdownHeadingInputEdit({ value: "# hello", selectionStart: 2, selectionEnd: 2 });
  assert.equal(edit.headingFontSize, 32);
  assert.equal("# hello".slice(0, edit.start) + edit.text + "# hello".slice(edit.end), "hello");
  assert.equal(getMarkdownHeadingInputEdit({ value: "# hello", selectionStart: 7, selectionEnd: 7 }), null);
  assert.equal(getMarkdownHeadingInputEdit({ value: "#hello", selectionStart: 1, selectionEnd: 1 }), null);
});

test("Backspace at offset 0 of a heading reverts to body without deleting", () => {
  const edit = getMarkdownListEdit({ value: "hello", selectionStart: 0, selectionEnd: 0, key: "Backspace", isHeading: true });
  assert.equal(edit.revertHeading, true);
  assert.equal(edit.headingFontSize, 20);
  assert.equal(edit.text, "");
  assert.equal(getMarkdownListEdit({ value: "hello", selectionStart: 0, selectionEnd: 0, key: "Backspace", isHeading: false }), null);
  assert.equal(getMarkdownListEdit({ value: "hello", selectionStart: 2, selectionEnd: 2, key: "Backspace", isHeading: true }), null);
});

// ---- cascade renumbering and list-aware paste ----
import { getListPasteEdit, getListRenumberEdit, renumberOrderedListBlock, stripListPrefix } from "../src/features/canvas/markdownListShortcuts.js";

const run = (value, e) => value.slice(0, e.start) + e.text + value.slice(e.end);

test("stripListPrefix removes number/bullet markers but not decimals", () => {
  assert.equal(stripListPrefix("1. hrllo"), "hrllo");
  assert.equal(stripListPrefix("  2) x"), "  x");
  assert.equal(stripListPrefix("3․ y"), "y");
  assert.equal(stripListPrefix("• z"), "z");
  assert.equal(stripListPrefix("3.14 pi"), "3.14 pi");
});

test("Enter mid-list inserts the next number and cascades the following items", () => {
  const value = "1․ a\n2․ b\n3․ c\n4․ d\n5․ sdsds\n6․ dsdsd";
  const caret = value.indexOf("\n6․");
  const e = edit(value, "Enter", caret);
  const next = run(value, e);
  assert.equal(next, "1․ a\n2․ b\n3․ c\n4․ d\n5․ sdsds\n6․ \n7․ dsdsd");
  assert.equal(e.caret, next.indexOf("\n7․"));
});

test("Enter in the middle of an item text splits it and renumbers below", () => {
  const value = "1․ abcd\n2․ x";
  const e = edit(value, "Enter", 5);
  assert.equal(run(value, e), "1․ ab\n2․ cd\n3․ x");
});

test("renumbering keeps nested lists independent and stays inside the block", () => {
  const value = "1. a\n2. b\n   1. x\n   5. y\n9. c\n\n7. other";
  const r = renumberOrderedListBlock(value, 0);
  assert.equal(r.value, "1. a\n2. b\n   1. x\n   2. y\n3. c\n\n7. other");
});

test("an already sequential block is left alone", () => {
  assert.equal(renumberOrderedListBlock("1. a\n2. b", 2).changed, false);
});

test("paste of a numbered list into an empty numbered line drops the old 1. and continues the numbers", () => {
  const value = "1․ a\n2․ b\n3․ c\n4․ d\n5․ e\n6․ f\n7․ ";
  const text = "1. hrllo\n2. sdsd\n3. dsdsd\n4. sdsds\n5. sdsds\n6. new inserted text\n7. dsdsd";
  const e = getListPasteEdit({ value, selectionStart: value.length, selectionEnd: value.length, text });
  const next = run(value, e);
  assert.equal(next.split("\n").slice(6).join("\n"),
    "7․ hrllo\n8․ sdsd\n9․ dsdsd\n10․ sdsds\n11․ sdsds\n12․ new inserted text\n13․ dsdsd");
  assert.ok(!next.includes(". ."));
  assert.equal(e.caret, next.length);
});

test("pasted block cascades into the list that follows it", () => {
  const value = "1․ a\n2․ \n3․ tail";
  const e = getListPasteEdit({ value, selectionStart: 8, selectionEnd: 8, text: "1. x\n2. y\n" });
  assert.equal(run(value, e), "1․ a\n2․ x\n3․ y\n4․ tail");
});

test("paste honours the caret line indent and replaces a selection", () => {
  const value = "1․ a\n  2․ ";
  const e = getListPasteEdit({ value, selectionStart: value.length, selectionEnd: value.length, text: "1) p\n2) q" });
  assert.equal(run(value, e), "1․ a\n  2․ p\n  3․ q");
});

test("single-line plain paste and paste outside lists stay native", () => {
  assert.equal(getListPasteEdit({ value: "hello", selectionStart: 5, selectionEnd: 5, text: "1. a\n2. b" }), null);
  assert.equal(getListPasteEdit({ value: "1․ a", selectionStart: 4, selectionEnd: 4, text: "plain" }), null);
});

test("single pasted '1. hello' after an empty marker never doubles the prefix", () => {
  const e = getListPasteEdit({ value: "7․ ", selectionStart: 3, selectionEnd: 3, text: "1. hello" });
  assert.equal(run("7․ ", e), "7․ hello");
});

test("deleting a line cascades the numbers below it", () => {
  const value = "1․ a\n3․ c\n4․ d";
  const e = getListRenumberEdit({ value, selectionStart: 4 });
  assert.equal(run(value, e), "1․ a\n2․ c\n3․ d");
  assert.equal(getListRenumberEdit({ value: "1․ a\n2․ b", selectionStart: 3 }), null);
});
