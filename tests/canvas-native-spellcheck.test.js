import test from "node:test";
import assert from "node:assert/strict";
import { applyCanvasSpellcheck, SPELLCHECK_ENABLED } from "../src/features/canvas/nativeSpellcheck.js";

const makeRoot = () => {
  const attributes = new Map();
  const field = { getAttribute: (name) => attributes.get(name) ?? null, setAttribute: (name, value) => attributes.set(name, value) };
  return { attributes, root: { querySelectorAll: () => [field] } };
};

test("spellcheck is mandatory and always true on canvas text fields", () => {
  assert.equal(SPELLCHECK_ENABLED, true);
  const { root, attributes } = makeRoot();
  assert.equal(applyCanvasSpellcheck(root), 1);
  assert.equal(attributes.get("spellcheck"), "true");
  // A second pass (MutationObserver) must keep it on.
  assert.equal(applyCanvasSpellcheck(root), 1);
  assert.equal(attributes.get("spellcheck"), "true");
});
