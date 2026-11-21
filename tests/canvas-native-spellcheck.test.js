import test from "node:test";
import assert from "node:assert/strict";
import { applyCanvasSpellcheck, readSpellcheckPreference } from "../src/features/canvas/nativeSpellcheck.js";

function makeRoot() {
  const attributes = new Map();
  const field = {
    textContent: "k8s vpc postgres",
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const root = { querySelectorAll: (selector) => {
    assert.match(selector, /contenteditable/);
    assert.match(selector, /textarea/);
    return [field];
  } };
  return { attributes, field, root };
}

test("spellcheck is off by default and for new sessions", () => {
  assert.equal(readSpellcheckPreference({ getItem: () => null }), false);
  assert.equal(readSpellcheckPreference(null), false);
});

test("canvas text fields get spellcheck=false unless opted in", () => {
  const { attributes, field, root } = makeRoot();
  assert.equal(applyCanvasSpellcheck(root), 1);
  assert.equal(attributes.get("spellcheck"), "false");
  assert.equal(applyCanvasSpellcheck(root, true), 1);
  assert.equal(attributes.get("spellcheck"), "true");
  assert.equal(applyCanvasSpellcheck(root, false), 1);
  assert.equal(attributes.get("spellcheck"), "false");
  assert.equal(field.textContent, "k8s vpc postgres");
});
