import { useEffect, useMemo, useRef, useState } from "react";
import CanvasPages from "../../features/pages/CanvasPages.jsx";
import ThemeControl from "../../ThemeControl.jsx";
import AuthenticationControl from "../../features/auth/AuthenticationControl.jsx";
import { getCanvasBrowserTitle } from "../../features/files/documentTitle.js";

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
  onGridStyleChange,
  openCommandPalette,
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
  workspaceToggle,
  moreToolsToggle,
  setThemeMode,
  themeMode,
  canvasApi,
  aiAskOpen = false,
  onPageContextChange,
  canEditCanvas,
  isDarkTheme,
  saveStatus = { state: "ready", lastSavedAt: null },
  currentDocumentName = "Untitled drawing",
  currentDocumentDirty = false,
  onRenameDocument,
  currentDocumentFileBacked = false,
  onSaveNow,
  onSaveToFile,
  onSaveAs,
  onSaveToCloud,
  isCloudDocument = false,
  cloudSaveState = "inactive",
  onDownloadRecoveryBackup,
  onOpenExport,
  onOpenTemplates,
  onToggleMinimap,
  minimapOpen = false,
  children,
}) {
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
  const [availableWidth, setAvailableWidth] = useState(0);
  const [headerVisible, setHeaderVisible] = useState(() =>
    typeof window === "undefined" || !window.matchMedia("(min-width: 1025px)").matches
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
  const [documentNameDraft, setDocumentNameDraft] = useState(currentDocumentName);
  const cancelDocumentRenameRef = useRef(false);

  useEffect(() => {
    if (!aiAskOpen) return;
    setOpenMenu(null);
    setGridPopoverOpen(false);
    setSaveDetailsOpen(false);
  }, [aiAskOpen]);

  useEffect(() => {
    document.title = getCanvasBrowserTitle(currentDocumentName);
  }, [currentDocumentName]);

  useEffect(() => {
    if (!documentNameEditing) setDocumentNameDraft(currentDocumentName);
  }, [currentDocumentName, documentNameEditing]);
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
      if (headerPinned || window.matchMedia("(min-width: 1025px)").matches || !(event.target instanceof Element)) return;
      if (event.target.closest(".desktop-canvas-region")) {
        setHeaderVisible(false);
      }
    };

    // Each floating control has its own reveal zone on desktop:
    // title group = immediately to the right of the top-left menu, account = top right,
    // control rail = right edge. Tablet retains the previous top-edge reveal.
    // Canvas wheel gestures remain dedicated to zooming and navigation.
    const revealFromEdge = (event) => {
      const rightRail = window.matchMedia("(min-width: 1025px)").matches;
      const nearTop = event.clientY <= 24;

      // Desktop rail is revealed by its dedicated top-right dropdown handle.
      // Keep the existing top-edge reveal behaviour on tablet layouts.
      if (!rightRail && nearTop) setHeaderVisible(true);
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
      setDocumentNameDraft(currentDocumentName);
      return;
    }
    const nextName = documentNameDraft.trim();
    setDocumentNameEditing(false);
    if (!nextName || nextName === currentDocumentName) {
      setDocumentNameDraft(currentDocumentName);
      return;
    }
    try {
      await onRenameDocument?.(nextName);
    } catch {
      setDocumentNameDraft(currentDocumentName);
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
    saved: "Saved locally",
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
  const storageLocation = isCloudDocument ? "Cloud" : currentDocumentFileBacked ? "File" : "Local";
  const documentStatusLabel = isCloudDocument
    ? (cloudStatusLabels[cloudSaveState] || "Cloud Workspace")
    : currentDocumentFileBacked
      ? (currentDocumentDirty ? "Changes not saved to file" : "Linked file")
      : `Local canvas. ${saveStateLabel}`;

  const lastSavedLabel = saveStatus?.lastSavedAt
    ? new Date(saveStatus.lastSavedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No successful local save yet";

  return (
    <>
      <CanvasPages api={canvasApi} canEdit={canEditCanvas} aiPanelOpen={aiAskOpen} onPageContextChange={onPageContextChange} />
      <button
        type="button"
        className={nativeMenuOpen ? "desktop-app-menu-trigger desktop-app-menu-trigger-floating active" : "desktop-app-menu-trigger desktop-app-menu-trigger-floating"}
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
                      <kbd>Ctrl+Shift+P</kbd>
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



      </div>
      <div className="desktop-app-header-island desktop-app-header-island-center" aria-label="Current workspace">
        {workspaceToggle}
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
        {gridPopoverOpen && (
          <section className="sketchizi-header-grid-popover" role="dialog" aria-label="Canvas style">
            <div className="sketchizi-header-grid-top">
              <div className="sketchizi-header-grid-heading">
                <ViewCommandIcon name="grid" />
                <div><strong>Canvas Style</strong><small>Choose how your canvas looks.</small></div>
              </div>
              <label className="sketchizi-header-grid-toggle">
                <span>Show pattern</span>
                <input type="checkbox" checked={gridEnabled} onChange={() => onToggleGrid?.()} />
                <span className="sketchizi-header-grid-switch" aria-hidden="true" />
              </label>
            </div>
            <div className="sketchizi-header-grid-modes" aria-label="Grid mode">
              <strong>Canvas patterns</strong>
              <div className="sketchizi-header-grid-options" role="group" aria-label="Grid mode">
                {[["normal", "Grid", "Uniform grid across the canvas."],
                  ["focus", "Focus Grid", "Dense central grid with soft edges."],
                  ["local", "Local Focus Grid", "Dense grid around drawing content."],
                  ["dots", "Dot Grid", "Subtle dotted drafting surface."],
                  ["ruled", "Ruled Paper", "Evenly spaced horizontal writing guides."]].map(([value, label, description]) => (
                  <button key={value} type="button" aria-pressed={gridStyle === value}
                    onClick={() => {
                      onGridStyleChange?.(value);
                      if (!gridEnabled) onToggleGrid?.();
                    }}>
                    <span className={`sketchizi-grid-preview is-${value}`} aria-hidden="true"><span /></span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                    {gridStyle === value && <span className="sketchizi-grid-selected-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>
            </div>
            <p className="sketchizi-header-grid-description">
              <span aria-hidden="true">ⓘ</span>
              {!gridEnabled ? "Choose a canvas style, then turn on Show pattern whenever you want it visible." :
                gridStyle === "dots" ? "Dot Grid uses a subtle, non-selectable dot pattern." :
                gridStyle === "ruled" ? "Ruled Paper adds evenly spaced horizontal guides." :
                gridStyle === "local" ? "Local Focus Grid concentrates detail around drawing content." :
                gridStyle === "focus" ? "Focus Grid emphasizes the central canvas area." :
                "Grid displays a uniform pattern across the canvas."}
            </p>
            <button
              type="button"
              className="sketchizi-header-grid-template-action"
              onClick={() => {
                setGridPopoverOpen(false);
                setOpenMenu(null);
                onOpenTemplates?.();
              }}
            >
              <span aria-hidden="true">◇</span>
              <span>Browse templates</span>
              <span aria-hidden="true">→</span>
            </button>
          </section>
        )}
      </div>


      <div className="desktop-app-header-spacer" />

      <div className="desktop-app-header-actions">
        <div className="desktop-app-header-account-zone">
          <ThemeControl setThemeMode={setThemeMode} themeMode={themeMode} isDarkTheme={isDarkTheme} canvasAppearance={canvasAppearance} onCanvasAppearanceChange={onCanvasAppearanceChange} api={canvasApi} canEdit={canEditCanvas} />
        </div>
        <div className="desktop-app-header-panel-actions">{children}</div>
        {moreToolsToggle}
        <button
          type="button"
          className="desktop-app-header-icon-button desktop-app-search-button"
          onClick={() => { setOpenMenu(null); openCommandPalette?.(); }}
          aria-label="Search commands"
          title="Search commands (Ctrl+Shift+P or Ctrl+K)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.3" />
            <path d="m16 16 4.2 4.2" />
          </svg>
          <span className="desktop-app-search-label">Search…</span>
          <kbd className="desktop-app-search-shortcut">Ctrl+K</kbd>
        </button>

      </div>

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
    </header>
      <div
        className={`desktop-app-document-identity desktop-app-document-title-float${currentDocumentDirty ? " is-dirty" : ""}`}
        title={`${currentDocumentName} — ${documentStatusLabel}`}
        aria-label={`Current document: ${currentDocumentName}. ${documentStatusLabel}.`}
      >
        <div className="desktop-app-save-status-wrap">
          <button
            type="button"
            className="desktop-app-save-status-trigger"
            aria-label="Download and save options"
            aria-haspopup="dialog"
            aria-expanded={saveDetailsOpen}
            title="Download and save options"
            onClick={() => {
              setOpenMenu(null);
              if (!saveDetailsOpen) onBeforeOpenPanel?.();
              setSaveDetailsOpen(!saveDetailsOpen);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M4 17v4h16v-4" />
            </svg>
          </button>
          {saveDetailsOpen && (
            <section className="desktop-app-save-status-popover" role="dialog" aria-label="Local save and recovery">
              <div className="desktop-app-save-status-heading">
                <strong>Local save &amp; recovery</strong>
                <span className={`desktop-app-save-status-summary is-${saveState}`}>{saveStateLabel}</span>
              </div>
              <p>Sketchizi autosaves this canvas in this browser on this device.</p>
              <div className="desktop-app-save-status-last-saved">
                <span>Last successful local save</span>
                <strong>{lastSavedLabel}</strong>
              </div>
              {saveStatus?.error && <p className="desktop-app-save-status-error" role="alert">{saveStatus.error}</p>}
              {saveStatus?.emergencySaved && <p className="desktop-app-save-status-recovery-note">An emergency browser backup is available. Download a portable recovery file as an extra safeguard.</p>}
              <div className="desktop-app-save-status-actions">
                <button
                  type="button"
                  className="desktop-app-save-locally-button"
                  onClick={() => { onSaveNow?.(); }}
                  aria-label="Save locally"
                  title="Save locally"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 18v3h14v-3" />
                  </svg>
                  <span className="sr-only">Save locally</span>
                </button>
                <button type="button" onClick={() => { onSaveToFile?.(); setSaveDetailsOpen(false); }}>{currentDocumentFileBacked ? "Save" : "Save to file…"}</button>
                {currentDocumentFileBacked && <button type="button" onClick={() => { onSaveAs?.(); setSaveDetailsOpen(false); }}>Save As…</button>}
                <button type="button" onClick={() => { onOpenExport?.(); setSaveDetailsOpen(false); }}>Export studio…</button>
                <button type="button" className="secondary" onClick={() => onDownloadRecoveryBackup?.()}>Download recovery backup</button>
              </div>
              <p className="desktop-app-save-status-footnote">Local autosave is not a cloud backup. Download a recovery file before clearing browser data or changing devices.</p>
            </section>
          )}
        </div>
        <svg className="desktop-app-document-identity-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
          <path d="m7 16.5 3.2-3.7 2.8 1.7 4-6" />
          <circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="17" cy="8.5" r="1" fill="currentColor" stroke="none" />
        </svg>
        <span className="desktop-app-document-identity-copy">
          {documentNameEditing ? (
            <input
              className="desktop-app-document-identity-name-input"
              aria-label="Canvas name"
              autoFocus
              maxLength={120}
              value={documentNameDraft}
              onChange={(event) => setDocumentNameDraft(event.target.value)}
              onBlur={commitDocumentRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelDocumentRenameRef.current = true;
                  setDocumentNameDraft(currentDocumentName);
                  setDocumentNameEditing(false);
                }
              }}
            />
          ) : (
            <span className="desktop-app-document-identity-name">{currentDocumentName}</span>
          )}
        </span>
        <span className="desktop-app-document-location" aria-label="Storage location">{storageLocation}</span>
        {!isCloudDocument && !currentDocumentFileBacked && ["pending", "saving", "saved", "error"].includes(saveState) && (
          <span
            className={`desktop-app-document-identity-dirty-dot is-${saveState}`}
            role="status"
            aria-label={saveState === "saved" ? "Saved locally on this device" : saveState === "error" ? "Local save failed" : saveState === "saving" ? "Saving locally" : "Local changes waiting to be saved"}
            title={saveState === "saved" ? "Saved locally on this device" : saveState === "error" ? "Local save failed" : saveState === "saving" ? "Saving locally" : "Local changes waiting to be saved"}
          />
        )}
        {!documentNameEditing && (
          <button
            type="button"
            className="desktop-app-document-rename"
            aria-label="Rename canvas"
            title="Rename canvas"
            onClick={() => { cancelDocumentRenameRef.current = false; setDocumentNameDraft(currentDocumentName); setDocumentNameEditing(true); }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m14 5 5 5M4 20l4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16.1 4 20Z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={`desktop-app-save-to-cloud-button is-icon-only${isCloudDocument ? ` is-cloud-${cloudSaveState}` : ""}`}
          onClick={() => { setOpenMenu(null); onSaveToCloud?.(); }}
          disabled={cloudSaveState === "loading" || cloudSaveState === "saving"}
          title={isCloudDocument
            ? cloudSaveState === "saved" ? "Saved to Cloud Workspace" : cloudSaveState === "pending" ? "Unsaved cloud changes" : cloudSaveState === "saving" ? "Saving to Cloud Workspace…" : cloudSaveState === "error" || cloudSaveState === "conflict" ? "Cloud save needs attention" : "Save the current diagram to Cloud Workspace now"
            : "Save this drawing to Cloud Workspace"}
          aria-label={isCloudDocument
            ? cloudSaveState === "saved" ? "Saved to Cloud Workspace" : cloudSaveState === "pending" ? "Unsaved changes — save to Cloud Workspace" : cloudSaveState === "saving" ? "Saving to Cloud Workspace" : cloudSaveState === "error" || cloudSaveState === "conflict" ? "Cloud save needs attention" : "Save current diagram to Cloud Workspace now"
            : "Save drawing to Cloud Workspace"}
        >
          <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" fillRule="evenodd" aria-hidden="true">
            <path d="M257 247 153 347 175 369 242 302 243 447 272 447 272 303 336 369 358 347Z M39 193 39 232 54 265 86 292 126 302 127 274 133 252 148 227 173 206 208 194 244 195 270 205 301 233 317 264 336 257 365 261 389 280 400 302 426 300 448 289 465 270 474 242 469 213 448 185 427 174 399 171 391 121 366 80 330 52 285 38 240 40 203 55 171 83 149 123 140 120 107 122 71 140 52 161Z" />
          </svg>
        </button>
      </div>


      <button
        type="button"
        className={`desktop-app-header-reveal-handle${headerVisible ? " is-expanded" : " is-visible"}`}
        onClick={() => {
          clearHeaderCollapseTimer();
          if (revealPointerEnteredFromCollapsedRef.current) {
            // Pointer hover already revealed a collapsed rail; let this first
            // click keep it open. Subsequent clicks toggle it normally.
            revealPointerEnteredFromCollapsedRef.current = false;
            setHeaderVisible(true);
            return;
          }
          setHeaderVisible((visible) => !visible);
        }}
        onPointerEnter={() => {
          revealPointerEnteredFromCollapsedRef.current = !headerVisible;
          clearHeaderCollapseTimer();
          setHeaderVisible(true);
        }}
        onPointerLeave={() => {
          revealPointerEnteredFromCollapsedRef.current = false;
          if (!headerPinned) scheduleHeaderCollapse();
        }}
        onFocus={() => { clearHeaderCollapseTimer(); setHeaderVisible(true); }}
        onBlur={() => { if (!headerPinned) scheduleHeaderCollapse(); }}
        aria-controls="desktop-app-header"
        aria-label="Show application header"
        title="Show header (Ctrl+Shift+H)"
        aria-expanded={headerVisible}
        tabIndex={0}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
          <path d="M8 4v4M15 10v4M11 16v4" />
          <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="11" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        <span className="sr-only">Show application header</span>
      </button>
    </>
  );
}
