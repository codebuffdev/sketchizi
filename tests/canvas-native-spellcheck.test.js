import test from "node:test";
import assert from "node:assert/strict";
import { enableCanvasSpellcheck } from "../src/features/canvas/nativeSpellcheck.js";

test("canvas text fields opt into native spellcheck without changing their text", () => {
  const attributes = new Map();
  const field = {
    textContent: "Ths is a test",
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const root = { querySelectorAll: (selector) => {
    assert.match(selector, /contenteditable/);
    assert.match(selector, /textarea/);
    return [field];
  } };
  assert.equal(enableCanvasSpellcheck(root), 1);
  assert.equal(attributes.get("spellcheck"), "true");
  assert.equal(field.textContent, "Ths is a test");
});
