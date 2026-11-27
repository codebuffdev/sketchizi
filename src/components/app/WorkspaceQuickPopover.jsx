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
import { formatBytes, getDiagramBytes, readSizeCache } from "../../features/workspace/diagramSize.js";
import {
  formatChapterLabel,
  readChapterLayout,
  resolveChapterSequence,
  suggestNextChapterName,
} from "../../features/workspace/chapterSequence.js";

const POPOVER_WIDTH = 348;
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
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [position, setPosition] = useState({ top: 56, right: 12, width: POPOVER_WIDTH });
  const [projects, setProjects] = useState([]);
  // "all" or a project id: which project pill is active.
  const [scope, setScope] = useState("all");
  const [chaptersByProject, setChaptersByProject] = useState({});
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
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");

  // Project that "+ New Chapter" targets: the active pill, else the open
  // cloud project, else the first one.
  const project = projects.find((candidate) => candidate.id === scope)
    || projects.find((candidate) => candidate.id === activeProjectId)
    || projects[0] || null;
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

  // Drop a pill whose project disappeared; "all" always stays valid.
  const pickProject = useCallback((rows) => {
    setScope((current) => (current === "all" || rows.some((row) => row.id === current) ? current : "all"));
  }, []);

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
    setScope("all");
    setFormOpen(false);
    setProjectFormOpen(false);
    setQuery("");
    setHighlight(0);
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
          setProjects([]); setChaptersByProject({}); setStale(false); setError("");
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

  // Step 4: chapters for every project (the "All" pill and the counts need
  // them), cache first, then one revalidation request per project.
  const projectKey = projects.map((row) => row.id).join("|");
  useEffect(() => {
    if (!open || authState !== "authed" || !projects.length) return undefined;
    let cancelled = false;
    const cached = readWorkspaceCache().chapters;
    const seeded = {};
    let missing = 0;
    for (const row of projects) {
      if (Array.isArray(cached[row.id])) seeded[row.id] = resolveChapterSequence(cached[row.id], readChapterLayout(row.id));
      else missing += 1;
    }
    setChaptersByProject((current) => ({ ...seeded, ...current }));
    setLoadingChapters(missing > 0);
    let pending = projects.length;
    const settle = () => { pending -= 1; if (!cancelled && pending <= 0) setLoadingChapters(false); };
    projects.forEach((row) => {
      workspaceClient.listDiagrams(row.id)
        .then((result) => {
          if (cancelled) return;
          const rows = readDiagramRows(result);
          setChaptersByProject((current) => ({ ...current, [row.id]: resolveChapterSequence(rows, readChapterLayout(row.id)) }));
          writeWorkspaceCache({ chapters: { [row.id]: rows } });
          setStale(false);
        })
        .catch((reason) => {
          if (cancelled) return;
          if (isWorkspaceUnauthorized(reason)) { clearWorkspaceCache(); setAuthState("anon"); return; }
          setStale(true);
          setError(isWorkspaceTimeout(reason) ? "timeout" : "unavailable");
        })
        .finally(settle);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectKey, authState, retryNonce]);

  // Focus the filter as soon as it exists.
  useEffect(() => {
    if (open && authState === "authed" && projects.length) inputRef.current?.focus();
  }, [open, authState, projects.length]);

  // Rows on screen: the active pill's chapters, narrowed by the filter text.
  const needle = query.trim().toLowerCase();
  const visibleRows = projects
    .filter((candidate) => scope === "all" || candidate.id === scope)
    .flatMap((candidate) => (chaptersByProject[candidate.id] || []).map((chapter) => ({ chapter, owner: candidate })))
    .filter(({ chapter, owner }) => !needle
      || String(chapter.name || chapter.title || "").toLowerCase().includes(needle)
      || String(owner.name || "").toLowerCase().includes(needle));
  const visibleKey = visibleRows.map(({ chapter }) => chapter.id).join("|");

  // Start the highlight on the open chapter (else the first row) whenever the list changes.
  useEffect(() => {
    const current = visibleRows.findIndex(({ chapter }) => chapter.id === activeDiagramId);
    setHighlight(!needle && current >= 0 ? current : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, scope, needle]);

  useEffect(() => {
    listRef.current?.querySelector?.(".is-highlighted")?.scrollIntoView?.({ block: "nearest" });
  }, [highlight, visibleKey]);

  if (!open) return null;

  const openDiagram = async (diagram, owner = project) => {
    if (busy) return;
    if (diagram.id === activeDiagramId) { onClose?.(); return; }
    setBusy(true);
    try {
      onClose?.();
      await onOpenDiagram?.(owner, diagram);
    } finally { setBusy(false); }
  };

  const startCreate = () => {
    setNameDraft(suggestNextChapterName(chaptersByProject[project?.id] || []));
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
      if (created?.id) setScope(created.id);
      writeWorkspaceCache({ projects: next });
      setProjectFormOpen(false);
      setProjectNameDraft("");
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

  const pillCount = (candidate) => {
    const loaded = chaptersByProject[candidate.id];
    if (Array.isArray(loaded)) return loaded.length;
    return Number.isFinite(candidate?.diagramCount) ? candidate.diagramCount : null;
  };
  const totalChapters = projects.reduce((sum, candidate) => sum + (pillCount(candidate) || 0), 0);
  const sizeCache = readSizeCache();

  const onFilterKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!visibleRows.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((value) => (value + step + visibleRows.length) % visibleRows.length);
    } else if (event.key === "Enter") {
      const target = visibleRows[highlight];
      if (!target) return;
      event.preventDefault();
      openDiagram(target.chapter, target.owner);
    }
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
    const listId = "workspace-popover-listbox";
    const highlighted = visibleRows[highlight];
    return (
      <>
        {stale && (
          <div className="workspace-popover-chip-row">
            <span className="workspace-popover-chip" role="status">Offline / Cached view</span>
            <button type="button" className="workspace-popover-chip is-action" onClick={retry}>Retry</button>
          </div>
        )}
        <div className="workspace-popover-search">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={highlighted ? `workspace-popover-row-${highlighted.chapter.id}` : undefined}
            aria-label="Filter projects or chapters"
            placeholder="Filter projects or chapters..."
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onFilterKeyDown}
          />
          {query && (
            <button type="button" className="workspace-popover-clear" aria-label="Clear filter" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>✕</button>
          )}
        </div>
        <div className="workspace-popover-projects" role="tablist" aria-label="Projects">
          <button type="button" role="tab" aria-selected={scope === "all"} className={`workspace-popover-pill${scope === "all" ? " is-active" : ""}`} onClick={() => { setScope("all"); setFormOpen(false); }}>
            All <span className="workspace-popover-pill-count">{totalChapters}</span>
          </button>
          {projects.map((candidate) => {
            const count = pillCount(candidate);
            return (
              <button key={candidate.id} type="button" role="tab" aria-selected={scope === candidate.id} title={candidate.name} className={`workspace-popover-pill${scope === candidate.id ? " is-active" : ""}`} onClick={() => { setScope(candidate.id); setFormOpen(false); }}>
                <span className="workspace-popover-pill-name">{candidate.name}</span>
                {count !== null && <span className="workspace-popover-pill-count">{count}</span>}
              </button>
            );
          })}
          <button type="button" className="workspace-popover-pill is-ghost" aria-label="Create new project" title="Create New Project" onClick={() => setProjectFormOpen((value) => !value)}>+</button>
        </div>
        {projectFormOpen && (
          <form className="workspace-popover-form" onSubmit={createProject}>
            <input autoFocus maxLength={120} value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} aria-label="New project name" placeholder="Project name" />
            <button type="submit" className="workspace-popover-primary" disabled={busy || !projectNameDraft.trim()}>{busy ? "Creating…" : "Create"}</button>
          </form>
        )}
        <ul ref={listRef} id={listId} role="listbox" className="workspace-popover-chapters" aria-label="Chapters">
          {loadingChapters && !visibleRows.length && <li className="workspace-popover-note">Loading chapters…</li>}
          {!loadingChapters && !visibleRows.length && (
            <li className="workspace-popover-note">{needle ? "No matching chapters." : "No chapters in this project yet."}</li>
          )}
          {visibleRows.map(({ chapter, owner }, index) => {
            const current = chapter.id === activeDiagramId;
            const bytes = getDiagramBytes(chapter, sizeCache);
            const meta = [scope === "all" ? owner.name : "", bytes !== null ? formatBytes(bytes) : ""].filter(Boolean).join(" · ");
            return (
              <li key={chapter.id} id={`workspace-popover-row-${chapter.id}`} role="option" aria-selected={current}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={`workspace-popover-chapter${current ? " is-current" : ""}${index === highlight ? " is-highlighted" : ""}`}
                  onClick={() => openDiagram(chapter, owner)}
                  onMouseMove={() => { if (index !== highlight) setHighlight(index); }}
                  aria-current={current ? "true" : undefined}
                >
                  <span className="workspace-popover-chapter-number">{formatChapterLabel(chapter.chapterNumber)}</span>
                  <span className="workspace-popover-chapter-text">
                    <span className="workspace-popover-chapter-name">{chapter.name || chapter.title || "Untitled"}</span>
                    {meta && <span className="workspace-popover-chapter-meta">{meta}</span>}
                  </span>
                  <span className="workspace-popover-chapter-check" aria-hidden="true">{current ? "✓" : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error === "create-failed" && <p className="workspace-popover-note" role="status">Couldn't create that. Please try again.</p>}
        {formOpen ? (
          <form className="workspace-popover-form workspace-popover-section" onSubmit={submitCreate}>
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
        <div className="workspace-popover-hint" aria-hidden="true">↑↓ navigate · ↵ switch · esc close</div>
      </>
    );
  })();

  return createPortal(
    <div
      ref={popoverRef}
      className={`workspace-popover${isDark ? " is-dark" : ""}`}
      role="dialog"
      aria-label="Cloud Workspace: Switch chapters without leaving the editor"
      style={{ top: position.top, right: position.right, width: position.width }}
    >
      <div className="workspace-popover-header">
        <div className="workspace-popover-heading" title="Switch chapters without leaving the editor">
          <span className="workspace-popover-dot" aria-hidden="true">●</span>
          <strong>Cloud Workspace</strong>
          {authState === "authed" && totalChapters > 0 && (
            <span className="workspace-popover-total">· {totalChapters} chapter{totalChapters === 1 ? "" : "s"}</span>
          )}
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
