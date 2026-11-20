import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTaskCompleted, moveTask, setTaskChecked, summarizeTasks } from "../src/components/app/todoModel.js";

const component = readFileSync(new URL("../src/components/app/TodoList.jsx", import.meta.url), "utf8");
const task = (id, extra = {}) => ({ id, text: id, completed: false, section: "active", ...extra });

test("issue 6: moving a task to Completed marks it completed, moving it back clears it", () => {
  const done = moveTask(task("a"), "completed");
  assert.deepEqual([done.section, done.completed], ["completed", true]);
  const back = moveTask(done, "active");
  assert.deepEqual([back.section, back.completed], ["active", false]);
});

test("issue 6: tasks already stored as section=completed, completed=false count as completed", () => {
  const legacy = task("legacy", { section: "completed", completed: false });
  assert.equal(isTaskCompleted(legacy), true);
  const summary = summarizeTasks([legacy, task("open")]);
  assert.equal(summary.checkedCount, 1);
  assert.equal(summary.progress, 50);
  assert.equal(summary.leftCount, 1);
});

test("issue 6: checking keeps a task in place; unchecking a Completed task returns it to Tasks", () => {
  const checked = setTaskChecked(task("a"), true);
  assert.deepEqual([checked.section, checked.completed], ["active", true]);
  const unchecked = setTaskChecked(task("b", { section: "completed", completed: true }), false);
  assert.deepEqual([unchecked.section, unchecked.completed], ["active", false]);
});

test("issue 6: summary handles empty / invalid input and the 'left' count ignores checked tasks", () => {
  assert.deepEqual(summarizeTasks(undefined).tasks, []);
  assert.equal(summarizeTasks(null).progress, 0);
  const s = summarizeTasks([task("a", { completed: true }), task("b"), task("c", { section: "completed", completed: true })]);
  assert.equal(s.active.length, 2);
  assert.equal(s.leftCount, 1);
  assert.equal(s.progress, 67);
});

test("issue 6: the component uses the model for move, checkbox and progress", () => {
  assert.match(component, /moveTask\(task, section\)/);
  assert.match(component, /setTaskChecked\(current, event\.target\.checked\)/);
  assert.match(component, /checked=\{isTaskCompleted\(task\)\}/);
  assert.doesNotMatch(component, /const move = \(id, section\) => patch\(id, \{ section \}\);/);
});
