import test from "node:test";
import assert from "node:assert/strict";
import { getTodoTaskCompletionPatch } from "../src/features/todo/todoTaskState.js";

test("moving a task to Completed also checks its completion state", () => {
  assert.deepEqual(getTodoTaskCompletionPatch(true), { completed: true, section: "completed" });
});

test("moving a completed task back to Tasks clears its completion state", () => {
  assert.deepEqual(getTodoTaskCompletionPatch(false), { completed: false, section: "active" });
});

test("legacy completed tasks remain checked and stay in the Completed section", async () => {
  const { isTaskCompleted, summarizeTasks, setTaskChecked } = await import("../src/components/app/todoModel.js");
  // Legacy data: section says completed but the flag was never written, or the reverse.
  const legacySection = { id: "a", section: "completed" };
  const legacyFlag = { id: "b", section: "active", completed: true };
  const open = { id: "c", section: "active", completed: false };
  assert.equal(isTaskCompleted(legacySection), true);
  assert.equal(isTaskCompleted(legacyFlag), true);
  assert.equal(isTaskCompleted(open), false);
  const summary = summarizeTasks([legacySection, legacyFlag, open]);
  assert.deepEqual(summary.active.map((t) => t.id), ["b", "c"]);
  assert.deepEqual(summary.completed.map((t) => t.id), ["a"]);
  assert.equal(summary.checkedCount, 2);
  // Unchecking a legacy-completed task returns it to Tasks and clears the flag.
  assert.deepEqual(setTaskChecked(legacySection, false), { id: "a", section: "active", completed: false });
});
