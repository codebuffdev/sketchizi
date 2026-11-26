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
