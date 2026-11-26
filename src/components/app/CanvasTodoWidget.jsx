import { useMemo, useState } from "react";

const starterTasks = [
  { id: "task-1", text: "Add your first task", done: false },
];

export default function CanvasTodoWidget({ isDarkTheme = false, onClose }) {
  const [title, setTitle] = useState("Untitled checklist");
  const [tasks, setTasks] = useState(starterTasks);
  const [draft, setDraft] = useState("");
  const completed = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);
  const progress = tasks.length ? (completed / tasks.length) * 100 : 0;
  const addTask = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTasks((items) => [...items, { id: `task-${Date.now()}-${items.length}`, text, done: false }]);
    setDraft("");
  };
  return (
    <section className={`sketchizi-canvas-todo-widget${isDarkTheme ? " is-dark" : ""}`} aria-label="Canvas todo list">
      <header className="sketchizi-canvas-todo-header">
        <span className="sketchizi-canvas-todo-mark" aria-hidden="true">✓</span>
        <input className="sketchizi-canvas-todo-title" aria-label="Todo list title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <span className="sketchizi-canvas-todo-count" aria-live="polite">{completed}/{tasks.length}</span>
        <button type="button" className="sketchizi-canvas-todo-close" aria-label="Remove todo list" onClick={onClose}>×</button>
      </header>
      <div className="sketchizi-canvas-todo-progress" role="progressbar" aria-label="Task completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <ul className="sketchizi-canvas-todo-items">
        {tasks.map((task) => (
          <li key={task.id} className={task.done ? "is-complete" : ""}>
            <label><input type="checkbox" checked={task.done} onChange={(event) => setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done: event.target.checked } : item))} /><span>{task.text}</span></label>
            <button type="button" aria-label={`Delete ${task.text}`} onClick={() => setTasks((items) => items.filter((item) => item.id !== task.id))}>×</button>
          </li>
        ))}
      </ul>
      <form className="sketchizi-canvas-todo-add" onSubmit={addTask}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task…" aria-label="New task" />
        <button type="submit" disabled={!draft.trim()}>+ Add</button>
      </form>
    </section>
  );
}
