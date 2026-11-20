import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TAB_LABEL_CHARACTERS, getTabDisplayName } from "../src/features/workspace/tabLabel.js";

test("canvas tab labels display at least 70 characters without changing the stored name", () => {
  const name = "03-Requirements Clarification Explained: Functional & Non-Functional";
  assert.equal(MAX_TAB_LABEL_CHARACTERS, 70);
  assert.equal(name.length, 70);
  assert.equal(getTabDisplayName(name), name);
});

test("longer tab labels truncate only for display and preserve complete source names", () => {
  const name = "A".repeat(90);
  assert.equal(getTabDisplayName(name).length, 70);
  assert.equal(name.length, 90);
  assert.equal(getTabDisplayName(name, 120), name);
});
