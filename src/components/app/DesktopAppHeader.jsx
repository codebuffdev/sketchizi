import { useEffect, useMemo, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import CanvasPages from "../../features/pages/CanvasPages.jsx";
import CanvasTabs from "./CanvasTabs.jsx";
import CanvasStartDate from "./CanvasStartDate.jsx";
import ThemeControl from "../../ThemeControl.jsx";
import CanvasZoomControl from "./CanvasZoomControl.jsx";
import AuthenticationControl from "../../features/auth/AuthenticationControl.jsx";
import WorkspaceQuickPopover from "./WorkspaceQuickPopover.jsx";
import { getCanvasBrowserTitle } from "../../features/files/documentTitle.js";
import { getCommandPaletteShortcut } from "../../features/commands/platformShortcut.js";
import { BROWSER_DRAFT_LABEL } from "../../features/workspace/tabCloudState.js";
import { formatChapterShortLabel } from "../../features/workspace/chapterSequence.js";

const MENU_DEFINITIONS = [
  {
    label: "View",
    ids: [
      "view.zoom-in",
      "view.zoom-out",
      "view.reset-zoom",
      "view.fit-canvas",
      "view.toggle-minimap",
      "view.toggle-theme",
    ],
  },
];


const VIEW_COMMAND_ICONS = {
  "view.zoom-in": "plus",
  "view.zoom-out": "minus",
  "view.reset-zoom": "reset",
  "view.fit-canvas": "fit",
  "view.toggle-minimap": "map",
  "view.toggle-theme": "theme",
};
function ViewCommandIcon({ name }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <path d="M5 12h14" />,
    reset: <><path d="M4 11a8 8 0 1 1 2.3 5.7" /><path d="M4 4v7h7" /></>,
    fit: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /><path d="M8 8h8v8H8z" /></>,
    map: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m9 4 0 16M15 4v16" /></>,
    theme: <><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    snap: <><path d="M5 5h5v5H5zM14 14h5v5h-5z" /><path d="M10 7h4v4M7 10v4h4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  };
  return <span className="desktop-app-dropdown-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.fit}</svg></span>;
}

function CanvasActionIcon({ name }) {
  const paths = {
    save: <><path d="M5 3h12l4 4v14H3V3h2Z" /><path d="M7 3v6h10V3M7 21v-7h10v7" /></>,
    cloud: <><path d="M7 18H6a4 4 0 1 1 .8-7.9A6 6 0 0 1 18.5 9 4.5 4.5 0 0 1 18 18h-1" /><path d="m9 14 3-3 3 3M12 11v9" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    backup: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 19h16" /><path d="M5 6a9 9 0 0 1 14 0" /></>,
    export: <><path d="M14 3h7v7M10 14 21 3" /><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></>,
  };
  return <span className="canvas-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.save}</svg></span>;
}

const CANVAS_VIEW_OPTIONS = [
  ["infinite", "Infinite canvas", "Freeform boundless space"],
  ["pages", "Pages", "Fixed, named page frames"],
];
const CANVAS_PATTERN_OPTIONS = [
  ["normal", "Grid", "Uniform grid"],
  ["focus", "Focus Grid", "Dense center"],
  ["local", "Local Focus", "Around content"],
  ["dots", "Dot Grid", "Dotted drafting"],
  ["ruled", "Ruled Paper", "Writing guides"],
];

function PatternThumb({ kind }) {
  const lines = (step, from = 0, to = 54) => {
    const out = [];
    for (let p = from; p <= to; p += step) out.push(p);
    return out;
  };
  let body = null;
  if (kind === "normal") {
    body = lines(9).map((p) => <path key={p} d={`M${p} 0V54M0 ${p}H54`} />);
  } else if (kind === "focus") {
    body = (
      <>
        <g opacity=".35">{lines(9).map((p) => <path key={p} d={`M${p} 0V54M0 ${p}H54`} />)}</g>
        <g>{lines(6, 12, 42).map((p) => <path key={p} d={`M${p} 12V42M12 ${p}H42`} />)}</g>
      </>
    );
  } else if (kind === "local") {
    body = (
      <>
        <g opacity=".3">{lines(9).map((p) => <path key={p} d={`M${p} 0V54M0 ${p}H54`} />)}</g>
        <rect x="16" y="19" width="22" height="16" rx="3" className="csp-thumb-accent" />
        <g>{lines(4, 12, 42).map((p) => <path key={p} d={`M${p} 14V40M10 ${p + 4}H44`} />)}</g>
      </>
    );
  } else if (kind === "dots") {
    body = lines(9, 4.5, 49.5).flatMap((x) => lines(9, 4.5, 49.5).map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" className="csp-thumb-dot" />));
  } else {
    body = (
      <>
        {lines(9, 11, 47).map((p) => <path key={p} d={`M0 ${p}H54`} />)}
        <path d="M10 0V54" className="csp-thumb-margin" />
      </>
    );
  }
  return (
    <svg className="csp-thumb" viewBox="0 0 54 54" width="54" height="54" aria-hidden="true" focusable="false">
      <rect width="54" height="54" className="csp-thumb-bg" />
      <g className="csp-thumb-lines" fill="none" strokeWidth="1">{body}</g>
    </svg>
  );
}

function CheckBadge({ size }) {
  return (
    <span className="csp-check" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 12 12" width={size - 5} height={size - 5} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2.6 6.4 2.2 2.2 4.6-5" /></svg>
    </span>
  );
}

function canRun(command) {
  if (!command) return false;
  try {
    return command.available?.() !== false;
  } catch {
    return false;
  }
}

function runNativeEditAction(pattern) {
  const buttons = [...document.querySelectorAll("button, [role='button']")];
  const button = buttons.find((candidate) => {
    const label = [
      candidate.getAttribute("aria-label"),
      candidate.getAttribute("title"),
      candidate.textContent,
    ].filter(Boolean).join(" ");
    return pattern.test(label) && candidate.offsetParent !== null;
  });
  if (button instanceof HTMLElement) {
    button.click();
    return true;
  }
  return false;
}

export default function DesktopAppHeader({
  commands,
  gridEnabled = false,
  gridStyle = "focus",
  canvasAppearance = "clean",
  onCanvasAppearanceChange,
  onToggleGrid,
  canvasMode = "infinite",
  spellcheckEnabled = false,
  onToggleSpellcheck,
  onGridStyleChange,
  openCommandPalette,
  onOpenFullWorkspace,
  onOpenWorkspaceDiagram,
  onCreateWorkspaceChapter,
  isAuthenticated,
  authUser = null,
  onOpenSignIn,
  onOpenLocalDrafts,
  workspaceProjects = null,
  activeCloudProjectId = "",
  activeCloudDiagramId = "",
  onBeforeOpenPanel,
  startCollaboration,
  collaborationActive,
  collaborationCreationState = "idle",
  collaborationCreationError = "",
  nativeMenuOpen = false,
  toggleNativeMenu,
  createCollaboration,
  dismissCollaborationCreationFailure,
  libraryToggle,
  moreToolsToggle,
  setThemeMode,
  themeMode,
  canvasApi,
  aiAskOpen = false,
  onPageContextChange,
  onWorkspaceModeChange,
  onDeleteOnlyPage,
  workspaceMode = "infinite",
  canEditCanvas,
  isDarkTheme,
  saveStatus = { state: "ready", lastSavedAt: null },
  currentDocumentName = "Untitled drawing",
  currentDocumentDirty = false,
  canvasTabs = [],
  activeCanvasId,
  canvasId,
  canvasStartDate,
  canvasOriginalDate,
  canvasActivity = [],
  onCanvasActivityChange,
  onCanvasStartDateChange,
  canvasDateDisabled = false,
  onSelectCanvasTab,
  onCreateCanvasTab,
  onReorderCanvasTabs,
  onTogglePinCanvasTab,
  tabSwitcher = null,
  onCloseCanvasTab,
  closedTabs = [],
  onReopenClosedTab,
  onDeleteClosedTab,
  onClearClosedTabs,
  onCloseTodoTab,
  onRenameDocument,
  currentDocumentFileBacked = false,
  onSaveNow,
  onSaveToFile,
  onSaveAs,
  onSaveToCloud,
  isCloudDocument = false,
  cloudSaveState = "inactive",
  chapterNav = null,
  onNavigateChapter,
  onDownloadRecoveryBackup,
  onOpenExportStudio,
  onOpenTemplates,
  onToggleMinimap,
  minimapOpen = false,
  isZenMode = false,
  children,
}) {
  const paletteShortcut = useMemo(() => getCommandPaletteShortcut(), []);
  const [openMenu, setOpenMenu] = useState(null);
  const [gridPopoverOpen, setGridPopoverOpen] = useState(false);
  const gridPopoverRef = useRef(null);
  useEffect(() => {
    if (!gridPopoverOpen) return undefined;
    const closeOutside = (event) => {
      if (!gridPopoverRef.current?.contains(event.target)) setGridPopoverOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setGridPopoverOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeEscape, true);
    };
  }, [gridPopoverOpen]);
  // Keep the popover mounted briefly after closing so the asymmetric exit can play.
  const [gridPopoverMounted, setGridPopoverMounted] = useState(false);
  const [gridPopoverClosing, setGridPopoverClosing] = useState(false);
  useEffect(() => {
    if (gridPopoverOpen) {
      setGridPopoverMounted(true);
      setGridPopoverClosing(false);
      return undefined;
    }
    if (!gridPopoverMounted) return undefined;
    setGridPopoverClosing(true);
    const timer = window.setTimeout(() => { setGridPopoverMounted(false); setGridPopoverClosing(false); }, 140);
    return () => window.clearTimeout(timer);
  }, [gridPopoverOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Snap to grid" is Excalidraw's native grid mode; read it when the popover opens.
  const [snapToGrid, setSnapToGrid] = useState(false);
  useEffect(() => {
    if (!gridPopoverOpen) return;
    try { setSnapToGrid(Boolean(canvasApi?.getAppState?.()?.gridModeEnabled)); } catch { /* Canvas not ready. */ }
  }, [gridPopoverOpen, canvasApi]);
  const toggleSnapToGrid = () => {
    const next = !snapToGrid;
    setSnapToGrid(next);
    try { canvasApi?.updateScene?.({ appState: { gridModeEnabled: next }, captureUpdate: CaptureUpdateAction.NEVER }); } catch { /* Canvas not ready. */ }
  };
  const [availableWidth, setAvailableWidth] = useState(0);
  // The legacy header rail is no longer the default top-right UI; it stays
  // hidden (but mounted) on desktop and tablet and opens from the settings popover.
  const [headerVisible, setHeaderVisible] = useState(() =>
    typeof window === "undefined" || !window.matchMedia("(min-width: 521px)").matches
  );
  const [headerPinned, setHeaderPinned] = useState(false);
  const headerRef = useRef(null);
  const headerCollapseTimerRef = useRef(null);
  const revealPointerEnteredFromCollapsedRef = useRef(false);
  const clearHeaderCollapseTimer = () => {
    if (headerCollapseTimerRef.current !== null) {
      window.clearTimeout(headerCollapseTimerRef.current);
      headerCollapseTimerRef.current = null;
    }
  };
  const scheduleHeaderCollapse = () => {
    clearHeaderCollapseTimer();
    headerCollapseTimerRef.current = window.setTimeout(() => {
      headerCollapseTimerRef.current = null;
      if (!headerPinned) setHeaderVisible(false);
    }, 5000);
  };
  useEffect(() => () => clearHeaderCollapseTimer(), []);
  const [saveDetailsOpen, setSaveDetailsOpen] = useState(false);
  const [documentNameEditing, setDocumentNameEditing] = useState(false);
  const [isWorkspacePopoverOpen, setIsWorkspacePopoverOpen] = useState(false);
  const workspaceButtonRef = useRef(null);
  const activeWorkspaceTab = canvasTabs.find((tab) => tab.id === activeCanvasId);
  const activeIsTodoTab = Boolean(activeWorkspaceTab?.isTodoTab);
  const activeIsSystemDesignTab = activeWorkspaceTab?.type === "system-design";
  const activeCanvasTabName = activeWorkspaceTab?.name || currentDocumentName;
  const [documentNameDraft, setDocumentNameDraft] = useState(activeCanvasTabName);
  const cancelDocumentRenameRef = useRef(false);
  const documentNameInputRef = useRef(null);
  useEffect(() => {
    if (!documentNameEditing) return;
    documentNameInputRef.current?.focus();
    documentNameInputRef.current?.select();
  }, [documentNameEditing]);

  useEffect(() => {
    if (!aiAskOpen) return;
    // AI Ask is an independent right-side drawer. Opening it must not
    // implicitly dismiss the left-side hamburger/navigation menu.
    setGridPopoverOpen(false);
    setSaveDetailsOpen(false);
  }, [aiAskOpen]);

  useEffect(() => {
    document.title = getCanvasBrowserTitle(activeCanvasTabName);
    setSaveDetailsOpen(false);
  }, [activeCanvasTabName]);

  useEffect(() => {
    if (!documentNameEditing) setDocumentNameDraft(activeCanvasTabName);
  }, [activeCanvasTabName, documentNameEditing]);

  useEffect(() => {
    setSaveDetailsOpen(false);
    setDocumentNameEditing(false);
  }, [activeCanvasId]);
  const nativeMenuOpenLatestRef = useRef(nativeMenuOpen);
  const menuWasOpenOnPointerDownRef = useRef(null);
  nativeMenuOpenLatestRef.current = nativeMenuOpen;

  useEffect(() => {
    // The canvas-first header is for desktop and tablet layouts. Phone
    // controls retain their existing layout and interaction model.
    if (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        !window.matchMedia("(min-width: 521px)").matches) {
      return undefined;
    }

    const collapseOnCanvasInteraction = (event) => {
      if (headerPinned || !(event.target instanceof Element)) return;
      if (event.target.closest(".desktop-canvas-region")) {
        setHeaderVisible(false);
      }
    };

    // Each floating control has its own reveal zone on desktop:
    // title group = immediately to the right of the top-left menu, account = top right,
    // control rail = right edge. Tablet retains the previous top-edge reveal.
    // Canvas wheel gestures remain dedicated to zooming and navigation.
    const revealFromEdge = (event) => {
      // The rail opens only from the settings popover (or Ctrl+Shift+H).
      void event;
    };

    const toggleHeaderShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey ||
          event.key.toLowerCase() !== "h") return;

      const target = event.target;
      if (target instanceof Element && target.closest(
        "input, textarea, select, [contenteditable='true'], .monaco-editor, .cm-editor"
      )) return;

      event.preventDefault();
      event.stopPropagation();
      setHeaderVisible((visible) => !visible);
    };

    document.addEventListener("pointerdown", collapseOnCanvasInteraction, true);
    document.addEventListener("pointermove", revealFromEdge, { passive: true });
    document.addEventListener("keydown", toggleHeaderShortcut, true);

    return () => {
      document.removeEventListener("pointerdown", collapseOnCanvasInteraction, true);
      document.removeEventListener("pointermove", revealFromEdge, { passive: true });
      document.removeEventListener("keydown", toggleHeaderShortcut, true);
    };
  }, [headerPinned]);

  useEffect(() => {
    const header = headerRef.current;
    const container = header?.parentElement;
    if (!container || typeof ResizeObserver === "undefined") return undefined;

    // Observe the containing layout, not the header's own intrinsic width.
    // A flex header can overflow while reporting its oversized content width,
    // preventing the compact state from ever activating.
    const updateWidth = () => {
      // A parent can report a width larger than the visible app viewport when
      // a descendant has a legacy min-width. Clamp to the visible layout width
      // so split-window layouts still activate the constrained header.
      const containerWidth = container.getBoundingClientRect().width;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const width = Math.round(Math.min(containerWidth, viewportWidth));
      setAvailableWidth((current) => current === width ? current : width);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    // Window capture runs before document-level outside-click handlers inside
    // Excalidraw, preserving the menu's state from before the user's click.
    const captureMenuState = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".desktop-app-menu-trigger")) {
        menuWasOpenOnPointerDownRef.current = nativeMenuOpenLatestRef.current;
      } else {
        menuWasOpenOnPointerDownRef.current = null;
      }
    };
    window.addEventListener("pointerdown", captureMenuState, true);
    return () => window.removeEventListener("pointerdown", captureMenuState, true);
  }, []);

  useEffect(() => {
    const onCommandSearchShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      event.stopPropagation();
      setOpenMenu(null);
      openCommandPalette?.();
    };
    document.addEventListener("keydown", onCommandSearchShortcut, true);
    return () => document.removeEventListener("keydown", onCommandSearchShortcut, true);
  }, [openCommandPalette]);

  useEffect(() => {
    if (!openMenu) return undefined;
    const close = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".desktop-app-nav")) return;
      setOpenMenu(null);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!saveDetailsOpen) return undefined;
    const close = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".desktop-app-save-status-wrap")) return;
      setSaveDetailsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setSaveDetailsOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [saveDetailsOpen]);

  const commandMap = useMemo(() => new Map(commands.map((command) => [command.id, command])), [commands]);

  const commitDocumentRename = async () => {
    if (cancelDocumentRenameRef.current) {
      cancelDocumentRenameRef.current = false;
      setDocumentNameDraft(activeCanvasTabName);
      return;
    }
    const nextName = documentNameDraft.trim();
    setDocumentNameEditing(false);
    if (!nextName || nextName === activeCanvasTabName) {
      setDocumentNameDraft(activeCanvasTabName);
      return;
    }
    try {
      await onRenameDocument?.(nextName);
    } catch {
      setDocumentNameDraft(activeCanvasTabName);
    }
  };

  const executeCommand = (command) => {
    if (!canRun(command)) return;
    setOpenMenu(null);
    command.execute?.();
  };

  const saveState = saveStatus?.state || "ready";
  const saveStateLabels = {
    restoring: "Restoring…",
    ready: "Autosave ready",
    pending: "Unsaved changes",
    saving: "Saving…",
    saved: "Autosaved in this browser",
    error: "Save issue",
  };
  const saveStateLabel = saveStateLabels[saveState] || "Local save status";
  const cloudStatusLabels = {
    loading: "Loading from Cloud Workspace",
    pending: "Cloud changes pending",
    saving: "Saving to Cloud Workspace",
    saved: "Saved to Cloud Workspace",
    error: "Cloud save failed",
    conflict: "Cloud save conflict",
  };
  const storageLocation = isCloudDocument ? "Cloud" : currentDocumentFileBacked ? "File" : "Browser";
  const documentStatusLabel = isCloudDocument
    ? (cloudStatusLabels[cloudSaveState] || "Cloud Workspace")
    : currentDocumentFileBacked
      ? (currentDocumentDirty ? "Changes not saved to file" : "Saved to disk")
      : BROWSER_DRAFT_LABEL;
  const lastSavedLabel = saveStatus?.lastSavedAt
    ? new Date(saveStatus.lastSavedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No successful local save yet";

  const activeTabRenameAction = documentNameEditing ? (
    <input ref={documentNameInputRef} className="desktop-app-document-identity-name-input canvas-tab-rename-input" aria-label="Canvas name" maxLength={120} value={documentNameDraft} onChange={(event) => setDocumentNameDraft(event.target.value)} onBlur={commitDocumentRename} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      else if (event.key === "Escape") { event.preventDefault(); cancelDocumentRenameRef.current = true; setDocumentNameDraft(activeCanvasTabName); setDocumentNameEditing(false); }
    }} />
  ) : (
    <button type="button" className="desktop-app-document-rename" aria-label="Rename canvas" title="Rename canvas" onClick={() => { cancelDocumentRenameRef.current = false; setDocumentNameDraft(activeCanvasTabName); setDocumentNameEditing(true); }}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16.1 4 20Z" /></svg>
    </button>
  );




  return (
    <>
      <CanvasPages api={canvasApi} workspaceMode={workspaceMode} canEdit={canEditCanvas} aiPanelOpen={aiAskOpen} onPageContextChange={onPageContextChange} onWorkspaceModeChange={onWorkspaceModeChange} bookTitle={activeCanvasTabName} onRenameBookTitle={onRenameDocument} onDeleteOnlyPage={onDeleteOnlyPage} />
      <button
        type="button"
        className={nativeMenuOpen ? "desktop-app-menu-trigger desktop-app-menu-trigger-floating active" : "desktop-app-menu-trigger desktop-app-menu-trigger-floating"}
        data-hamburger-trigger
        onClick={() => {
          const wasOpen = menuWasOpenOnPointerDownRef.current;
          menuWasOpenOnPointerDownRef.current = null;
          toggleNativeMenu?.(typeof wasOpen === "boolean" ? wasOpen : nativeMenuOpenLatestRef.current);
        }}
        aria-label={nativeMenuOpen ? "Close application menu" : "Open application menu"}
        aria-expanded={nativeMenuOpen}
        title={nativeMenuOpen ? "Close application menu" : "Open application menu"}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <header
        id="desktop-app-header"
        ref={headerRef}
        className={`desktop-app-header desktop-app-header-right-rail${availableWidth > 0 && availableWidth < 1120 ? " is-compact" : ""}${availableWidth > 0 && availableWidth < 900 ? " is-constrained" : ""}${headerVisible ? "" : " is-hidden"}${headerPinned ? " is-pinned" : ""}`}
        aria-hidden={!headerVisible}
        data-pinned={headerPinned}
        onPointerEnter={clearHeaderCollapseTimer}
        onPointerLeave={() => { if (!headerPinned) scheduleHeaderCollapse(); }}
      >
      <AuthenticationControl />
      <div className="desktop-app-header-island desktop-app-header-island-left">
      {libraryToggle}

      <nav className="desktop-app-nav" aria-label="Sketchizi application menu">
        {MENU_DEFINITIONS.map((menu) => {
          const commandsForMenu = (menu.ids || []).map((id) => commandMap.get(id)).filter(canRun);
          const hasItems = commandsForMenu.length > 0 || Boolean(menu.nativeActions?.length);
          if (!hasItems) return null;

          return (
            <div className="desktop-app-nav-item" key={menu.label}>
              <button
                type="button"
                className={openMenu === menu.label ? "desktop-app-nav-button desktop-app-nav-button-icon-only active" : "desktop-app-nav-button desktop-app-nav-button-icon-only"}
                aria-label={`${menu.label} options`}
                title={`${menu.label} options`}
                aria-haspopup="menu"
                aria-expanded={openMenu === menu.label}
                onClick={() => {
                  if (openMenu === menu.label) {
                    setOpenMenu(null);
                    return;
                  }
                  onBeforeOpenPanel?.();
                  setOpenMenu(menu.label);
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {openMenu === menu.label ? (
                    <>
                      <path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                      <circle cx="12" cy="12" r="2.8" />
                    </>
                  ) : (
                    <>
                      <path d="M3.5 13.5c2.2 3.1 5.1 4.7 8.5 4.7s6.3-1.6 8.5-4.7" strokeWidth="2.4" />
                      <path d="m6.5 16.5-1.2 2M12 18.2v2M17.5 16.5l1.2 2" strokeWidth="1.9" />
                      <path d="M16.5 3.5h4l-4 4h4" strokeWidth="1.8" />
                    </>
                  )}
                </svg>
              </button>

              {openMenu === menu.label && (
                <div className="desktop-app-dropdown" role="menu" aria-label={`${menu.label} menu`}>
                  {menu.nativeActions?.map((action) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={action.label}
                      onClick={() => {
                        runNativeEditAction(action.keys);
                        setOpenMenu(null);
                      }}
                    >
                      <span>{action.label}</span>
                    </button>
                  ))}
                  {menu.label === "View" && (
                    <button
                      type="button"
                      role="menuitem"
                      className="desktop-app-command-search-menuitem"
                      onClick={() => {
                        setOpenMenu(null);
                        openCommandPalette?.();
                      }}
                    >
                      <ViewCommandIcon name="search" />
                      <span className="desktop-app-dropdown-label">Search Commands</span>
                      <kbd>{paletteShortcut.secondaryLabel}</kbd>
                    </button>
                  )}
                  {commandsForMenu.map((command) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={command.id}
                      className="desktop-app-dropdown-command"
                      onClick={() => executeCommand(command)}
                    >
                      <ViewCommandIcon name={VIEW_COMMAND_ICONS[command.id] || "fit"} />
                      <span className="desktop-app-dropdown-label">{command.label}</span>
                      {command.shortcut && <kbd>{command.shortcut}</kbd>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        className={`desktop-app-header-visibility-button desktop-app-header-pin-button${headerPinned ? " is-active" : ""}`}
        onClick={() => {
          clearHeaderCollapseTimer();
          setHeaderPinned((pinned) => !pinned);
          setHeaderVisible(true);
        }}
        aria-label={headerPinned ? "Unpin application header" : "Pin application header"}
        aria-pressed={headerPinned}
        data-pin-state={headerPinned ? "pinned" : "auto-hide"}
        title={headerPinned
          ? "Pinned — header stays expanded"
          : "Unpinned — header auto-hides after 5 seconds"}
      >
        <svg
          className="desktop-app-header-pin-glyph"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 4h8l-1 6 3 3v2H6v-2l3-3-1-6Z" />
          <path d="M12 15v6" />
        </svg>
      </button>

      </div>
      <div className="desktop-app-header-island desktop-app-header-island-center" aria-label="Current workspace">
        {chapterNav && (
          <nav className="desktop-app-chapter-nav" aria-label="Chapter navigation">
            <button type="button" className="desktop-app-chapter-nav-button" disabled={!chapterNav.previous} onClick={() => onNavigateChapter?.(chapterNav.previous)} aria-label={chapterNav.previous ? `Previous chapter: ${chapterNav.previous.name}` : "No previous chapter"} title={chapterNav.previous?.name}>
              <span aria-hidden="true">←</span>
              <span className="desktop-app-chapter-nav-label">{chapterNav.previous ? formatChapterShortLabel(chapterNav.previous.chapterNumber) : "—"}</span>
            </button>
            <span className="desktop-app-chapter-nav-position" aria-live="polite">Chapter {chapterNav.index + 1} of {chapterNav.total}</span>
            <button type="button" className="desktop-app-chapter-nav-button" disabled={!chapterNav.next} onClick={() => onNavigateChapter?.(chapterNav.next)} aria-label={chapterNav.next ? `Next chapter: ${chapterNav.next.name}` : "No next chapter"} title={chapterNav.next?.name}>
              <span className="desktop-app-chapter-nav-label">{chapterNav.next ? formatChapterShortLabel(chapterNav.next.chapterNumber) : "—"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </nav>
        )}
      </div>
      <div className="desktop-app-header-island desktop-app-header-island-right">
      {collaborationCreationState === "creating" && (
        <div className="collaboration-header-status creating" role="status" aria-live="polite">
          <span className="collaboration-header-spinner" aria-hidden="true" />
          <span>Creating collaboration…</span>
        </div>
      )}
      {collaborationCreationState === "failed" && (
        <div className="collaboration-header-status failed" role="alert" aria-live="assertive">
          <div className="collaboration-header-status-copy">
            <strong>Collaboration failed</strong>
            <span title={collaborationCreationError || "Collaboration connection failed."}>{collaborationCreationError || "Couldn't create the collaboration. Check the collaboration server."}</span>
          </div>
          <button type="button" onClick={createCollaboration}>Try again</button>
          <button type="button" className="secondary" onClick={dismissCollaborationCreationFailure} aria-label="Dismiss collaboration failure">×</button>
        </div>
      )}




      {!collaborationActive && (
        <button
          type="button"
          className="desktop-app-start-collaboration-button"
          onClick={() => { setOpenMenu(null); startCollaboration?.(); }}
          disabled={collaborationCreationState === "creating"}
          aria-label={collaborationCreationState === "creating" ? "Creating collaboration" : "Collab"}
          title={collaborationCreationState === "creating" ? "Creating collaboration" : "Collab"}
        >
          <svg className="desktop-app-start-collaboration-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="desktop-app-start-collaboration-label">{collaborationCreationState === "creating" ? "Creating…" : "Collab"}</span>
        </button>
      )}

      <span className="desktop-app-header-action-divider" aria-hidden="true" />

      <div className="sketchizi-header-grid" ref={gridPopoverRef}>
        <button type="button" className={gridEnabled ? "sketchizi-header-grid-trigger is-active" : "sketchizi-header-grid-trigger"}
          aria-label="Canvas style" title="Canvas style" aria-haspopup="dialog" aria-expanded={gridPopoverOpen}
          onClick={() => {
            setOpenMenu(null);
            if (!gridPopoverOpen) onBeforeOpenPanel?.();
            setGridPopoverOpen(!gridPopoverOpen);
          }}>
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
          </svg>
        </button>
        {gridPopoverMounted && (
          <section className="sketchizi-header-grid-popover csp" data-state={gridPopoverClosing ? "closing" : "open"} role="dialog" aria-label="Canvas style">
            <div className="csp-header">
              <div className="csp-heading">
                <span className="csp-heading-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
                </span>
                <div className="csp-heading-copy"><strong>Canvas Style</strong><small>Choose how your canvas looks.</small></div>
              </div>
              <div className="csp-show">
                <span id="csp-show-label">Show pattern</span>
                <button type="button" role="switch" aria-checked={gridEnabled} aria-labelledby="csp-show-label" className={`csp-switch${gridEnabled ? " is-on" : ""}`} onClick={() => onToggleGrid?.()}><span /></button>
              </div>
            </div>

            <div className="csp-section" role="group" aria-label="Canvas view">
              <h4 className="csp-section-title">Canvas view</h4>
              <div className="csp-view-grid">
                {CANVAS_VIEW_OPTIONS.map(([value, label, description]) => {
                  const active = canvasMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`csp-card csp-view-card${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      aria-label={`${label}. ${description}`}
                      onClick={() => {
                        setGridPopoverOpen(false);
                        window.dispatchEvent(new CustomEvent("sketchizi:choose-canvas-mode", { detail: { mode: value } }));
                      }}
                    >
                      {active && <CheckBadge size={14} />}
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="csp-section" role="group" aria-label="Canvas patterns">
              <div className="csp-section-head">
                <h4 className="csp-section-title">Canvas patterns</h4>
                <button type="button" role="switch" aria-checked={snapToGrid} className={`csp-snap${snapToGrid ? " is-on" : ""}`} onClick={toggleSnapToGrid} title="Snap objects to the grid while drawing">
                  <span>Snap to grid</span><span className="csp-snap-dot" aria-hidden="true" />
                </button>
              </div>
              <div className={`csp-pattern-grid${gridEnabled ? "" : " is-dimmed"}`}>
                {CANVAS_PATTERN_OPTIONS.map(([value, label, description]) => {
                  const active = gridStyle === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`csp-card csp-pattern-card${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      aria-label={`${label}. ${description}`}
                      onClick={() => {
                        onGridStyleChange?.(value);
                        if (!gridEnabled) onToggleGrid?.();
                      }}
                    >
                      {active && <CheckBadge size={15} />}
                      <PatternThumb kind={value} />
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="csp-template-btn"
              onClick={() => {
                setGridPopoverOpen(false);
                setOpenMenu(null);
                onOpenTemplates?.();
              }}
            >
              <span className="csp-template-icon" aria-hidden="true">◇</span>
              <span className="csp-template-label">Browse templates</span>
              <span className="csp-template-arrow" aria-hidden="true">→</span>
            </button>
          </section>
        )}
      </div>


      <button
        type="button"
        role="switch"
        aria-checked={spellcheckEnabled}
        className={`desktop-app-spellcheck-toggle${spellcheckEnabled ? " is-on" : ""}`}
        onClick={() => onToggleSpellcheck?.()}
        aria-label={`Spellcheck ${spellcheckEnabled ? "On" : "Off"}`}
        title={`Native spellcheck: ${spellcheckEnabled ? "On" : "Off"} (click to toggle)`}
      >
        <span className="desktop-app-spellcheck-label">Spellcheck</span>
        <span className="desktop-app-spellcheck-state">{spellcheckEnabled ? "On" : "Off"}</span>
        <span className="desktop-app-spellcheck-switch" aria-hidden="true" />
      </button>

      <div className="desktop-app-header-spacer" />

      <div className="desktop-app-header-actions">
        
        {moreToolsToggle}
        <button
          type="button"
          className="desktop-app-header-icon-button desktop-app-search-button"
          onClick={() => { setOpenMenu(null); openCommandPalette?.(); }}
          aria-label="Search commands"
          title={`Search commands (${paletteShortcut.label} or ${paletteShortcut.secondaryLabel})`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.3" />
            <path d="m16 16 4.2 4.2" />
          </svg>
          <span className="desktop-app-search-label">Search…</span>
          <kbd className="desktop-app-search-shortcut">{paletteShortcut.label}</kbd>
        </button>

      </div>


    </div>
    </header>
      <div
        className={`desktop-app-document-identity desktop-app-document-title-float desktop-app-canvas-tabs-topbar${currentDocumentDirty ? " is-dirty" : ""}`}
        aria-label="Canvas tabs"
      >
        <CanvasTabs
          tabs={canvasTabs}
          activeId={activeCanvasId}
          onSelect={onSelectCanvasTab}
          onCreate={onCreateCanvasTab}
          closedTabs={closedTabs}
          onReopenClosedTab={onReopenClosedTab}
          onDeleteClosedTab={onDeleteClosedTab}
          onClearClosedTabs={onClearClosedTabs}
          onReorder={onReorderCanvasTabs}
          onTogglePin={onTogglePinCanvasTab}
          switcher={tabSwitcher}
          onClose={(tabId) => {
            const closingTab = canvasTabs.find((tab) => tab.id === tabId);
            if (closingTab?.isTodoTab) onCloseTodoTab?.(closingTab.canvasId);
            else onCloseCanvasTab?.(tabId);
          }}
          onRename={(tabId) => {
            const renamedTab = canvasTabs.find((tab) => tab.id === tabId);
            cancelDocumentRenameRef.current = false;
            setDocumentNameDraft(renamedTab?.name || activeCanvasTabName);
            setDocumentNameEditing(true);
          }}
          activeStatusClass={`is-${isCloudDocument ? cloudSaveState : currentDocumentFileBacked ? (currentDocumentDirty ? (saveState === "error" ? "error" : "pending") : "saved") : saveState === "error" ? "error" : "draft"}`}
          activeStatusLabel={documentStatusLabel}
          activeRenameAction={activeTabRenameAction}
          activeMenu={
            <div className="canvas-tabs-active-menu-content">
              <div className="canvas-tabs-active-menu-heading">
                <strong>{activeCanvasTabName}</strong>
                <span>{documentStatusLabel}</span>
              </div>
              <div className="canvas-tabs-active-menu-status">
                {isCloudDocument && <span className={`canvas-tab-status-dot is-${cloudSaveState}`} aria-label={cloudStatusLabels[cloudSaveState] || "Cloud Workspace"} />}
                {!isCloudDocument && !currentDocumentFileBacked && ["pending", "saving", "saved", "error"].includes(saveState) && (
                  <span
                    className={`desktop-app-document-identity-dirty-dot is-${saveState === "saved" ? "draft" : saveState}`}
                    aria-label={saveState === "saved" ? "Browser draft: autosaved in this browser, not saved to a file" : saveState === "error" ? "Local save failed" : saveState === "saving" ? "Saving locally" : "Local changes waiting to be saved"}
                    title={saveState === "saved" ? "Browser draft: autosaved in this browser, not saved to a file" : saveState === "error" ? "Local save failed" : saveState === "saving" ? "Saving locally" : "Local changes waiting to be saved"}
                  />
                )}
                <span className="desktop-app-document-location" aria-label="Storage location">{storageLocation}</span>
                <span>{isCloudDocument ? "Cloud Workspace" : currentDocumentFileBacked ? "Saved to disk" : "Browser draft"}</span>
                <span className="canvas-tabs-active-menu-status-detail">{isCloudDocument ? (cloudStatusLabels[cloudSaveState] || "Cloud Workspace") : currentDocumentFileBacked ? (currentDocumentDirty ? "Unsaved file changes" : "Saved to disk") : saveStateLabel}</span>
              </div>

              <section className="canvas-tabs-menu-section" aria-label="Save and sync">
                <h3>Save &amp; sync</h3>
                <div className="canvas-tabs-active-menu-actions">
                  <button type="button" className="canvas-tabs-active-menu-action-button" onClick={() => onSaveNow?.()} aria-label="Save locally">
                    <CanvasActionIcon name="save" />
                    <span className="canvas-tabs-active-menu-action-copy"><strong>Save locally</strong><small>Keep a copy on this device</small></span>
                    <span className={`canvas-tabs-action-state is-${saveState === "saved" ? "draft" : saveState}`}>{saveState === "saved" ? "Autosaved" : saveState === "saving" ? "Saving…" : saveState === "pending" ? "Unsaved" : saveState === "error" ? "Issue" : "Auto-save"}</span>
                  </button>
                  <button type="button" className="canvas-tabs-active-menu-action-button" onClick={() => onSaveToCloud?.()} disabled={cloudSaveState === "loading" || cloudSaveState === "saving"} aria-label="Save to Cloud Workspace">
                    <CanvasActionIcon name="cloud" />
                    <span className="canvas-tabs-active-menu-action-copy"><strong>Save to cloud</strong><small>Sync with your Cloud Workspace</small></span>
                    <span className={`canvas-tabs-action-state is-${cloudSaveState}`}>{cloudSaveState === "saved" ? "Saved" : cloudSaveState === "saving" ? "Saving…" : cloudSaveState === "pending" ? "Pending" : cloudSaveState === "error" ? "Issue" : cloudSaveState === "conflict" ? "Conflict" : "Cloud"}</span>
                  </button>
                </div>
              </section>

              <div className="canvas-tabs-recovery-note">
                <strong>Local save &amp; recovery</strong>
                <span>Sketchizi autosaves this canvas in this browser on this device.</span>
                <span>Local autosave is not a cloud backup.</span>
                <span>It is also not a saved file: save to a file or the cloud for a permanent copy. Closed tabs stay under Recently closed.</span>
              </div>

              <section className="canvas-tabs-menu-section" aria-label="Download and export">
                <h3>Download &amp; export</h3>
                <div className="canvas-tabs-active-menu-actions">
                  <button type="button" className="canvas-tabs-active-menu-action-button" onClick={() => { if (currentDocumentFileBacked) onSaveToFile?.(); else onSaveAs?.(); setSaveDetailsOpen(false); }} aria-label={currentDocumentFileBacked ? "Save" : "Save to file…"}>
                    <CanvasActionIcon name="save" />
                    <span className="canvas-tabs-active-menu-action-copy"><strong>{currentDocumentFileBacked ? "Save" : "Save to file…"}</strong><small>{currentDocumentFileBacked ? "Save changes to this file" : "Choose where to save this canvas"}</small></span>
                  </button>
                  {currentDocumentFileBacked && (
                    <button type="button" className="canvas-tabs-active-menu-action-button" onClick={() => onSaveAs?.()} aria-label="Save As">
                      <CanvasActionIcon name="download" />
                      <span className="canvas-tabs-active-menu-action-copy"><strong>Save As…</strong><small>Save a separate copy to another file</small></span>
                    </button>
                  )}
                  <button type="button" className="canvas-tabs-active-menu-action-button" onClick={() => onDownloadRecoveryBackup?.()} aria-label="Download recovery backup">
                    <CanvasActionIcon name="backup" />
                    <span className="canvas-tabs-active-menu-action-copy"><strong>Recovery backup</strong><small>Download a portable backup of this canvas</small></span>
                  </button>
                  <button type="button" className="canvas-tabs-active-menu-action-button" onClick={() => { setSaveDetailsOpen(false); onOpenExportStudio?.(); }} aria-label="Export studio">
                    <CanvasActionIcon name="export" />
                    <span className="canvas-tabs-active-menu-action-copy"><strong>Export studio...</strong><small>Choose PNG, SVG, clipboard and export settings</small></span>
                    <kbd className="canvas-tabs-export-shortcut-hint" aria-label="Control or Command plus Shift plus E">Ctrl+Shift+E</kbd>
                  </button>
                </div>
              </section>
            </div>
          }
          showAddButton
          newTabMode={activeIsSystemDesignTab ? "system-design" : canvasMode === "pages" ? "pages" : "canvas"}
        />
      </div>

      <div className="desktop-app-top-controls">
        {!activeIsTodoTab && canvasId && <CanvasStartDate key={canvasId} canvasId={canvasId} value={canvasStartDate} originalValue={canvasOriginalDate} activity={canvasActivity} onActivityChange={onCanvasActivityChange} onChange={onCanvasStartDateChange} disabled={canvasDateDisabled} />}
        {!activeIsTodoTab && canvasApi && (
          <CanvasZoomControl
            api={canvasApi}
            onReset={() => executeCommand(commandMap.get("view.reset-zoom"))}
          />
        )}
      <div className="desktop-app-global-theme-control">
        <ThemeControl setThemeMode={setThemeMode} themeMode={themeMode} isDarkTheme={isDarkTheme} canvasAppearance={canvasAppearance} onCanvasAppearanceChange={onCanvasAppearanceChange} api={canvasApi} canEdit={canEditCanvas} />
      </div>
      {/* Workspace quick switcher. Ctrl/Cmd+K still opens the command palette
          globally (useCommandPalette) and the menu keeps "Search Commands". */}
      <button
        ref={workspaceButtonRef}
        type="button"
        className={`desktop-app-workspace-button${isCloudDocument ? " is-synced" : ""}${isWorkspacePopoverOpen ? " is-open" : ""}`}
        onClick={() => { setOpenMenu(null); onBeforeOpenPanel?.(); setIsWorkspacePopoverOpen((open) => !open); }}
        aria-label="Open Cloud Workspace"
        aria-haspopup="dialog"
        aria-expanded={isWorkspacePopoverOpen}
        title={isCloudDocument ? "Cloud Workspace (Synced)" : "Cloud Workspace"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
        {isCloudDocument && <span className="desktop-app-workspace-button-dot" aria-hidden="true" />}
      </button>
      <WorkspaceQuickPopover
        open={isWorkspacePopoverOpen}
        anchorRef={workspaceButtonRef}
        isDark={Boolean(isDarkTheme)}
        activeProjectId={activeCloudProjectId}
        activeDiagramId={activeCloudDiagramId}
        onClose={() => setIsWorkspacePopoverOpen(false)}
        onOpenDiagram={onOpenWorkspaceDiagram}
        onCreateChapter={onCreateWorkspaceChapter}
        onOpenFullWorkspace={onOpenFullWorkspace}
        isAuthenticated={isAuthenticated}
        authUser={authUser}
        onOpenSignIn={onOpenSignIn}
        onOpenLocalDrafts={onOpenLocalDrafts}
        workspaceProjects={workspaceProjects}
      />
      <div className="desktop-app-global-ai-control">{children}</div>
      <div className="desktop-app-settings-wrap">
        <button
          type="button"
          className={`desktop-app-header-reveal-handle desktop-app-settings-toggle${headerVisible ? " is-expanded" : ""}`}
          onClick={() => {
            clearHeaderCollapseTimer();
            if (headerVisible) {
              // Closing always resets the pin so the rail cannot get stuck open.
              setHeaderPinned(false);
              setHeaderVisible(false);
            } else {
              setHeaderVisible(true);
            }
          }}
          aria-controls="desktop-app-header"
          aria-expanded={headerVisible}
          aria-label={headerVisible ? "Hide utility rail" : "Show utility rail"}
          title={headerVisible ? "Hide utility rail" : "Show utility rail"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 4v5M6 13v7M12 4v9M12 17v3M18 4v3M18 11v9" />
            <path d="M4 9h4M10 13h4M16 7h4" />
          </svg>
          <span className="sr-only">Utility rail</span>
        </button>
      </div>
      </div>
    </>
  );
}
