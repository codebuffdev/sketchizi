import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInitialThemeMode, THEME_PREFERENCE_KEY } from "../navigation/themePreference.js";
import { workspaceClient, writeWorkspaceCache } from "./workspaceClient.js";
import { findDuplicateDiagramName, readDiagramRows } from "./diagramNames.js";
import { WORKSPACE_GRID_SORTS, findLastOpenedItem, formatWorkspaceDate as dateLabel, mergeWorkspaceActivity, recordWorkspaceItemOpened, sortWorkspaceDiagrams, sortWorkspaceRecentlyUsed } from "./workspacePresentation.js";
import {
  CHAPTER_STATUS_LABELS, appendChapter, buildChapterLayout, countCompletedChapters, cycleChapterStatus, formatChapterBadge, formatChapterLabel,
  getChapterChanges, moveChapter, readChapterLayout, removeChapter, reorderChapters, resolveChapterSequence, setChapterStatus, suggestNextChapterName, writeChapterLayout,
} from "./chapterSequence.js";
import { buildDownloadPayload, computeDocumentBytes, downloadFilename, formatBytes, getDiagramBytes, getSizeState, loadFullDocument, readSizeCache, sumBytes, triggerJsonDownload, writeSizeCache } from "./diagramSize.js";
import "./workspace.css";



const DiagramThumbnail = ({ diagram }) => {
  const document = diagram?.document && typeof diagram.document === "object" ? diagram.document : {};
  const elements = Array.isArray(document.elements) ? document.elements.filter((element) => element && !element.isDeleted) : [];
  if (!elements.length) return <div className="cw-diagram-preview cw-diagram-preview-empty" aria-label="Empty diagram"><span className="cw-preview-empty-mark">◇</span><small>Empty diagram</small></div>;

  const bounds = elements.reduce((box, element) => {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Math.max(1, Math.abs(Number(element.width) || 1));
    const height = Math.max(1, Math.abs(Number(element.height) || 1));
    return { minX: Math.min(box.minX, x), minY: Math.min(box.minY, y), maxX: Math.max(box.maxX, x + width), maxY: Math.max(box.maxY, y + height) };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const padding = Math.max(12, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.06);
  const viewBox = [bounds.minX - padding, bounds.minY - padding, Math.max(1, bounds.maxX - bounds.minX + padding * 2), Math.max(1, bounds.maxY - bounds.minY + padding * 2)].join(" ");
  const drawElement = (element) => {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Math.max(1, Math.abs(Number(element.width) || 1));
    const height = Math.max(1, Math.abs(Number(element.height) || 1));
    const stroke = element.strokeColor || "#94a3b8";
    const fill = element.backgroundColor && element.backgroundColor !== "transparent" ? element.backgroundColor : "none";
    const common = { key: element.id || `${element.type}-${x}-${y}`, stroke, strokeWidth: Math.max(1, Number(element.strokeWidth) || 1.5), fill, opacity: element.opacity == null ? 1 : element.opacity / 100, vectorEffect: "non-scaling-stroke" };
    if (["rectangle", "image", "embeddable", "frame"].includes(element.type)) return <rect {...common} x={x} y={y} width={width} height={height} rx={element.roundness ? 4 : 0} />;
    if (element.type === "ellipse") return <ellipse {...common} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} />;
    if (element.type === "diamond") return <polygon {...common} points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`} />;
    if (["line", "arrow", "freedraw"].includes(element.type) && Array.isArray(element.points) && element.points.length) {
      const points = element.points.map((point) => `${x + (Number(point[0]) || 0)},${y + (Number(point[1]) || 0)}`).join(" ");
      return <polyline {...common} fill="none" points={points} strokeLinecap="round" strokeLinejoin="round" />;
    }
    if (element.type === "text") {
      const text = String(element.originalText || element.text || "").split("\n").slice(0, 3);
      const fontSize = Math.max(7, Math.min(Number(element.fontSize) || 16, 24));
      return <text key={common.key} x={x} y={y + fontSize} fill={stroke} fontSize={fontSize} opacity={common.opacity}>{text.map((line, index) => <tspan key={index} x={x} dy={index ? fontSize * 1.15 : 0}>{line.slice(0, 48)}</tspan>)}</text>;
    }
    return <rect {...common} x={x} y={y} width={width} height={height} rx="2" />;
  };
  return <div className="cw-diagram-preview" aria-label={`Preview of ${diagram.name}`}><svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">{elements.slice(0, 250).map(drawElement)}</svg></div>;
};

const VIEW_MODE_KEY = "sketchizi.workspace.chapterView.v1";

const PencilIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>;
const DownloadIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>;
const SIZE_WARNING_TEXT = { heavy: "Heavy diagram (2 MB or more), often large embedded images" };
const SizeBadge = ({ bytes }) => {
  if (!Number.isFinite(bytes)) return null;
  const state = getSizeState(bytes);
  const title = SIZE_WARNING_TEXT[state] || `Canvas size: ${bytes.toLocaleString()} bytes`;
  return <span className={`cw-size-badge is-${state}`} title={title} aria-label={`Size ${formatBytes(bytes)}${SIZE_WARNING_TEXT[state] ? `. ${SIZE_WARNING_TEXT[state]}` : ""}`}>{state === "heavy" && <span className="cw-size-dot" aria-hidden="true" />}{formatBytes(bytes)}</span>;
};
const TrashIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>;

function ChapterCard({ d, bytes, downloading, onDownload, variant, busy, reorderable, isFirst, isLast, isLastOpened, renaming, dragging, dragOver, onOpen, onStartRename, onCommitRename, onCancelRename, onDelete, onDuplicate, onMove, onCycleStatus, dragProps }) {
  const classes = ["cw-diagram-card", "cw-chapter-card", variant === "flow" ? "is-flow" : "is-grid", `is-${d.chapterStatus}`, isLastOpened ? "is-last-opened" : "", dragging ? "is-dragging" : "", dragOver ? "is-drag-over" : ""].filter(Boolean).join(" ");
  const moveHint = reorderable ? undefined : "Switch to Sequence Order to reorder chapters";
  return <article className={classes} role={variant === "flow" ? "listitem" : undefined} data-chapter-id={d.id} {...dragProps}>
    <div className="cw-chapter-top">
      <span className="cw-drag-handle" aria-hidden="true" title={reorderable ? "Drag to reorder" : moveHint}>⋮⋮</span>
      <span className="cw-chapter-pill">{formatChapterBadge(d.chapterNumber)}</span>
      <SizeBadge bytes={bytes} />
      <button type="button" className={`cw-status-pill is-${d.chapterStatus}`} disabled={busy} onClick={onCycleStatus} title="Click to change status" aria-label={`Status: ${CHAPTER_STATUS_LABELS[d.chapterStatus]}. Click to change.`}>{CHAPTER_STATUS_LABELS[d.chapterStatus]}</button>
    </div>
    <DiagramThumbnail diagram={d} />
    <div className="cw-diagram-body">
      <div className="cw-chapter-title-row">
        {renaming
          ? <input className="cw-rename-input" autoFocus maxLength={120} aria-label="Chapter name" defaultValue={d.name} onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCommitRename(e.currentTarget.value); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancelRename(); } }}
              onBlur={(e) => onCommitRename(e.currentTarget.value)} />
          : <b title={`${d.name} — double-click to rename`} onDoubleClick={() => { if (!busy) onStartRename(); }}>{d.name}</b>}
        <span className="cw-chapter-icons">
          <button type="button" className="cw-icon-button" disabled={busy || renaming} onClick={onStartRename} aria-label={`Rename ${d.name}`} title="Rename"><PencilIcon /></button>
          <button type="button" className="cw-icon-button cw-icon-danger" disabled={busy} onClick={onDelete} aria-label={`Delete ${d.name}`} title="Delete"><TrashIcon /></button>
        </span>
      </div>
      <div className="cw-chapter-meta"><small>sketchizi · {dateLabel(d.lastOpenedAt || d.lastUsedAt || d.updatedAt || d.createdAt)}{Number.isFinite(bytes) ? ` · ${formatBytes(bytes)}` : ""}</small>{isLastOpened && <span className="cw-last-opened-pill">Last Opened</span>}</div>
      <div className="cw-chapter-actions">
        <button type="button" className="cw-open-button" disabled={busy} onClick={onOpen}>Open</button>
        <button type="button" disabled={busy} onClick={onDuplicate}>Duplicate</button>
        <button type="button" className={`cw-download-button${downloading ? " is-loading" : ""}`} disabled={busy || downloading} onClick={onDownload} aria-busy={downloading || undefined} aria-label={`Download ${d.name} as .sketchizi.json`} title="Download .sketchizi.json">{downloading ? <span className="cw-spinner" aria-hidden="true" /> : <DownloadIcon />}</button>
        <span className="cw-move-group">
          <button type="button" disabled={busy || !reorderable || isFirst} onClick={() => onMove(-1)} aria-label="Move chapter earlier" title={moveHint || "Move earlier"}>←</button>
          <button type="button" disabled={busy || !reorderable || isLast} onClick={() => onMove(1)} aria-label="Move chapter later" title={moveHint || "Move later"}>→</button>
        </span>
      </div>
    </div>
  </article>;
}

export default function WorkspaceDashboard({ user, onOpenEditor, onSignOut }) {
  const [themeMode, setThemeMode] = useState(() => getInitialThemeMode());
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const isDarkTheme = themeMode === "dark" || (themeMode === "system" && systemDark);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event?.key && event.key !== THEME_PREFERENCE_KEY) return;
      setThemeMode(getInitialThemeMode());
    };
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const syncSystem = () => setSystemDark(Boolean(media?.matches));
    window.addEventListener("storage", syncTheme);
    media?.addEventListener?.("change", syncSystem);
    syncSystem();
    return () => {
      window.removeEventListener("storage", syncTheme);
      media?.removeEventListener?.("change", syncSystem);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sketchiziTheme = isDarkTheme ? "dark" : "light";
    return () => { delete document.documentElement.dataset.sketchiziTheme; };
  }, [isDarkTheme]);

  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [diagrams, setDiagrams] = useState([]);
  const [limits, setLimits] = useState({ diagramCount: 0, diagramLimit: 3, admin: false });
  const [loading, setLoading] = useState(true);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [projectName, setProjectName] = useState("");
  const [diagramName, setDiagramName] = useState("");
  const [projectForm, setProjectForm] = useState(false);
  const [diagramForm, setDiagramForm] = useState(false);
  const [chapterLayout, setChapterLayout] = useState({ order: [], status: {} });
  const [viewMode, setViewMode] = useState(() => { try { return globalThis.localStorage?.getItem(VIEW_MODE_KEY) === "grid" ? "grid" : "flow"; } catch { return "flow"; } });
  const [gridSort, setGridSort] = useState("sequence");
  const [renamingId, setRenamingId] = useState("");
  const renamingRef = useRef("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dragId, setDragId] = useState("");
  const [dragOverId, setDragOverId] = useState("");
  const [sizeById, setSizeById] = useState(() => readSizeCache());
  const [projectSizes, setProjectSizes] = useState({});
  const [downloadingId, setDownloadingId] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);
  const showToast = useCallback((message) => { setToast(message); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(""), 3500); }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const chapters = useMemo(() => resolveChapterSequence(diagrams, chapterLayout), [diagrams, chapterLayout]);
  const lastOpened = useMemo(() => findLastOpenedItem(chapters), [chapters]);
  const completedCount = countCompletedChapters(chapters);
  const displayChapters = useMemo(() => viewMode === "grid" ? sortWorkspaceDiagrams(chapters, gridSort, (d) => sizeById[d.id] ?? getDiagramBytes(d)) : chapters, [chapters, viewMode, gridSort, sizeById]);
  const atDiagramLimit = !limits.admin && limits.diagramCount >= (limits.diagramLimit ?? 3);
  const nextChapterLabel = String(chapters.length + 1).padStart(2, "0");
  const bytesFor = useCallback((d) => sizeById[d.id] ?? getDiagramBytes(d), [sizeById]);
  const activeBytes = useMemo(() => sumBytes(chapters.map(bytesFor)), [chapters, bytesFor]);
  const active = projects.find((p) => p.id === activeId) || null;
  const projectBytes = (p) => { const own = Number(p.sizeBytes); return p.id === activeId && activeBytes !== null ? activeBytes : Number.isFinite(own) ? own : projectSizes[p.id] ?? null; };
  const totalBytes = projects.length && projects.every((p) => projectBytes(p) !== null) ? sumBytes(projects.map(projectBytes)) : (projects.length ? null : 0);
  const filtered = useMemo(() => projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);

  const reloadProjects = useCallback(async (preferred) => {
    setLoading(true); setError("");
    try {
      const result = await workspaceClient.listProjects();
      const rows = Array.isArray(result) ? result : result?.projects || [];
      writeWorkspaceCache({ projects: rows.filter((row) => row?.id) });
      setProjects(sortWorkspaceRecentlyUsed(mergeWorkspaceActivity(rows)));
      setActiveId((current) => rows.some((p) => p.id === preferred) ? preferred : rows.some((p) => p.id === current) ? current : rows[0]?.id || "");
    } catch (e) { setError(e.message || "Could not load cloud projects."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!projects.length) return undefined;
    let cancelled = false;
    (async () => {
      for (const project of projects) {
        if (cancelled || typeof project.sizeBytes === "number" || project.id === activeId) continue;
        try {
          const rows = readDiagramRows(await workspaceClient.listDiagrams(project.id));
          const total = rows.length ? sumBytes(rows.map((row) => getDiagramBytes(row, readSizeCache()))) : 0;
          if (!cancelled && total !== null) setProjectSizes((current) => (current[project.id] === total ? current : { ...current, [project.id]: total }));
        } catch { /* sizes are informational */ }
      }
    })();
    return () => { cancelled = true; };
  }, [projects, activeId]);
  useEffect(() => {
    reloadProjects();
    workspaceClient.getLimits().then(setLimits).catch(() => {});
  }, [reloadProjects]);
  // Resolve the locked chapter order and remember it, so later renames, saves or
  // opens can never re-sort a project's sequence.
  const applyDiagramRows = useCallback((projectId, rows) => {
    const merged = mergeWorkspaceActivity(rows);
    const layout = buildChapterLayout(resolveChapterSequence(merged, readChapterLayout(projectId)));
    writeChapterLayout(projectId, layout);
    setChapterLayout(layout);
    setDiagrams(merged);
    const measured = {};
    const cache = readSizeCache();
    merged.forEach((row) => { const b = getDiagramBytes(row, cache); if (b !== null) measured[row.id] = b; });
    writeSizeCache(measured);
    setSizeById((current) => ({ ...current, ...measured }));
    const total = sumBytes(merged.map((row) => measured[row.id]));
    if (merged.length === 0 || total !== null) setProjectSizes((current) => ({ ...current, [projectId]: total ?? 0 }));
  }, []);
  const refreshDiagrams = useCallback(async (projectId) => {
    applyDiagramRows(projectId, readDiagramRows(await workspaceClient.listDiagrams(projectId)));
  }, [applyDiagramRows]);
  useEffect(() => {
    setDiagramForm(false); setRenamingId(""); renamingRef.current = ""; setDeleteTarget(null);
    if (!activeId) { setDiagrams([]); return undefined; }
    let cancelled = false;
    setDiagramLoading(true);
    workspaceClient.listDiagrams(activeId).then((r) => { if (!cancelled) applyDiagramRows(activeId, readDiagramRows(r)); })
      .catch((e) => { if (!cancelled) setError(e.message || "Could not load diagrams."); })
      .finally(() => { if (!cancelled) setDiagramLoading(false); });
    return () => { cancelled = true; };
  }, [activeId, applyDiagramRows]);

  const createProject = async (event) => {
    event.preventDefault(); if (!projectName.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { const p = await workspaceClient.createProject({ name: projectName.trim(), description: "" }); setProjectName(""); setProjectForm(false); await reloadProjects(p.id); setNotice("Project created and saved to your cloud workspace."); }
    catch (e) { setError(e.message || "Could not create project."); } finally { setBusy(false); }
  };
  const renameProject = async (p) => {
    const name = window.prompt("Project name", p.name); if (name === null || !name.trim() || name.trim() === p.name) return;
    setBusy(true); setError("");
    try { await workspaceClient.updateProject(p.id, { name: name.trim(), description: p.description || "" }); await reloadProjects(p.id); setNotice("Project renamed."); }
    catch (e) { setError(e.message || "Could not rename project."); } finally { setBusy(false); }
  };
  const deleteProject = async (p) => {
    if (!window.confirm(`Delete "${p.name}" and all its diagrams? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await workspaceClient.deleteProject(p.id); await reloadProjects(); setNotice("Project deleted."); }
    catch (e) { setError(e.message || "Could not delete project."); } finally { setBusy(false); }
  };
    const changeViewMode = (mode) => { setViewMode(mode); try { globalThis.localStorage?.setItem(VIEW_MODE_KEY, mode); } catch { /* preference only */ } };

  // Persist a new chapter arrangement: UI + local layout first, then a best-effort
  // metadata PATCH for only the chapters whose position or status changed.
  const commitChapters = async (next, before) => {
    const layout = buildChapterLayout(next);
    writeChapterLayout(activeId, layout);
    setChapterLayout(layout);
    setDiagrams(next);
    const changes = getChapterChanges(before, next);
    await Promise.allSettled(changes.map((change) => workspaceClient.updateDiagramChapter(change.id, change)));
  };
  const reorderTo = (fromId, toId) => { const next = reorderChapters(chapters, fromId, toId); if (next !== chapters) commitChapters(next, chapters); };
  const shiftChapter = (id, delta) => { const next = moveChapter(chapters, id, delta); if (next !== chapters) commitChapters(next, chapters); };
  const cycleStatus = (d) => commitChapters(setChapterStatus(chapters, d.id, cycleChapterStatus(d.chapterStatus)), chapters);

  const openChapterForm = () => {
    if (diagramForm) { setDiagramForm(false); return; }
    setDiagramName(suggestNextChapterName(chapters));
    setDiagramForm(true);
  };
  const openDiagram = async (d) => {
    const usedAt = new Date().toISOString();
    recordWorkspaceItemOpened(d.id, usedAt);
    setBusy(true);
    try { await workspaceClient.updateDiagram(d.id, { lastOpenedAt: usedAt }).catch(() => {}); }
    finally { window.location.assign(`/?editor=1&cloudDiagramId=${encodeURIComponent(d.id)}&cloudProjectId=${encodeURIComponent(activeId)}`); }
  };

  const startRename = (d) => { renamingRef.current = d.id; setRenamingId(d.id); };
  const cancelRename = () => { renamingRef.current = ""; setRenamingId(""); };
  const commitRename = async (d, rawValue) => {
    if (renamingRef.current !== d.id) return;
    renamingRef.current = ""; setRenamingId("");
    const name = String(rawValue ?? "").trim();
    if (!name || name === d.name) return;
    setBusy(true); setError("");
    try {
      const currentDiagrams = readDiagramRows(await workspaceClient.listDiagrams(activeId));
      if (findDuplicateDiagramName(currentDiagrams, name, d.id)) { setError("A diagram with this name already exists in this project. Choose a different name."); return; }
      await workspaceClient.updateDiagram(d.id, { name, projectId: activeId });
      setDiagrams((rows) => rows.map((row) => row.id === d.id ? { ...row, name } : row));
      setNotice("Chapter renamed.");
    } catch (e) { setError(e.message || "Could not rename chapter."); } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    const target = deleteTarget; if (!target || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await workspaceClient.deleteDiagram(target.id);
      setDeleteTarget(null);
      const before = chapters;
      const next = removeChapter(before, target.id);
      setProjects((rows) => rows.map((p) => p.id === activeId ? { ...p, diagramCount: next.length } : p));
      workspaceClient.getLimits().then(setLimits).catch(() => {});
      await commitChapters(next, before);
      setNotice(next.length ? `"${target.name}" deleted. Remaining chapters were renumbered CH 01–${formatChapterLabel(next.length).slice(3)}.` : `"${target.name}" deleted.`);
    } catch (e) { setError(e.message || "Could not delete chapter."); } finally { setBusy(false); }
  };
  const duplicateDiagram = async (d) => {
    setBusy(true); setError("");
    try {
      await workspaceClient.duplicateDiagram(d.id);
      await refreshDiagrams(activeId);
      workspaceClient.getLimits().then(setLimits).catch(() => {});
      setNotice("Chapter duplicated and added to the end of the sequence.");
    } catch (e) { setError(e.message || "Could not duplicate chapter."); } finally { setBusy(false); }
  };
  const downloadDiagram = async (d) => {
    if (downloadingId) return;
    setDownloadingId(d.id); setError("");
    try {
      const { document, name } = await loadFullDocument(d, workspaceClient.getDiagram);
      const title = name || d.name;
      const payload = buildDownloadPayload({ ...d, name: title }, document);
      const exact = computeDocumentBytes(document);
      triggerJsonDownload(downloadFilename(title), payload);
      if (exact !== null) { writeSizeCache({ [d.id]: exact }); setSizeById((current) => ({ ...current, [d.id]: exact })); }
      showToast(`Downloaded ${downloadFilename(title)} (${formatBytes(exact ?? bytesFor(d))})`);
    } catch (e) { setError(e.message || "Could not download this diagram."); }
    finally { setDownloadingId(""); }
  };
  useEffect(() => {
    if (!deleteTarget) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) setDeleteTarget(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, busy]);

  const createDiagram = async (event) => {
    event.preventDefault(); if (!active || !diagramName.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const currentDiagramsResult = await workspaceClient.listDiagrams(active.id);
      const currentDiagrams = readDiagramRows(currentDiagramsResult);
      if (findDuplicateDiagramName(currentDiagrams, diagramName.trim())) {
        setError("A diagram with this name already exists in this project. Choose a different name.");
        return;
      }
      const currentLimits = await workspaceClient.getLimits();
      setLimits(currentLimits);
      if (!currentLimits.admin && currentLimits.diagramCount >= currentLimits.diagramLimit) {
        setError("You can save up to 3 diagrams in Cloud Workspace. Delete a diagram before creating another.");
        return;
      }
      const createdResult = await workspaceClient.createDiagram({ projectId: active.id, name: diagramName.trim(), format: "excalidraw", document: { elements: [], appState: {}, files: {}, metadata: {}, extensions: {} } });
      const created = createdResult?.diagram || createdResult;
      setDiagramName(""); setDiagramForm(false);
      workspaceClient.getLimits().then(setLimits).catch(() => {});
      if (created?.id) {
        // Append to the END of the sequence; the new chapter never displaces an existing one.
        const next = appendChapter(chapters, { ...created, name: created.name || diagramName.trim(), chapterStatus: "up-next" });
        writeChapterLayout(active.id, buildChapterLayout(next));
        recordWorkspaceItemOpened(created.id);
        const appended = next[next.length - 1];
        await Promise.race([
          workspaceClient.updateDiagramChapter(created.id, appended).catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
        window.location.assign(`/?editor=1&cloudDiagramId=${encodeURIComponent(created.id)}&cloudProjectId=${encodeURIComponent(active.id)}`);
        return;
      }
      await refreshDiagrams(active.id);
      await reloadProjects(active.id); setNotice("Chapter created. Open it to begin editing.");
    } catch (e) { setError(e.message || "Could not create chapter."); } finally { setBusy(false); }
  };

  const cardProps = (d, index, list, variant) => {
    const reorderable = variant === "flow" || gridSort === "sequence";
    return {
      d, variant, busy, reorderable, bytes: bytesFor(d), downloading: downloadingId === d.id, onDownload: () => downloadDiagram(d),
      isFirst: index === 0, isLast: index === list.length - 1,
      isLastOpened: lastOpened?.id === d.id,
      renaming: renamingId === d.id,
      dragging: dragId === d.id, dragOver: dragOverId === d.id && dragId !== d.id,
      onOpen: () => openDiagram(d),
      onStartRename: () => startRename(d),
      onCommitRename: (value) => commitRename(d, value),
      onCancelRename: cancelRename,
      onDelete: () => setDeleteTarget(d),
      onDuplicate: () => duplicateDiagram(d),
      onMove: (delta) => shiftChapter(d.id, delta),
      onCycleStatus: () => cycleStatus(d),
      dragProps: reorderable ? {
        draggable: !busy && renamingId !== d.id,
        onDragStart: (event) => { setDragId(d.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", d.id); },
        onDragOver: (event) => { if (dragId && dragId !== d.id) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dragOverId !== d.id) setDragOverId(d.id); } },
        onDrop: (event) => { event.preventDefault(); const from = dragId; setDragId(""); setDragOverId(""); if (from && from !== d.id) reorderTo(from, d.id); },
        onDragEnd: () => { setDragId(""); setDragOverId(""); },
      } : {},
    };
  };

  const sequenceControls = <div className="cw-chapter-controls">
    <div className="cw-segmented" role="group" aria-label="Chapter view">
      <button type="button" className={viewMode === "flow" ? "is-selected" : ""} aria-pressed={viewMode === "flow"} onClick={() => changeViewMode("flow")}>Sequence Flow</button>
      <button type="button" className={viewMode === "grid" ? "is-selected" : ""} aria-pressed={viewMode === "grid"} onClick={() => changeViewMode("grid")}>Grid</button>
    </div>
    {viewMode === "grid" && <label className="cw-sort"><span>Sort</span><select aria-label="Sort chapters" value={gridSort} onChange={(e) => setGridSort(e.target.value)}>{Object.entries(WORKSPACE_GRID_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    <span className="cw-progress-badge" aria-label={`${completedCount} of ${chapters.length} chapters completed`}>{completedCount}/{chapters.length} Chapters Completed</span>
    {lastOpened && chapters.length > 1 && <button type="button" className="cw-button cw-quiet" disabled={busy} onClick={() => openDiagram(lastOpened)}>Resume Last Opened ({formatChapterLabel(lastOpened.chapterNumber)})</button>}
  </div>;

  return <main className="cloud-workspace" data-theme={isDarkTheme ? "dark" : "light"}>
    <header className="cw-header"><a className="cw-brand" href="/" aria-label="Sketchizi"><span className="cw-brand-mark">S</span> Sketchizi <span className="cw-brand-sub">CLOUD WORKSPACE</span></a><div className="cw-header-actions"><span className="cw-user">{user?.name || user?.email || "Signed in"}</span><button className="cw-button cw-quiet" onClick={onOpenEditor}>Open editor</button><button className="cw-button cw-quiet" onClick={onSignOut}>Sign out</button></div></header>
    <section className="cw-content"><div className="cw-eyebrow">YOUR WORKSPACE</div><div className="cw-title-row"><div><h1>Cloud Workspace</h1><p>Your projects and diagrams, saved to your account.</p><p className="cw-quota">{limits.admin ? `${limits.diagramCount} ${limits.diagramCount === 1 ? "diagram" : "diagrams"}${totalBytes !== null ? ` · ${formatBytes(totalBytes)} total used` : ""} · Admin account (unlimited)` : `${limits.diagramCount} of ${limits.diagramLimit ?? 3} cloud diagrams used${totalBytes !== null ? ` · ${formatBytes(totalBytes)} total used` : ""}`}</p></div><button className="cw-button cw-primary" onClick={() => setProjectForm(!projectForm)}>+ New project</button></div>
      {error && <div className="cw-message cw-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}{notice && <div className="cw-message cw-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
      {projectForm && <form className="cw-form" onSubmit={createProject}><label htmlFor="cw-project-name">Project name</label><input id="cw-project-name" autoFocus maxLength={120} required value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. E-commerce architecture"/><div className="cw-form-actions"><button type="button" className="cw-button cw-quiet" onClick={() => setProjectForm(false)}>Cancel</button><button className="cw-button cw-primary" disabled={busy}>{busy ? "Creating…" : "Create project"}</button></div></form>}
      <div className="cw-toolbar"><strong>PROJECTS <span>{projects.length}</span></strong><input aria-label="Search projects" className="cw-search" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
      {loading ? <div className="cw-loading">Loading your workspace…</div> : projects.length === 0 ? <div className="cw-empty"><div className="cw-empty-icon">▦</div><h2>Your workspace starts here</h2><p>Create a project to keep your architecture diagrams together. Projects are private to your account.</p><button className="cw-button cw-primary" onClick={() => setProjectForm(true)}>Create your first project</button></div> : <div className="cw-layout">
        <aside className="cw-project-list" aria-label="Projects">{filtered.map((p) => <article className={p.id === activeId ? "cw-project is-active" : "cw-project"} key={p.id}><button className="cw-project-select" onClick={() => setActiveId(p.id)}><span className="cw-project-icon">▦</span><span><b>{p.name}</b><small>{p.diagramCount ?? 0} {(p.diagramCount ?? 0) === 1 ? "diagram" : "diagrams"} · {projectBytes(p) !== null ? `${formatBytes(projectBytes(p))} · ` : ""}{dateLabel(p.lastOpenedAt || p.lastUsedAt || p.updatedAt || p.createdAt)}</small></span></button><div className="cw-project-actions"><button disabled={busy} onClick={() => renameProject(p)}>Rename</button><button disabled={busy} onClick={() => deleteProject(p)}>Delete</button></div></article>)}{!filtered.length && <p className="cw-muted">No matching projects.</p>}</aside>
        <section className="cw-diagrams">{active ? <><div className="cw-diagram-heading"><div><div className="cw-eyebrow">PROJECT</div><h2>{active.name}</h2><p>{active.description || "Chapters in this project"}</p></div><button className="cw-button cw-primary" disabled={busy || atDiagramLimit} title={atDiagramLimit ? "Delete a diagram to create another" : undefined} onClick={openChapterForm}>+ Add Next Chapter</button></div>
          {chapters.length > 0 && sequenceControls}
          {diagramForm && <form className="cw-form" onSubmit={createDiagram}><label htmlFor="cw-diagram-name">Chapter name</label><input id="cw-diagram-name" ref={(el) => { if (el && !el.dataset.caretSet) { el.dataset.caretSet = "1"; el.setSelectionRange(el.value.length, el.value.length); } }} autoFocus maxLength={120} required value={diagramName} onChange={(e) => setDiagramName(e.target.value)} placeholder="e.g. day-06-systemdesign-deployment"/><div className="cw-form-actions"><button type="button" className="cw-button cw-quiet" onClick={() => setDiagramForm(false)}>Cancel</button><button className="cw-button cw-primary" disabled={busy}>{busy ? "Creating…" : "Create chapter"}</button></div></form>}
          {diagramLoading ? <div className="cw-loading">Loading chapters…</div> : chapters.length ? (viewMode === "flow"
            ? <div className="cw-flow" role="list" aria-label="Chapter sequence flow">
                {displayChapters.map((d, index, list) => <Fragment key={d.id}>{index > 0 && <span className="cw-flow-connector" aria-hidden="true">→</span>}<ChapterCard {...cardProps(d, index, list, "flow")} /></Fragment>)}
                <span className="cw-flow-connector" aria-hidden="true">→</span>
                <button type="button" className="cw-chapter-add-card" disabled={busy || atDiagramLimit} title={atDiagramLimit ? "Delete a diagram to create another" : undefined} onClick={openChapterForm}><span>+ Chapter {nextChapterLabel}</span><small>Adds to the end of the sequence</small></button>
              </div>
            : <div className="cw-diagram-grid">{displayChapters.map((d, index, list) => <ChapterCard key={d.id} {...cardProps(d, index, list, "grid")} />)}</div>)
            : <div className="cw-empty cw-empty-small"><div className="cw-empty-icon">◇</div><h3>No chapters yet</h3><p>Create your first chapter to start building this project.</p><button className="cw-button cw-quiet" onClick={openChapterForm}>Create first chapter</button></div>}
        </> : <div className="cw-empty cw-empty-small"><h3>Select a project</h3></div>}</section></div>}
      {toast && <div className="cw-toast" role="status" aria-live="polite">{toast}</div>}
      <footer className="cw-footnote"><span/> Cloud storage · PostgreSQL · Private to your account</footer>
    </section>
    {deleteTarget && <div className="cw-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDeleteTarget(null); }}>
      <div className="cw-modal" role="alertdialog" aria-modal="true" aria-labelledby="cw-delete-title" aria-describedby="cw-delete-desc">
        <h2 id="cw-delete-title">Delete {formatChapterLabel(chapters.find((c) => c.id === deleteTarget.id)?.chapterNumber ?? 0)}?</h2>
        <p id="cw-delete-desc"><b>{deleteTarget.name}</b> will be permanently deleted. The remaining chapters will be renumbered so the sequence has no gaps. This cannot be undone.</p>
        <div className="cw-form-actions"><button type="button" autoFocus className="cw-button cw-quiet" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="cw-button cw-danger" disabled={busy} onClick={confirmDelete}>{busy ? "Deleting…" : "Delete chapter"}</button></div>
      </div>
    </div>}
  </main>;
}
