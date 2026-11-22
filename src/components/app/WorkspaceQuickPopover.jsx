import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  workspaceClient,
  clearWorkspaceCache,
  isWorkspaceTimeout,
  isWorkspaceUnauthorized,
  readWorkspaceCache,
  writeWorkspaceCache,
} from "../../features/workspace/workspaceClient.js";
import { fetchCurrentUser } from "../../features/auth/authClient.js";
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
  isAuthenticated,
  authUser = null,
  onOpenSignIn,
  onOpenLocalDrafts,
  workspaceProjects = null,
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
  // "checking" until we know; "authed" / "anon" afterwards.
  const [authState, setAuthState] = useState("checking");
  // True when the last background refresh failed and the list on screen is cached.
  const [stale, setStale] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");

  const project = projects.find((candidate) => candidate.id === projectId) || null;
  const knownSignedIn = typeof isAuthenticated === "boolean" ? isAuthenticated : (authUser ? true : undefined);

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

  // Escape and outside click close it (Escape closes the project selector first).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (selectorOpen) { setSelectorOpen(false); return; }
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
  }, [open, onClose, anchorRef, selectorOpen]);

  // Pick the project to show: keep the current one, else the active cloud
  // project, else the first.
  const pickProject = useCallback((rows) => {
    setProjectId((current) => (rows.some((row) => row.id === current) ? current
      : rows.some((row) => row.id === activeProjectId) ? activeProjectId : rows[0]?.id || ""));
  }, [activeProjectId]);

  // Step 1 on open: resolve auth. Props win; otherwise ask the shared, cached
  // auth check. A failed check is not "signed out": try the cloud and let a
  // real 401 decide.
  useEffect(() => {
    if (!open) return undefined;
    if (knownSignedIn !== undefined) { setAuthState(knownSignedIn ? "authed" : "anon"); return undefined; }
    const controller = new AbortController();
    setAuthState("checking");
    fetchCurrentUser(controller.signal)
      .then(({ authenticated }) => setAuthState(authenticated ? "authed" : "anon"))
      .catch((reason) => { if (reason?.name !== "AbortError") setAuthState("authed"); });
    return () => controller.abort();
  }, [open, knownSignedIn]);

  // Step 2 on open: seed instantly from props / localStorage so the list
  // renders with no wait, then revalidate in the background.
  useEffect(() => {
    if (!open) return;
    const cache = readWorkspaceCache();
    const seeded = Array.isArray(workspaceProjects) && workspaceProjects.length ? workspaceProjects : cache.projects;
    const rows = seeded.filter((row) => row?.id);
    setProjects(rows);
    pickProject(rows);
    setFormOpen(false);
    setSelectorOpen(false);
    setProjectFormOpen(false);
    setProjectQuery("");
    setError("");
    setStale(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Step 3: background revalidation of the project list.
  useEffect(() => {
    if (!open || authState === "checking") return undefined;
    if (authState === "anon") { setLoadingProjects(false); setLoadingChapters(false); return undefined; }
    let cancelled = false;
    setLoadingProjects(true);
    workspaceClient.listProjects()
      .then((result) => {
        if (cancelled) return;
        const rows = readProjectRows(result).filter((row) => row?.id);
        setProjects(rows);
        pickProject(rows);
        setStale(false);
        setError("");
        writeWorkspaceCache({ projects: rows });
      })
      .catch((reason) => {
        if (cancelled) return;
        if (isWorkspaceUnauthorized(reason)) {
          // Session ended: show the signed-out card, never the raw error, and
          // drop the snapshot so it cannot leak to the next account.
          clearWorkspaceCache();
          setProjects([]); setChapters([]); setStale(false); setError("");
          setAuthState("anon");
          return;
        }
        // Timeout / offline / server error: keep whatever is on screen.
        setStale(true);
        setError(isWorkspaceTimeout(reason) ? "timeout" : "unavailable");
      })
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
  }, [open, authState, retryNonce, pickProject]);

  // Step 4: chapters for the selected project, cache first.
  useEffect(() => {
    if (!open || !projectId || authState !== "authed") { if (!projectId) setChapters([]); return undefined; }
    let cancelled = false;
    const cachedRows = readWorkspaceCache().chapters[projectId];
    if (Array.isArray(cachedRows)) {
      setChapters(resolveChapterSequence(cachedRows, readChapterLayout(projectId)));
    } else {
      setChapters([]);
    }
    setLoadingChapters(!Array.isArray(cachedRows));
    workspaceClient.listDiagrams(projectId)
      .then((result) => {
        if (cancelled) return;
        const rows = readDiagramRows(result);
        setChapters(resolveChapterSequence(rows, readChapterLayout(projectId)));
        writeWorkspaceCache({ chapters: { [projectId]: rows } });
        setStale(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        if (isWorkspaceUnauthorized(reason)) { clearWorkspaceCache(); setAuthState("anon"); return; }
        setStale(true);
        setError(isWorkspaceTimeout(reason) ? "timeout" : "unavailable");
      })
      .finally(() => { if (!cancelled) setLoadingChapters(false); });
    return () => { cancelled = true; };
  }, [open, projectId, authState, retryNonce]);

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
      if (isWorkspaceUnauthorized(reason)) { clearWorkspaceCache(); setAuthState("anon"); }
      else setError("create-failed");
    } finally { setBusy(false); }
  };

  const createProject = async (event) => {
    event.preventDefault();
    const name = projectNameDraft.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const created = await workspaceClient.createProject({ name, description: "" });
      const next = [created, ...projects.filter((row) => row.id !== created?.id)].filter((row) => row?.id);
      setProjects(next);
      setProjectId(created?.id || projectId);
      writeWorkspaceCache({ projects: next });
      setProjectFormOpen(false);
      setProjectNameDraft("");
      setSelectorOpen(false);
    } catch (reason) {
      if (isWorkspaceUnauthorized(reason)) { clearWorkspaceCache(); setAuthState("anon"); }
      else setError("create-failed");
    } finally { setBusy(false); }
  };

  const signIn = () => {
    onClose?.();
    if (onOpenSignIn) { onOpenSignIn(); return; }
    // AuthenticationControl listens for this and opens the existing sign-in dialog.
    window.dispatchEvent(new CustomEvent("sketchizi:auth-required", {
      detail: {
        message: "Sign in to access Cloud Workspace. Your projects and diagrams are saved to your account.",
        returnTo: window.location.pathname + window.location.search + window.location.hash,
      },
    }));
  };

  const filteredProjects = projects.filter((candidate) =>
    !projectQuery.trim() || String(candidate.name || "").toLowerCase().includes(projectQuery.trim().toLowerCase()));
  const chapterCountLabel = (candidate) => {
    const count = Number.isFinite(candidate?.diagramCount) ? candidate.diagramCount : null;
    return count === null ? "" : `${count} chapter${count === 1 ? "" : "s"}`;
  };

  const retry = () => { setError(""); setRetryNonce((value) => value + 1); };

  const body = (() => {
    if (authState === "anon") {
      return (
        <div className="workspace-popover-auth" role="region" aria-label="Sign in required">
          <span className="workspace-popover-auth-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18H6a4 4 0 1 1 .8-7.9A6 6 0 0 1 18.5 9 4.5 4.5 0 0 1 18 18h-1" /></svg>
          </span>
          <strong>Sign in to access Cloud Workspace</strong>
          <p>Sync your multi-chapter system design flows across devices.</p>
          <button type="button" className="workspace-popover-primary workspace-popover-auth-primary" onClick={signIn}>Sign in</button>
          <button type="button" className="workspace-popover-link" onClick={() => { onClose?.(); onOpenLocalDrafts?.(); }}>Open Local Drafts</button>
        </div>
      );
    }
    if (authState === "checking" && !projects.length) return <p className="workspace-popover-note">Loading your workspace…</p>;
    if (loadingProjects && !projects.length) return <p className="workspace-popover-note">Loading your workspace…</p>;
    if (!projects.length && stale) {
      return (
        <div className="workspace-popover-banner" role="status">
          <span>{error === "timeout" ? "Connection took too long" : "Cloud Workspace is unavailable right now"}</span>
          <button type="button" onClick={retry}>Retry</button>
        </div>
      );
    }
    if (!projects.length) {
      return (
        <>
          <p className="workspace-popover-note">No projects yet.</p>
          {projectFormOpen ? (
            <form className="workspace-popover-form" onSubmit={createProject}>
              <input autoFocus maxLength={120} value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} aria-label="New project name" placeholder="Project name" />
              <button type="submit" className="workspace-popover-primary" disabled={busy || !projectNameDraft.trim()}>{busy ? "Creating…" : "Create"}</button>
            </form>
          ) : (
            <button type="button" className="workspace-popover-footer" onClick={() => setProjectFormOpen(true)}>+ Create New Project</button>
          )}
        </>
      );
    }
    return (
      <>
        {stale && (
          <div className="workspace-popover-chip-row">
            <span className="workspace-popover-chip" role="status">Offline / Cached view</span>
            <button type="button" className="workspace-popover-chip is-action" onClick={retry}>Retry</button>
          </div>
        )}
        <div className="workspace-popover-selector">
          <button
            type="button"
            className={`workspace-popover-selector-trigger${selectorOpen ? " is-open" : ""}`}
            aria-haspopup="listbox"
            aria-expanded={selectorOpen}
            aria-label={`Project: ${project?.name || "Select a project"}`}
            onClick={() => { setSelectorOpen((value) => !value); setProjectQuery(""); }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
            <span className="workspace-popover-selector-name">{project?.name || "Select a project"}</span>
            {project && chapterCountLabel(project) && <span className="workspace-popover-count">{chapterCountLabel(project)}</span>}
            <svg className="workspace-popover-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {selectorOpen && (
            <div className="workspace-popover-menu">
              {projects.length > 4 && (
                <input
                  autoFocus
                  type="search"
                  className="workspace-popover-menu-search"
                  placeholder="Search projects..."
                  aria-label="Search projects"
                  value={projectQuery}
                  onChange={(event) => setProjectQuery(event.target.value)}
                />
              )}
              <ul className="workspace-popover-menu-list" role="listbox" aria-label="Projects">
                {filteredProjects.map((candidate) => {
                  const selected = candidate.id === projectId;
                  return (
                    <li key={candidate.id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        className={`workspace-popover-menu-item${selected ? " is-active" : ""}`}
                        title={candidate.name}
                        onClick={() => { setProjectId(candidate.id); setFormOpen(false); setSelectorOpen(false); }}
                      >
                        <span className="workspace-popover-menu-name">{candidate.name}</span>
                        {chapterCountLabel(candidate) && <span className="workspace-popover-count">{chapterCountLabel(candidate)}</span>}
                        <span className="workspace-popover-menu-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                      </button>
                    </li>
                  );
                })}
                {!filteredProjects.length && <li className="workspace-popover-note">No matching projects.</li>}
              </ul>
              {projectFormOpen ? (
                <form className="workspace-popover-form workspace-popover-menu-form" onSubmit={createProject}>
                  <input autoFocus maxLength={120} value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} aria-label="New project name" placeholder="Project name" />
                  <button type="submit" className="workspace-popover-primary" disabled={busy || !projectNameDraft.trim()}>{busy ? "Creating…" : "Create"}</button>
                </form>
              ) : (
                <button type="button" className="workspace-popover-menu-create" onClick={() => setProjectFormOpen(true)}>+ Create New Project</button>
              )}
            </div>
          )}
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
        {error === "create-failed" && <p className="workspace-popover-note" role="status">Couldn't create that. Please try again.</p>}
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
        {authState !== "anon" && (
          <button type="button" className="workspace-popover-full" onClick={() => { onClose?.(); onOpenFullWorkspace?.(); }}>
            Full View ↗
          </button>
        )}
      </div>
      {body}
    </div>,
    document.body,
  );
}
