import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TAB_LABEL_CHARACTERS, findDuplicateTabName, getTabDisplayName } from "../src/features/workspace/tabLabel.js";

test("canvas tab labels display at least 70 characters without changing the stored name", () => {
  const name = "03-Requirements Clarification Explained: Functional & Non-Functional";
  assert.equal(MAX_TAB_LABEL_CHARACTERS, 70);
  assert.equal(name.length, 68);
  assert.equal(getTabDisplayName(name), name);
  assert.equal(getTabDisplayName("x".repeat(70)).length, 70);
});

test("longer tab labels truncate only for display and preserve complete source names", () => {
  const name = "A".repeat(90);
  assert.equal(getTabDisplayName(name).length, 70);
  assert.equal(name.length, 90);
  assert.equal(getTabDisplayName(name, 120), name);
});

test("open canvas tab names cannot be duplicated, ignoring case and whitespace", () => {
  const tabs = [
    { id: "one", name: "System Design" },
    { id: "two", name: "API Gateway" },
    { id: "todo", name: "Todo", isTodoTab: true },
  ];
  assert.equal(findDuplicateTabName(tabs, " system   design ")?.id, "one");
  assert.equal(findDuplicateTabName(tabs, "SYSTEM DESIGN", "one"), null);
  assert.equal(findDuplicateTabName(tabs, "todo"), null);
  assert.equal(findDuplicateTabName(tabs, "New Canvas"), null);
});
