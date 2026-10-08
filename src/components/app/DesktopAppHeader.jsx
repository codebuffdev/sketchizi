import { useEffect, useMemo, useState } from "react";

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
    label: "Arrange",
    ids: ["layout.open"],
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
  setCollaborationOpen,
  startCollaboration,
  collaborationActive,
  libraryToggle,
  children,
}) {
  const [openMenu, setOpenMenu] = useState(null);

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

      {!collaborationActive && (
        <button
          type="button"
          className="desktop-app-start-collaboration-button"
          onClick={() => { setOpenMenu(null); startCollaboration?.(); }}
          aria-label="Start Collaboration"
        >
          Start Collaboration
        </button>
      )}

      <div className="desktop-app-header-spacer" />

      <div className="desktop-app-header-actions">
        <button
          type="button"
          className="desktop-app-header-icon-button"
          onClick={() => { setOpenMenu(null); openCommandPalette?.(); }}
          aria-label="Search commands"
          title="Search commands"
        >⌕</button>
        <button
          type="button"
          className="desktop-app-share-button"
          onClick={() => { setOpenMenu(null); setCollaborationOpen?.(true); }}
          aria-label="Share"
        >
          Share
        </button>
      </div>
    </header>
  );
}
