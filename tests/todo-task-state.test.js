import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTodoTaskCompletionPatch } from "../src/features/todo/todoTaskState.js";

test("moving a task to Completed also checks its completion state", () => {
  assert.deepEqual(getTodoTaskCompletionPatch(true), { completed: true, section: "completed" });
});

test("moving a completed task back to Tasks clears its completion state", () => {
  assert.deepEqual(getTodoTaskCompletionPatch(false), { completed: false, section: "active" });
});

test("legacy completed tasks remain checked and stay in the Completed section", () => {
  const source = readFileSync(new URL("../src/components/app/TodoList.jsx", import.meta.url), "utf8");
  assert.match(source, /task\.section !== "completed" && !task\.completed/);
  assert.match(source, /task\.section === "completed" \|\| task\.completed/);
  assert.match(source, /checked=\{task\.section === "completed" \|\| !!task\.completed\}/);
});
