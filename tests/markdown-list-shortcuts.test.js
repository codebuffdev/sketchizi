import test from "node:test";
import assert from "node:assert/strict";
import { getMarkdownListEdit } from "../src/features/canvas/markdownListShortcuts.js";

const edit = (value, key, cursor = value.length) => getMarkdownListEdit({
  value,
  selectionStart: cursor,
  selectionEnd: cursor,
  key,
});

test("keeps a typed hyphen visible as the bullet marker", () => {
  assert.equal(edit("-", " "), null);
  assert.deepEqual(edit("*", " "), { start: 0, end: 1, text: "- " });
  assert.equal(edit("x-", " "), null);
  assert.equal(edit("ordinary text", " "), null);
});

test("keeps numbered prefixes visible and recognizes them as ordered lists", () => {
  assert.equal(edit("1.", " "), null);
  assert.equal(edit("12.", " "), null);
  assert.equal(edit("1. trailing", " "), null);
});

test("continues numbered lists with the next number", () => {
  assert.deepEqual(edit("1. First item", "Enter"), {
    start: 13, end: 13, text: "\n2. ",
  });
});

test("continues hyphen bullet lists", () => {
  assert.deepEqual(edit("- First item", "Enter"), {
    start: 12, end: 12, text: "\n- ",
  });
});

test("pressing Enter on an empty list item exits the list", () => {
  assert.deepEqual(edit("- ", "Enter"), { start: 0, end: 2, text: "\n" });
  assert.deepEqual(edit("3. ", "Enter"), { start: 0, end: 3, text: "\n" });
});

test("Backspace at the numbered marker boundary switches to a hyphen bullet", () => {
  assert.deepEqual(edit("1. ", "Backspace"), { start: 0, end: 3, text: "- " });
  assert.deepEqual(edit("1. First item", "Backspace", 3), {
    start: 0, end: 3, text: "- ",
  });
  assert.deepEqual(edit("2. Second item", "Backspace", 3), {
    start: 0, end: 3, text: "- ",
  });
});

test("Backspace on an empty bullet item removes its marker", () => {
  assert.deepEqual(edit("- ", "Backspace"), { start: 0, end: 2, text: "" });
  assert.deepEqual(edit("  - ", "Backspace"), { start: 0, end: 4, text: "  " });
});

test("supports list items after existing paragraphs and preserves indentation", () => {
  assert.deepEqual(edit("Intro\n  *", " "), {
    start: 6, end: 9, text: "  - ",
  });
  assert.deepEqual(edit("Intro\n  - Item", "Enter"), {
    start: 14, end: 14, text: "\n  - ",
  });
});

test("does not interfere with selected text or Enter outside a list", () => {
  assert.equal(getMarkdownListEdit({
    value: "1. Item", selectionStart: 2, selectionEnd: 4, key: "Enter",
  }), null);
  assert.equal(edit("plain paragraph", "Enter"), null);
});
