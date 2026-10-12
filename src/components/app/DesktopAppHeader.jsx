import { useEffect, useMemo, useRef, useState } from "react";
import ThemeControl from "../../ThemeControl.jsx";
import AuthenticationControl from "../../features/auth/AuthenticationControl.jsx";

const MENU_DEFINITIONS = [
  {
    label: "File",
    ids: ["files.new", "files.open", "files.save", "files.save-as", "files.open-folder", "files.close-folder"],
  },
  {
    label: "Edit",
    nativeActions: [
      { label: "Undo", keys: /undo/i },
      { label: "Redo", keys: /redo/i },
    ],
  },
  {
    label: "View",
    ids: [
      "view.zoom-in",
      "view.zoom-out",
      "view.reset-zoom",
      "view.fit-canvas",
      "view.toggle-minimap",
      "view.toggle-theme",
      "view.toggle-grid",
    ],
  },
  {
    label: "Help",
    ids: ["application.shortcuts", "application.excalidraw-command-palette"],
  },
];


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
  children,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const nativeMenuOpenLatestRef = useRef(nativeMenuOpen);
  const menuWasOpenOnPointerDownRef = useRef(null);
  nativeMenuOpenLatestRef.current = nativeMenuOpen;

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

  const commandMap = useMemo(() => new Map(commands.map((command) => [command.id, command])), [commands]);

  const executeCommand = (command) => {
    if (!canRun(command)) return;
    setOpenMenu(null);
    command.execute?.();
  };

  return (
    <header className="desktop-app-header">
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
                <span className="desktop-app-nav-chevron" aria-hidden="true">⌄</span>
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
                  {commandsForMenu.map((command) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={command.id}
                      onClick={() => executeCommand(command)}
                    >
                      <span>{command.label}</span>
                      {command.shortcut && <kbd>{command.shortcut}</kbd>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

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
          title="Search commands (Ctrl+K)"
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
