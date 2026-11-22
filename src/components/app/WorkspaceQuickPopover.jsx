import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { workspaceClient } from "../../features/workspace/workspaceClient.js";
import { readDiagramRows } from "../../features/workspace/diagramNames.js";
import {
  formatChapterLabel,
  normalizeChapterStatus,
  readChapterLayout,
  resolveChapterSequence,
  suggestNextChapterName,
} from "../../features/workspace/chapterSequence.js";

const STATUS_LABELS = { done: "Done", active: "Active", "up-next": "Up Next" };
const POPOVER_WIDTH = 320;
const EDGE_GAP = 8;

const readProjectRows = (result) => (Array.isArray(result) ? result : result?.projects || []);

/**
 * Lightweight Projects & Chapters switcher anchored under the header Workspace
 * button. Data is fetched when the popover opens, so nothing is requested at
 * page load. Opening a chapter or the full dashboard is delegated to App.
 */
export default function WorkspaceQuickPopover({
  open,
  anchorRef,
  isDark = false,
  activeProjectId = "",
  activeDiagramId = "",
  onClose,
  onOpenDiagram,
  onCreateChapter,
  onOpenFullWorkspace,
}) {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState({ top: 56, right: 12, width: POPOVER_WIDTH });
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [chapters, setChapters] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const project = projects.find((candidate) => candidate.id === projectId) || null;

  // Anchor below the right edge of the button; clamp inside the viewport.
  const place = useCallback(() => {
    const rect = anchorRef?.current?.getBoundingClientRect?.();
    if (!rect) return;
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - EDGE_GAP * 2);
    const right = Math.max(EDGE_GAP, Math.min(window.innerWidth - rect.right, window.innerWidth - width - EDGE_GAP));
    setPosition({ top: rect.bottom + 8, right, width });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

  // Escape and outside click close it.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose?.();
      anchorRef?.current?.focus?.();
    };
    const onPointerDown = (event) => {
      if (popoverRef.current?.contains(event.target) || anchorRef?.current?.contains(event.target)) return;
      onClose?.();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose, anchorRef]);

  // Load projects each time it opens (cheap, keeps it fresh).
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoadingProjects(true);
    setError("");
    setFormOpen(false);
    workspaceClient.listProjects()
      .then((result) => {
        if (cancelled) return;
        const rows = readProjectRows(result).filter((row) => row?.id);
        setProjects(rows);
        setProjectId((current) => (rows.some((row) => row.id === current) ? current
          : rows.some((row) => row.id === activeProjectId) ? activeProjectId : rows[0]?.id || ""));
      })
      .catch((reason) => { if (!cancelled) { setProjects([]); setError(reason?.message || "Could not load your workspace."); } })
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
  }, [open, activeProjectId]);

  const loadChapters = useCallback((id) => {
    if (!id) { setChapters([]); return () => {}; }
    let cancelled = false;
    setLoadingChapters(true);
    workspaceClient.listDiagrams(id)
      .then((result) => { if (!cancelled) setChapters(resolveChapterSequence(readDiagramRows(result), readChapterLayout(id))); })
      .catch((reason) => { if (!cancelled) { setChapters([]); setError(reason?.message || "Could not load chapters."); } })
      .finally(() => { if (!cancelled) setLoadingChapters(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setError("");
    return loadChapters(projectId);
  }, [open, projectId, loadChapters]);

  if (!open) return null;

  const openDiagram = async (diagram) => {
    if (busy) return;
    if (diagram.id === activeDiagramId) { onClose?.(); return; }
    setBusy(true);
    try {
      onClose?.();
      await onOpenDiagram?.(project, diagram);
    } finally { setBusy(false); }
  };

  const startCreate = () => {
    setNameDraft(suggestNextChapterName(chapters));
    setError("");
    setFormOpen(true);
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name || !project || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreateChapter?.(project, name);
      onClose?.();
    } catch (reason) {
      setError(reason?.message || "Could not create chapter.");
    } finally { setBusy(false); }
  };

  const body = (() => {
    if (loadingProjects) return <p className="workspace-popover-note">Loading your workspace…</p>;
    if (error && !projects.length) {
      return <p className="workspace-popover-note is-error" role="alert">{error}</p>;
    }
    if (!projects.length) return <p className="workspace-popover-note">No projects yet. Use Full View to create one.</p>;
    return (
      <>
        <div className="workspace-popover-projects" role="tablist" aria-label="Projects">
          {projects.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === projectId}
              className={`workspace-popover-pill${candidate.id === projectId ? " is-active" : ""}`}
              onClick={() => { setProjectId(candidate.id); setFormOpen(false); }}
              title={candidate.name}
            >{candidate.name}</button>
          ))}
        </div>
        <ul className="workspace-popover-chapters" aria-label={`${project?.name || "Project"} chapters`}>
          {loadingChapters && <li className="workspace-popover-note">Loading chapters…</li>}
          {!loadingChapters && !chapters.length && <li className="workspace-popover-note">No chapters in this project yet.</li>}
          {!loadingChapters && chapters.map((chapter) => {
            const status = normalizeChapterStatus(chapter.chapterStatus);
            const current = chapter.id === activeDiagramId;
            return (
              <li key={chapter.id}>
                <button
                  type="button"
                  className={`workspace-popover-chapter${current ? " is-current" : ""}`}
                  onClick={() => openDiagram(chapter)}
                  aria-current={current ? "true" : undefined}
                >
                  <span className="workspace-popover-chapter-number">{formatChapterLabel(chapter.chapterNumber)}</span>
                  <span className="workspace-popover-chapter-name">{chapter.name || chapter.title || "Untitled"}</span>
                  <span className={`workspace-popover-status is-${status}`}>{STATUS_LABELS[status]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p className="workspace-popover-note is-error" role="alert">{error}</p>}
        {formOpen ? (
          <form className="workspace-popover-form" onSubmit={submitCreate}>
            <input
              autoFocus
              maxLength={120}
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              aria-label="New chapter name"
              placeholder="Chapter name"
            />
            <button type="submit" className="workspace-popover-primary" disabled={busy || !nameDraft.trim()}>{busy ? "Creating…" : "Create"}</button>
          </form>
        ) : (
          <button type="button" className="workspace-popover-footer" onClick={startCreate} disabled={busy || !project}>
            + New Chapter in {project?.name}
          </button>
        )}
      </>
    );
  })();

  return createPortal(
    <div
      ref={popoverRef}
      className={`workspace-popover${isDark ? " is-dark" : ""}`}
      role="dialog"
      aria-label="Cloud Workspace"
      style={{ top: position.top, right: position.right, width: position.width }}
    >
      <div className="workspace-popover-header">
        <div className="workspace-popover-heading">
          <strong>Cloud Workspace</strong>
          <small>Switch chapters without leaving the editor</small>
        </div>
        <button type="button" className="workspace-popover-full" onClick={() => { onClose?.(); onOpenFullWorkspace?.(); }}>
          Full View ↗
        </button>
      </div>
      {body}
    </div>,
    document.body,
  );
}
