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
