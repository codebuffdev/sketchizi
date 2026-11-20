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
