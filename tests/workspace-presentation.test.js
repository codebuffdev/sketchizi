import test from "node:test";
import assert from "node:assert/strict";
import { formatWorkspaceDate, getWorkspaceActivityTime, mergeWorkspaceActivity, recordWorkspaceItemOpened, sortWorkspaceRecentlyUsed } from "../src/features/workspace/workspacePresentation.js";

test("workspace activity prefers last-opened and last-used timestamps over saved dates", () => {
  const item = { lastOpenedAt: "2026-11-20T10:30:00Z", updatedAt: "2026-11-19T10:30:00Z" };
  assert.equal(getWorkspaceActivityTime(item), Date.parse(item.lastOpenedAt));
});

test("workspace diagrams sort most recently used first without mutating the source array", () => {
  const items = [
    { id: "older", updatedAt: "2026-11-18T10:00:00Z" },
    { id: "newer", lastOpenedAt: "2026-11-20T10:00:00Z" },
    { id: "middle", lastUsedAt: "2026-11-19T10:00:00Z" },
  ];
  const sorted = sortWorkspaceRecentlyUsed(items);
  assert.deepEqual(sorted.map((item) => item.id), ["newer", "middle", "older"]);
  assert.equal(items[0].id, "older");
});

test("workspace date metadata includes a local 12-hour time with AM/PM", () => {
  const label = formatWorkspaceDate("2026-11-20T15:45:00+05:30");
  assert.match(label, /2026/);
  assert.match(label, /AM|PM/);
});


test("workspace last-opened activity persists locally and wins over older API timestamps", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(recordWorkspaceItemOpened("diagram-1", "2026-11-20T15:45:00.000Z", storage), true);
  const merged = mergeWorkspaceActivity([
    { id: "diagram-1", updatedAt: "2026-11-19T10:00:00Z" },
    { id: "diagram-2", lastOpenedAt: "2026-11-20T15:00:00Z" },
  ], storage);
  const sorted = sortWorkspaceRecentlyUsed(merged);
  assert.equal(sorted[0].id, "diagram-1");
  assert.equal(sorted[0].lastOpenedAt, "2026-11-20T15:45:00.000Z");
});
