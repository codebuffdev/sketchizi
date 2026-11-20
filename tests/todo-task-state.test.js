import test from "node:test";
import assert from "node:assert/strict";
import { getTodoTaskCompletionPatch } from "../src/features/todo/todoTaskState.js";

test("moving a task to Completed also checks its completion state", () => {
  assert.deepEqual(getTodoTaskCompletionPatch(true), { completed: true, section: "completed" });
});

test("moving a completed task back to Tasks clears its completion state", () => {
  assert.deepEqual(getTodoTaskCompletionPatch(false), { completed: false, section: "active" });
});
