import React, { useMemo, useRef, useState } from "react";
import { MAX_TASK_TEXT_LENGTH, addTaskToList, applyTaskEdit, clearCompletedTasks, getEmptyTaskState, isTaskCompleted, moveTask, removeTaskById, setTaskChecked, summarizeTasks } from "./todoModel.js";

function normalizeCanvasTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

const ICON_PROPS = { viewBox: "0 0 24 24", width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
const EditIcon = () => <svg {...ICON_PROPS}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
const DoneIcon = () => <svg {...ICON_PROPS}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const UndoIcon = () => <svg {...ICON_PROPS}><path d="M9 14 4 9l5-5" /><path d="M4 9h9a6 6 0 0 1 0 12h-3" /></svg>;
const TrashIcon = () => <svg {...ICON_PROPS}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>;

export default function TodoList({ items = [], onChange, onClose, isDarkTheme = false, fullPage = false, canvasTabs = [], onNavigateToCanvas }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [completedOpen, setCompletedOpen] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const { tasks, active, completed, checkedCount, leftCount, progress } = useMemo(() => summarizeTasks(items), [items]);
  const emptyState = getEmptyTaskState(items);
  const update = (next) => onChange?.(next);
  const addInputRef = useRef(null);
  const cancelEditRef = useRef(false);
  const addTask = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    update(addTaskToList(tasks, draft));
    setDraft("");
    // Keep typing: the next task can be entered straight away.
    addInputRef.current?.focus();
  };
  const commitEdit = (task) => {
    patch(task.id, { text: applyTaskEdit(task, editingText).text });
    setEditingId(null);
  };
  const startEdit = (task) => { cancelEditRef.current = false; setEditingId(task.id); setEditingText(task.text); };
  const patch = (id, changes) => update(tasks.map((task) => task.id === id ? { ...task, ...changes } : task));
  const transform = (id, fn) => update(tasks.map((task) => task.id === id ? fn(task) : task));
  const remove = (id) => update(removeTaskById(tasks, id));
  const move = (id, section) => transform(id, (task) => moveTask(task, section));
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
    <div className={`sketchizi-todo-task${isTaskCompleted(task) ? " is-completed" : ""}${draggedId === task.id ? " is-dragging" : ""}`} key={task.id}
      draggable onDragStart={() => setDraggedId(task.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(task.id)} onDragEnd={() => setDraggedId(null)}>
      <span className="sketchizi-todo-grip" aria-hidden="true">⠿</span>
      <input type="checkbox" checked={isTaskCompleted(task)} onChange={(event) => transform(task.id, (current) => setTaskChecked(current, event.target.checked))} aria-label={`Mark ${task.text} ${isTaskCompleted(task) ? "incomplete" : "complete"}`} />
      {editingId === task.id ? (
        <input className="sketchizi-todo-edit" autoFocus value={editingText} maxLength={MAX_TASK_TEXT_LENGTH} aria-label={`Edit task ${task.text}`} onChange={(event) => setEditingText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") commitEdit(task); if (event.key === "Escape") { cancelEditRef.current = true; setEditingId(null); } }}
          onBlur={() => { if (cancelEditRef.current) { cancelEditRef.current = false; return; } commitEdit(task); }} />
      ) : (
        <button type="button" className={`sketchizi-todo-task-text${matchingCanvas ? " is-canvas-link" : ""}`} title={matchingCanvas ? `Open ${matchingCanvas.name} canvas` : task.text} onClick={() => { if (matchingCanvas) onNavigateToCanvas?.(matchingCanvas.id); else startEdit(task); }} aria-label={matchingCanvas ? `Open canvas ${matchingCanvas.name}` : `Edit task ${task.text}`}>
          {task.text}{matchingCanvas && <span className="sketchizi-todo-canvas-link-icon" aria-hidden="true">↗</span>}
        </button>
      )}
      <span className="sketchizi-todo-row-actions">
        {editingId !== task.id && <button type="button" className="sketchizi-todo-action is-edit" title="Edit task" aria-label={`Rename ${task.text}`} onClick={() => startEdit(task)}><EditIcon /></button>}
        {task.section === "completed" ? (
          <button type="button" className="sketchizi-todo-action" title="Move back to tasks" aria-label="Move back to tasks" onClick={() => move(task.id, "active")}><UndoIcon /></button>
        ) : (
          <button type="button" className="sketchizi-todo-action is-done" title="Move to completed" aria-label="Move to completed" onClick={() => move(task.id, "completed")}><DoneIcon /></button>
        )}
        <button type="button" className="sketchizi-todo-action is-delete" title="Delete task" aria-label={`Delete ${task.text}`} onClick={() => remove(task.id)}><TrashIcon /></button>
      </span>
    </div>
    );
  };
  return (
    <section className={`sketchizi-todo-popover${isDarkTheme ? " is-dark" : ""}${fullPage ? " is-full-page" : ""}`} role={fullPage ? "region" : "dialog"} aria-label="Tasks">
      <header className="sketchizi-todo-header">
        <div className="sketchizi-todo-title">
          <span className="sketchizi-todo-title-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h12M8 12h12M8 18h12"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></svg>
          </span>
          <span><strong>Tasks</strong><small>{leftCount} {leftCount === 1 ? "task" : "tasks"} left</small></span>
        </div>
        {!fullPage && <button type="button" className="sketchizi-todo-close" aria-label="Close Tasks" onClick={onClose}>×</button>}
      </header>
      <div className="sketchizi-todo-progress" aria-label={`${progress}% complete`}>
        <div className="sketchizi-todo-progress-meta"><span>Progress</span><strong>{checkedCount}/{tasks.length} completed</strong></div>
        <div className="sketchizi-todo-progress-track"><span style={{ width: `${progress}%` }} /></div>
      </div>
      <form className="sketchizi-todo-add" onSubmit={addTask}>
        <span aria-hidden="true">＋</span>
        <input ref={addInputRef} value={draft} maxLength={MAX_TASK_TEXT_LENGTH} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task…" aria-label="New task" enterKeyHint="done" />
        <button type="submit" disabled={!draft.trim()}>Add task</button>
      </form>
      <div className="sketchizi-todo-section-heading"><strong>Tasks</strong><span>{active.length}</span></div>
      <div className="sketchizi-todo-list">
        {active.length ? active.map(renderTask) : (
          <div className={`sketchizi-todo-empty is-${emptyState}`} role="status">
            <span className="sketchizi-todo-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {emptyState === "all-done" ? <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></> : <><rect x="4.5" y="3.5" width="15" height="17" rx="2.5" /><path d="M8.5 9h7M8.5 13h7M8.5 17h4" /></>}
              </svg>
            </span>
            <strong>{emptyState === "all-done" ? "You're all caught up" : "No tasks yet"}</strong>
            <span>{emptyState === "all-done" ? "Every task is done. Add another when you're ready." : "Type a task above and press Enter to add it."}</span>
          </div>
        )}
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
          <span className="sketchizi-todo-completed-chevron" aria-hidden="true">›</span>
        </button>
        {completedOpen && completed.length > 0 && (
          <div className="sketchizi-todo-completed-content" id="sketchizi-completed-tasks">
            <div className="sketchizi-todo-completed-list">{completed.map(renderTask)}</div>
            <button type="button" className="sketchizi-todo-clear" onClick={() => update(clearCompletedTasks(tasks))}>Clear completed</button>
          </div>
        )}
        {completedOpen && completed.length === 0 && (
          <div className="sketchizi-todo-completed-empty" id="sketchizi-completed-tasks">Completed tasks will appear here</div>
        )}
      </div>
    </section>
  );
}
