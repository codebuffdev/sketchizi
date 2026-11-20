import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_TASK_TEXT_LENGTH, addTaskToList, applyTaskEdit, clearCompletedTasks, createTask, getEmptyTaskState,
  isTaskCompleted, moveTask, normalizeTaskText, removeTaskById, setTaskChecked, summarizeTasks,
} from "../src/components/app/todoModel.js";
import { prepareTabsForPersistence } from "../src/features/workspace/tabSnapshot.js";

const component = readFileSync(new URL("../src/components/app/TodoList.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/todo-canvas-polish.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("create: adds a trimmed pending task; blank input adds nothing", () => {
  const list = addTaskToList([], "  Write   the   spec  ", 1000, () => 0.5);
  assert.equal(list.length, 1);
  assert.equal(list[0].text, "Write the spec");
  assert.equal(list[0].completed, false);
  assert.equal(list[0].section, "active");
  const unchanged = addTaskToList(list, "   ");
  assert.equal(unchanged, list);
});

test("create: ids stay unique for tasks added in the same millisecond", () => {
  let n = 0;
  const random = () => ++n / 10;
  const a = createTask("a", 5, random);
  const b = createTask("b", 5, random);
  assert.notEqual(a.id, b.id);
});

test("edit: new text is saved, clearing the text keeps the old one", () => {
  const task = { id: "t", text: "Old", completed: false, section: "active" };
  assert.equal(applyTaskEdit(task, "  New name ").text, "New name");
  assert.equal(applyTaskEdit(task, "   ").text, "Old");
  assert.equal(applyTaskEdit(task, "").text, "Old");
});

test("edit: other task fields survive an edit (legacy data is not dropped)", () => {
  const legacy = { id: "t", text: "Old", section: "todo", note: "keep me" };
  const edited = applyTaskEdit(legacy, "New");
  assert.deepEqual(edited, { id: "t", text: "New", section: "todo", note: "keep me" });
});

test("complete: checking, moving and unchecking follow the shared model", () => {
  const task = { id: "t", text: "x", completed: false, section: "active" };
  const checked = setTaskChecked(task, true);
  assert.equal(isTaskCompleted(checked), true);
  const moved = moveTask(checked, "completed");
  assert.deepEqual([moved.section, moved.completed], ["completed", true]);
  const back = setTaskChecked(moved, false);
  assert.deepEqual([back.section, back.completed], ["active", false]);
});

test("delete removes only the chosen task; clear completed keeps pending ones", () => {
  const tasks = [
    { id: "a", text: "a", completed: false, section: "active" },
    { id: "b", text: "b", completed: true, section: "completed" },
    { id: "c", text: "c", completed: true, section: "active" },
  ];
  assert.deepEqual(removeTaskById(tasks, "a").map((t) => t.id), ["b", "c"]);
  assert.deepEqual(clearCompletedTasks(tasks).map((t) => t.id), ["a", "c"]);
  assert.deepEqual(removeTaskById(undefined, "a"), []);
});

test("long task names are stored in full up to the input limit, and never cut when read", () => {
  const long = "word ".repeat(80).trim();
  assert.equal(normalizeTaskText(long), long);
  assert.equal(normalizeTaskText("x".repeat(MAX_TASK_TEXT_LENGTH + 50)).length, MAX_TASK_TEXT_LENGTH);
  const legacyLong = { id: "l", text: "y".repeat(900), section: "active" };
  assert.equal(summarizeTasks([legacyLong]).active[0].text.length, 900, "stored legacy text is not truncated");
});

test("empty state distinguishes 'no tasks yet' from 'all done'", () => {
  assert.equal(getEmptyTaskState([]), "none");
  assert.equal(getEmptyTaskState(undefined), "none");
  assert.equal(getEmptyTaskState([{ id: "a", text: "a", section: "completed", completed: true }]), "all-done");
  assert.equal(getEmptyTaskState([{ id: "a", text: "a", section: "active", completed: false }]), null);
});

test("persistence: a full add/edit/complete/delete cycle survives save and reload", () => {
  let items = addTaskToList([], "Plan launch", 1, () => 0.1);
  items = addTaskToList(items, "Write docs", 2, () => 0.2);
  items = items.map((t, i) => (i === 0 ? applyTaskEdit(t, "Plan the launch") : t));
  items = items.map((t, i) => (i === 1 ? moveTask(t, "completed") : t));
  items = addTaskToList(items, "Temp", 3, () => 0.3);
  items = removeTaskById(items, items[2].id);
  const tabs = [{ id: "canvas-1", name: "Canvas 1", todoItems: items, snapshot: { elements: [], appState: {} } }];
  const reloaded = JSON.parse(JSON.stringify(prepareTabsForPersistence(tabs)));
  assert.deepEqual(reloaded[0].todoItems, items);
  const summary = summarizeTasks(reloaded[0].todoItems);
  assert.deepEqual(summary.active.map((t) => t.text), ["Plan the launch"]);
  assert.deepEqual(summary.completed.map((t) => t.text), ["Write docs"]);
});

test("legacy data: section=todo and mixed completion flags still load", () => {
  const legacy = [
    { id: "1", text: "old", completed: false, section: "todo" },
    { id: "2", text: "flagged", completed: true, section: "active" },
    { id: "3", text: "moved", section: "completed" },
  ];
  const s = summarizeTasks(legacy);
  assert.equal(s.tasks.length, 3);
  assert.equal(s.checkedCount, 2);
  assert.equal(s.leftCount, 1);
});

test("component wiring: real handlers, not static markup", () => {
  assert.match(component, /addTaskToList\(tasks, draft\)/);
  assert.match(component, /applyTaskEdit\(task, editingText\)/);
  assert.match(component, /removeTaskById\(tasks, id\)/);
  assert.match(component, /clearCompletedTasks\(tasks\)/);
  assert.match(component, /moveTask\(task, section\)/);
  assert.match(component, /setTaskChecked\(current, event\.target\.checked\)/);
  assert.match(component, /checked=\{isTaskCompleted\(task\)\}/);
  assert.match(component, /onSubmit=\{addTask\}/);
  assert.match(component, /event\.key === "Enter"\) commitEdit/);
  assert.match(component, /event\.key === "Escape"\) \{ cancelEditRef\.current = true/);
  assert.match(component, /aria-label=\{`Delete \$\{task\.text\}`\}/);
  assert.match(component, /aria-label=\{`Rename \$\{task\.text\}`\}/);
  assert.match(component, /getEmptyTaskState\(items\)/);
});

test("canvas-linked tasks can still be renamed through the explicit edit action", () => {
  assert.match(component, /is-canvas-link/);
  assert.match(component, /sketchizi-todo-action is-edit/);
});

test("styles: long text wraps, completed rows are visually distinct, touch keeps actions visible", () => {
  assert.match(css, /\.sketchizi-todo-task-text\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.is-completed \.sketchizi-todo-task-text\s*\{[^}]*line-through/s);
  assert.match(css, /@media \(hover: none\), \(max-width: 760px\)\s*\{[^}]*row-actions\s*\{\s*opacity:\s*1/s);
  assert.match(css, /\.sketchizi-todo-popover\.is-dark\s*\{/);
  assert.match(css, /@media \(max-width: 520px\)/);
});

test("the polish stylesheet is imported by the app", () => {
  assert.match(app, /import "\.\/styles\/todo-canvas-polish\.css"/);
});
