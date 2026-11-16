import { useMemo, useState } from "react";
import { buildSystemDesignImplementationPlan, mergeImplementationTaskProgress, renderSystemDesignImplementationPlanMarkdown, updateImplementationTask } from "./systemDesignImplementationPlanner.js";

const STORAGE_KEY = "sketchizi.system-design.implementation-plan.v1";
function readSavedPlan() {
  try { return typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") : null; } catch { return null; }
}
function savePlan(plan) {
  try { if (typeof window === "undefined") return false; window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); return true; } catch { return false; }
}
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export default function SystemDesignImplementationPlanner({ graph }) {
  const generated = useMemo(() => buildSystemDesignImplementationPlan(graph), [graph]);
  const [plan, setPlan] = useState(() => mergeImplementationTaskProgress(generated, readSavedPlan()));
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const refresh = () => { const next = mergeImplementationTaskProgress(generated, plan); setPlan(next); setMessage("Plan refreshed from the current diagram; existing task progress was preserved where component IDs matched."); };
  const changeTask = (componentId, patch) => setPlan((current) => updateImplementationTask(current, componentId, patch));
  const persist = () => setMessage(savePlan(plan) ? "Implementation plan saved in this browser." : "Could not save the plan in browser storage.");
  const visibleTasks = plan.tasks.filter((task) => filter === "all" || task.status === filter);
  const completed = plan.tasks.filter((task) => task.status === "done").length;
  return <section className="architecture-review-section system-design-implementation-planner" aria-label="Architecture implementation planner">
    <h2>Architecture implementation planner</h2>
    <p>Turn the current diagram into a sequenced delivery checklist. Suggested ordering, effort, and priority are heuristics; review them before using the plan for delivery.</p>
    <div className="architecture-review-dashboard-grid">
      <article className="architecture-review-dashboard-card"><h3>Implementation tasks</h3><strong>{plan.tasks.length}</strong><p>{plan.summary.phases} suggested phases</p></article>
      <article className="architecture-review-dashboard-card"><h3>Completed</h3><strong>{completed}/{plan.tasks.length}</strong><p>{plan.tasks.length ? Math.round(completed / plan.tasks.length * 100) : 0}% complete</p></article>
      <article className="architecture-review-dashboard-card"><h3>Connections</h3><strong>{plan.summary.connections}</strong><p>{plan.summary.dependencyCycles ? "Review dependency cycles manually" : "No dependency cycles detected"}</p></article>
    </div>
    <div className="architecture-review-filters"><label>Task status <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All tasks</option><option value="planned">Planned</option><option value="in-progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></label></div>
    <div className="architecture-review-inline-actions"><button type="button" onClick={refresh}>Refresh from diagram</button><button type="button" onClick={persist}>Save plan</button><button type="button" onClick={() => download("sketchizi-implementation-plan.md", renderSystemDesignImplementationPlanMarkdown(plan), "text/markdown;charset=utf-8")}>Export Markdown</button><button type="button" onClick={() => download("sketchizi-implementation-plan.json", JSON.stringify(plan, null, 2), "application/json")}>Export JSON</button></div>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {plan.tasks.length === 0 ? <p>No architecture components were found on the canvas. Add components to generate an implementation plan.</p> : visibleTasks.length === 0 ? <p>No tasks match this status filter.</p> : <div className="system-design-implementation-planner__tasks">{visibleTasks.map((task) => <article className="architecture-review-dashboard-card" key={task.componentId}>
      <div className="system-design-implementation-planner__heading"><div><small>Phase {task.phase} · Task {task.sequence}</small><h3>{task.title}</h3></div><span>{task.priority} priority</span></div>
      <p><strong>Dependencies:</strong> {task.dependencies.length ? task.dependencies.join(", ") : "None"}</p>
      <p><strong>Acceptance criteria:</strong> {task.acceptanceCriteria}</p>
      <div className="architecture-review-filters"><label>Status <select value={task.status} onChange={(event) => changeTask(task.componentId, { status: event.target.value })}><option value="planned">Planned</option><option value="in-progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></label><label>Priority <select value={task.priority} onChange={(event) => changeTask(task.componentId, { priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Effort <select value={task.effort} onChange={(event) => changeTask(task.componentId, { effort: event.target.value })}><option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option></select></label><label>Owner <input value={task.owner} maxLength={120} onChange={(event) => changeTask(task.componentId, { owner: event.target.value })} placeholder="Unassigned" /></label></div>
      <label>Task notes <textarea rows={2} maxLength={2000} value={task.notes} onChange={(event) => changeTask(task.componentId, { notes: event.target.value })} placeholder="Implementation notes, blockers, or follow-ups" /></label>
    </article>)}</div>}
    <p className="architecture-review-filter-status">Plan data is stored locally in this browser. It is not synchronized to other reviewers.</p>
  </section>;
}
