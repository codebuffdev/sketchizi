import { useEffect, useMemo, useRef, useState } from "react";
import ThemeControl from "../../ThemeControl.jsx";
import AuthenticationControl from "../../features/auth/AuthenticationControl.jsx";

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
      "view.toggle-canvas-grid",
      "view.toggle-grid",
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
  "view.toggle-canvas-grid": "grid",
  "view.toggle-grid": "snap",
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
  openCommandPalette,
  startCollaboration,
  collaborationActive,
  collaborationCreationState = "idle",
  collaborationCreationError = "",
  nativeMenuOpen = false,
  toggleNativeMenu,
  createCollaboration,
  dismissCollaborationCreationFailure,
  libraryToggle,
  setThemeMode,
  isDarkTheme,
  saveStatus = { state: "ready", lastSavedAt: null },
  currentDocumentName = "Untitled drawing",
  currentDocumentDirty = false,
  currentDocumentFileBacked = false,
  onSaveNow,
  onSaveToFile,
  onSaveToCloud,
  isCloudDocument = false,
  cloudSaveState = "inactive",
  onDownloadRecoveryBackup,
  children,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const headerRef = useRef(null);
  const [saveDetailsOpen, setSaveDetailsOpen] = useState(false);
  const nativeMenuOpenLatestRef = useRef(nativeMenuOpen);
  const menuWasOpenOnPointerDownRef = useRef(null);
  nativeMenuOpenLatestRef.current = nativeMenuOpen;

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
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKeyDown, true);
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
      if (event.key === "Escape") setSaveDetailsOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [saveDetailsOpen]);

  const commandMap = useMemo(() => new Map(commands.map((command) => [command.id, command])), [commands]);

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
  const lastSavedLabel = saveStatus?.lastSavedAt
    ? new Date(saveStatus.lastSavedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No successful local save yet";

  return (
    <header ref={headerRef} className={`desktop-app-header${availableWidth > 0 && availableWidth < 1120 ? " is-compact" : ""}${availableWidth > 0 && availableWidth < 900 ? " is-constrained" : ""}`}>
      <button
        type="button"
        className={nativeMenuOpen ? "desktop-app-menu-trigger active" : "desktop-app-menu-trigger"}
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
                className={openMenu === menu.label ? "desktop-app-nav-button active" : "desktop-app-nav-button"}
                aria-haspopup="menu"
                aria-expanded={openMenu === menu.label}
                onClick={() => setOpenMenu((current) => current === menu.label ? null : menu.label)}
              >
                <span>{menu.label}</span>
                <svg className={`desktop-app-nav-chevron${openMenu === menu.label ? " is-open" : ""}`} viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6" /></svg>
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

      <div
        className={`desktop-app-document-identity${currentDocumentDirty ? " is-dirty" : ""}`}
        title={`${currentDocumentName}${currentDocumentFileBacked ? (currentDocumentDirty ? " — file changes not saved" : " — linked file") : ` — ${saveStateLabel.toLowerCase()}`}`}
        aria-label={`Current document: ${currentDocumentName}. ${currentDocumentFileBacked ? (currentDocumentDirty ? "Changes not saved to file." : "Linked file.") : ( "Local canvas. " + saveStateLabel + "." )}`}
      >
        <svg className="desktop-app-document-identity-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3.75h8l4 4v12.5H6z" />
          <path d="M14 3.75v4h4M9 12h6M9 15.5h6" />
        </svg>
        <span className="desktop-app-document-identity-copy">
          <span className="desktop-app-document-identity-name">{currentDocumentName}</span>
        </span>
        {currentDocumentDirty && <span className="desktop-app-document-identity-dirty-dot" aria-hidden="true" />}
      </div>

      <div className="desktop-app-header-panel-actions">{children}</div>

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

      <div className="desktop-app-header-account-zone">
        <ThemeControl setThemeMode={setThemeMode} isDarkTheme={isDarkTheme} />
        <AuthenticationControl />
      </div>

      <button
        type="button"
        className="desktop-app-save-to-cloud-button"
        onClick={() => { setOpenMenu(null); onSaveToCloud?.(); }}
        disabled={cloudSaveState === "loading" || cloudSaveState === "saving" || cloudSaveState === "pending"}
        title={isCloudDocument ? "Save the current diagram to Cloud Workspace now" : "Save this drawing to Cloud Workspace"}
        aria-label={isCloudDocument ? "Save current diagram to Cloud Workspace now" : "Save drawing to Cloud Workspace"}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 18.5h10.2a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 9a4.8 4.8 0 0 0 .8 9.5Z" />
          <path d="M12 12v7m-3-3 3 3 3-3" />
        </svg>
        <span>{isCloudDocument ? (cloudSaveState === "saving" || cloudSaveState === "pending" ? "Saving…" : "Save now") : "Save to Cloud"}</span>
      </button>

      <div className="desktop-app-save-status-wrap">
        <button
          type="button"
          className={`desktop-app-save-status-trigger is-${saveState}`}
          aria-label={`Local document save status: ${saveStateLabel}. Open save and recovery options.`}
          aria-haspopup="dialog"
          aria-expanded={saveDetailsOpen}
          title={`${saveStateLabel}. Click for save and recovery options.`}
          onClick={() => { setOpenMenu(null); setSaveDetailsOpen((open) => !open); }}
        >
          <span className="desktop-app-save-status-dot" aria-hidden="true" />
          <span className="desktop-app-save-status-label" role="status" aria-live="polite">{saveStateLabel}</span>
          <span className="desktop-app-save-status-chevron" aria-hidden="true">⌄</span>
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
              <button type="button" onClick={() => { onSaveNow?.(); }}>Save locally</button>
              <button type="button" onClick={() => { onSaveToFile?.(); setSaveDetailsOpen(false); }}>{currentDocumentFileBacked ? "Save to same file" : "Save to file…"}</button>
              <button type="button" className="secondary" onClick={() => onDownloadRecoveryBackup?.()}>Download recovery backup</button>
            </div>
            <p className="desktop-app-save-status-footnote">Local autosave is not a cloud backup. Download a recovery file before clearing browser data or changing devices.</p>
          </section>
        )}
      </div>

      {!collaborationActive && (
        <button
          type="button"
          className="desktop-app-start-collaboration-button"
          onClick={() => { setOpenMenu(null); startCollaboration?.(); }}
          disabled={collaborationCreationState === "creating"}
          aria-label={collaborationCreationState === "creating" ? "Creating Collaboration" : "Start Collaboration"}
          title={collaborationCreationState === "creating" ? "Creating collaboration" : "Start collaboration"}
        >
          <svg className="desktop-app-start-collaboration-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="desktop-app-start-collaboration-label">{collaborationCreationState === "creating" ? "Creating…" : "Start Collaboration"}</span>
        </button>
      )}

      <div className="desktop-app-header-spacer" />

      <div className="desktop-app-header-actions">
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
    </header>
  );
}
