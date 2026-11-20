import React, { useMemo, useState } from "react";

function createTask(text) {
  return { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), completed: false, section: "active" };
}

export default function TodoList({ items = [], onChange, onClose, isDarkTheme = false }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [completedOpen, setCompletedOpen] = useState(true);
  const [draggedId, setDraggedId] = useState(null);
  const tasks = Array.isArray(items) ? items : [];
  const active = useMemo(() => tasks.filter((task) => task.section !== "completed"), [tasks]);
  const completed = useMemo(() => tasks.filter((task) => task.section === "completed"), [tasks]);
  const update = (next) => onChange?.(next);
  const addTask = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    update([...tasks, createTask(draft)]);
    setDraft("");
  };
  const patch = (id, changes) => update(tasks.map((task) => task.id === id ? { ...task, ...changes } : task));
  const remove = (id) => update(tasks.filter((task) => task.id !== id));
  const move = (id, section) => patch(id, { section });
  const reorder = (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const from = tasks.findIndex((task) => task.id === draggedId);
    const to = tasks.findIndex((task) => task.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...tasks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
    setDraggedId(null);
  };
  const renderTask = (task) => (
    <div className={`sketchizi-todo-task${task.completed ? " is-completed" : ""}`} key={task.id}
      draggable onDragStart={() => setDraggedId(task.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(task.id)} onDragEnd={() => setDraggedId(null)}>
      <span className="sketchizi-todo-grip" aria-hidden="true">⠿</span>
      <input type="checkbox" checked={!!task.completed} onChange={(event) => patch(task.id, { completed: event.target.checked })} aria-label={`Mark ${task.text} ${task.completed ? "incomplete" : "complete"}`} />
      {editingId === task.id ? (
        <input className="sketchizi-todo-edit" autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { patch(task.id, { text: editingText.trim() || task.text }); setEditingId(null); } if (event.key === "Escape") setEditingId(null); }}
          onBlur={() => { patch(task.id, { text: editingText.trim() || task.text }); setEditingId(null); }} />
      ) : (
        <button type="button" className="sketchizi-todo-task-text" onClick={() => { setEditingId(task.id); setEditingText(task.text); }}>{task.text}</button>
      )}
      {task.section === "completed" ? (
        <button type="button" className="sketchizi-todo-action" title="Move back to tasks" aria-label="Move back to tasks" onClick={() => move(task.id, "active")}>↶</button>
      ) : (
        <button type="button" className="sketchizi-todo-action" title="Move to completed" aria-label="Move to completed" onClick={() => move(task.id, "completed")}>✓</button>
      )}
      <button type="button" className="sketchizi-todo-action is-delete" title="Delete task" aria-label={`Delete ${task.text}`} onClick={() => remove(task.id)}>×</button>
    </div>
  );
  return (
    <section className={`sketchizi-todo-popover${isDarkTheme ? " is-dark" : ""}`} role="dialog" aria-label="Todo List">
      <header className="sketchizi-todo-header">
        <div className="sketchizi-todo-title"><span className="sketchizi-todo-title-icon">✓</span><strong>Todo List</strong></div>
        <button type="button" className="sketchizi-todo-close" aria-label="Close Todo List" onClick={onClose}>×</button>
      </header>
      <form className="sketchizi-todo-add" onSubmit={addTask}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a new task…" aria-label="New task" />
        <button type="submit" disabled={!draft.trim()} aria-label="Add task">+</button>
      </form>
      <div className="sketchizi-todo-list">
        {active.length ? active.map(renderTask) : <p className="sketchizi-todo-empty">No tasks yet. Add one above.</p>}
      </div>
      <footer className="sketchizi-todo-footer">
        <button type="button" className="sketchizi-todo-completed-toggle" aria-expanded={completedOpen} onClick={() => setCompletedOpen((open) => !open)}>
          <span>{completedOpen ? "⌄" : "›"}</span><strong>Completed ({completed.length})</strong>
        </button>
        {completed.length > 0 && <button type="button" className="sketchizi-todo-clear" onClick={() => update(tasks.filter((task) => task.section !== "completed"))}>Clear all</button>}
      </footer>
      {completedOpen && completed.length > 0 && <div className="sketchizi-todo-list is-completed-list">{completed.map(renderTask)}</div>}
    </section>
  );
}
