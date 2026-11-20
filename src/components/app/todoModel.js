/**
 * Task state has two fields: `section` ("active" | "completed") says which list
 * a task is shown in, `completed` is the checkbox. They must never disagree for
 * a task in the Completed list. "Move to completed" used to change only
 * `section`, so such tasks rendered unchecked and were left out of progress.
 * Items already stored in that state are treated as completed when read.
 */
export const isTaskCompleted = (task) => Boolean(task?.completed) || task?.section === "completed";

export function moveTask(task, section) {
  return section === "completed"
    ? { ...task, section: "completed", completed: true }
    : { ...task, section: "active", completed: false };
}

/** Checking keeps the task where it is; unchecking a Completed task returns it to Tasks. */
export function setTaskChecked(task, checked) {
  return checked
    ? { ...task, completed: true }
    : { ...task, completed: false, section: "active" };
}

export function summarizeTasks(items) {
  const tasks = Array.isArray(items) ? items : [];
  const active = tasks.filter((task) => task.section !== "completed");
  const completed = tasks.filter((task) => task.section === "completed");
  const checkedCount = tasks.filter(isTaskCompleted).length;
  return {
    tasks,
    active,
    completed,
    checkedCount,
    leftCount: active.filter((task) => !isTaskCompleted(task)).length,
    progress: tasks.length ? Math.round((checkedCount / tasks.length) * 100) : 0,
  };
}

/** Longest text accepted from the add/edit inputs. Stored legacy text is never cut. */
export const MAX_TASK_TEXT_LENGTH = 500;

/** Collapse stray whitespace so " a   b " is stored as "a b". Returns "" for blanks. */
export function normalizeTaskText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TASK_TEXT_LENGTH);
}

export function createTask(text, now = Date.now(), random = Math.random) {
  return { id: `task-${now}-${random().toString(36).slice(2, 7)}`, text: normalizeTaskText(text), completed: false, section: "active" };
}

/** Append a task. Blank input leaves the list untouched (same array returned). */
export function addTaskToList(items, text, now, random) {
  const tasks = Array.isArray(items) ? items : [];
  if (!normalizeTaskText(text)) return tasks;
  return [...tasks, createTask(text, now, random)];
}

/** Apply an edit. Clearing the text keeps the previous text instead of leaving an empty task. */
export function applyTaskEdit(task, text) {
  const next = normalizeTaskText(text);
  return next ? { ...task, text: next } : task;
}

export function removeTaskById(items, id) {
  return (Array.isArray(items) ? items : []).filter((task) => task.id !== id);
}

export function clearCompletedTasks(items) {
  return (Array.isArray(items) ? items : []).filter((task) => task.section !== "completed");
}

/**
 * What the Tasks list should say when it has nothing to show:
 * "none" - the user has never added a task, "all-done" - every task is finished.
 */
export function getEmptyTaskState(items) {
  const { tasks, active } = summarizeTasks(items);
  if (active.length > 0) return null;
  return tasks.length === 0 ? "none" : "all-done";
}
