/** Keep a task's visual section and completion checkbox in sync. */
export function getTodoTaskCompletionPatch(completed) {
  const isCompleted = Boolean(completed);
  return { completed: isCompleted, section: isCompleted ? "completed" : "active" };
}
