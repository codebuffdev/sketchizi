import React, { useMemo, useState } from "react";

function normalizeCanvasTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function createTask(text) {
  return { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), completed: false, section: "active" };
}

export default function TodoList({ items = [], onChange, onClose, isDarkTheme = false, fullPage = false, canvasTabs = [], onNavigateToCanvas }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [completedOpen, setCompletedOpen] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const tasks = Array.isArray(items) ? items : [];
  const active = useMemo(() => tasks.filter((task) => task.section !== "completed"), [tasks]);
  const completed = useMemo(() => tasks.filter((task) => task.section === "completed"), [tasks]);
  const checkedCount = active.filter((task) => task.completed).length + completed.filter((task) => task.completed).length;
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
  const renderTask = (task) => {
    const matchingCanvases = canvasTabs.filter((tab) => normalizeCanvasTitle(tab.name) === normalizeCanvasTitle(task.text));
    const matchingCanvas = matchingCanvases.length === 1 ? matchingCanvases[0] : null;
    return (
    <div className={`sketchizi-todo-task${task.completed ? " is-completed" : ""}${draggedId === task.id ? " is-dragging" : ""}`} key={task.id}
      draggable onDragStart={() => setDraggedId(task.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(task.id)} onDragEnd={() => setDraggedId(null)}>
      <span className="sketchizi-todo-grip" aria-hidden="true">⠿</span>
      <input type="checkbox" checked={!!task.completed} onChange={(event) => patch(task.id, { completed: event.target.checked })} aria-label={`Mark ${task.text} ${task.completed ? "incomplete" : "complete"}`} />
      {editingId === task.id ? (
        <input className="sketchizi-todo-edit" autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { patch(task.id, { text: editingText.trim() || task.text }); setEditingId(null); } if (event.key === "Escape") setEditingId(null); }}
          onBlur={() => { patch(task.id, { text: editingText.trim() || task.text }); setEditingId(null); }} />
      ) : (
        <button type="button" className={`sketchizi-todo-task-text${matchingCanvas ? " is-canvas-link" : ""}`} title={matchingCanvas ? `Open ${matchingCanvas.name} canvas` : "Edit task"} onClick={() => { if (matchingCanvas) onNavigateToCanvas?.(matchingCanvas.id); else { setEditingId(task.id); setEditingText(task.text); } }} aria-label={matchingCanvas ? `Open canvas ${matchingCanvas.name}` : `Edit task ${task.text}`}>
          {task.text}{matchingCanvas && <span className="sketchizi-todo-canvas-link-icon" aria-hidden="true">↗</span>}
        </button>
      )}
      <span className="sketchizi-todo-row-actions">
        {task.section === "completed" ? (
          <button type="button" className="sketchizi-todo-action" title="Move back to tasks" aria-label="Move back to tasks" onClick={() => move(task.id, "active")}>↶</button>
        ) : (
          <button type="button" className="sketchizi-todo-action is-done" title="Move to completed" aria-label="Move to completed" onClick={() => move(task.id, "completed")}>✓</button>
        )}
        <button type="button" className="sketchizi-todo-action is-delete" title="Delete task" aria-label={`Delete ${task.text}`} onClick={() => remove(task.id)}>×</button>
      </span>
    </div>
    );
  };
  const progress = tasks.length ? Math.round((checkedCount / tasks.length) * 100) : 0;
  return (
    <section className={`sketchizi-todo-popover${isDarkTheme ? " is-dark" : ""}${fullPage ? " is-full-page" : ""}`} role={fullPage ? "region" : "dialog"} aria-label="Todo List">
      <header className="sketchizi-todo-header">
        <div className="sketchizi-todo-title">
          <span className="sketchizi-todo-title-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h12M8 12h12M8 18h12"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></svg>
          </span>
          <span><strong>Todo List</strong><small>{active.length} {active.length === 1 ? "task" : "tasks"} left</small></span>
        </div>
        {!fullPage && <button type="button" className="sketchizi-todo-close" aria-label="Close Todo List" onClick={onClose}>×</button>}
      </header>
      <div className="sketchizi-todo-progress" aria-label={`${progress}% complete`}>
        <div className="sketchizi-todo-progress-meta"><span>Progress</span><strong>{checkedCount}/{tasks.length} completed</strong></div>
        <div className="sketchizi-todo-progress-track"><span style={{ width: `${progress}%` }} /></div>
      </div>
      <form className="sketchizi-todo-add" onSubmit={addTask}>
        <span aria-hidden="true">＋</span>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task…" aria-label="New task" />
        <button type="submit" disabled={!draft.trim()}>Add task</button>
      </form>
      <div className="sketchizi-todo-section-heading"><strong>Tasks</strong><span>{active.length}</span></div>
      <div className="sketchizi-todo-list">
        {active.length ? active.map(renderTask) : <p className="sketchizi-todo-empty">You're all caught up. Add a task to get started.</p>}
      </div>
      <div className={`sketchizi-todo-completed-section${completedOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="sketchizi-todo-completed-toggle"
          aria-expanded={completedOpen}
          aria-controls="sketchizi-completed-tasks"
          onClick={() => setCompletedOpen((open) => !open)}
        >
          <span className="sketchizi-todo-completed-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 12 3 3 6-6" /><path d="m9 12 3 3 9-9" /><path d="M3 5h4M3 19h4" />
            </svg>
          </span>
          <strong>Completed</strong>
          <em>{completed.length}</em>
          <span className="sketchizi-todo-completed-hint">{completedOpen ? "Hide completed" : "Show completed"}</span>
          <span className="sketchizi-todo-completed-chevron" aria-hidden="true">›</span>
        </button>
        {completedOpen && completed.length > 0 && (
          <div className="sketchizi-todo-completed-content" id="sketchizi-completed-tasks">
            <div className="sketchizi-todo-completed-list">{completed.map(renderTask)}</div>
            <button type="button" className="sketchizi-todo-clear" onClick={() => update(tasks.filter((task) => task.section !== "completed"))}>Clear completed</button>
          </div>
        )}
        {completedOpen && completed.length === 0 && (
          <div className="sketchizi-todo-completed-empty" id="sketchizi-completed-tasks">Completed tasks will appear here</div>
        )}
      </div>
    </section>
  );
}
