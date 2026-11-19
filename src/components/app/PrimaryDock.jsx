import React, { useEffect, useRef, useState } from "react";

const ICONS = {
  selection: <><path d="m5 3 14 11-6 .8-2.6 5.2L5 3Z" /><path d="m12 15 3.5 4" /></>,
  hand: <><path d="M8 12V5a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6c0 4-2.5 6-6 6h-2c-2 0-3.5-1-4.5-2.5L4 14a1.7 1.7 0 0 1 2.5-2.2L8 13" /></>,
  rectangle: <rect x="4" y="5" width="16" height="14" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="7" />,
  diamond: <path d="m12 3 9 9-9 9-9-9 9-9Z" />,
  arrow: <><path d="M4 19 19 4" /><path d="M9 4h10v10" /></>,
  line: <path d="M4 20 20 4" />,
  freedraw: <path d="M4 17c2-8 4-10 6-7s3 8 5 5 3-7 5-7" />,
  text: <><path d="M4 6V4h16v2" /><path d="M12 4v16" /><path d="M8 20h8" /></>,
  image: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m5 17 5-5 3 3 2-2 4 4" /></>,
  frame: <><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 2" /><path d="M8 4v3M16 4v3M8 17v3M16 17v3M4 8h3M4 16h3M17 8h3M17 16h3" /></>,
  laser: <><path d="m5 19 8-8" /><path d="m12 5 1-2m4 4 2-1m-1 5 2 1" /><circle cx="16" cy="8" r="2" /></>,
  eraser: <><path d="m7 16 8-10a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-8 9H9l-5-5a2 2 0 0 1 0-3l3-4" /><path d="m11 20 8 0" /></>,
  bucketfill: <><path d="M4 13.5 13.5 4 20 10.5 10.5 20 4 13.5Z" /><path d="m9 8.5 6.5 6.5M17 16c0 2 1 3 2 3s2-1 2-3" /></>,
  autoshape: <><path d="M3 16c2-7 5-9 7-6" /><path d="M11 12h3m-2-2 2 2-2 2" /><rect x="16" y="6" width="5" height="12" rx="1" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></>,
  grip: <><circle cx="9" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none"/></> ,
};

const GROUPS = [
  [{ id: "selection", label: "Select", shortcut: "V" }, { id: "hand", label: "Hand", shortcut: "H" }],
  [{ id: "rectangle", label: "Rectangle", shortcut: "R" }, { id: "ellipse", label: "Ellipse", shortcut: "O" }, { id: "diamond", label: "Diamond", shortcut: "D" }],
  [{ id: "arrow", label: "Arrow", shortcut: "A" }, { id: "line", label: "Line", shortcut: "L" }],
  [{ id: "freedraw", label: "Draw", shortcut: "P" }, { id: "text", label: "Text", shortcut: "T" }],
  [{ id: "image", label: "Image", shortcut: "I" }, { id: "frame", label: "Frame", shortcut: "F" }],
  [{ id: "eraser", label: "Eraser", shortcut: "E" }, { id: "laser", label: "Laser pointer", shortcut: "K" }],
  [{ id: "bucketfill", label: "Bucket Fill", shortcut: "B", custom: true }, { id: "autoshape", label: "Draw to Shape", shortcut: "⇧X", custom: true }],
];

function ToolIcon({ name }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

function activateTool({ id, root, apiRef }) {
  if (id === "image") {
    const imageButton = root?.querySelector('[data-testid="toolbar-image"], button[aria-label*="image" i]');
    if (imageButton instanceof HTMLElement) imageButton.click();
    else apiRef.current?.setActiveTool?.({ type: "image" });
    return;
  }
  if (id === "bucketfill" || id === "autoshape") {
    window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: id } }));
    return;
  }
  apiRef.current?.setActiveTool?.({ type: id });
}

export default function PrimaryDock({ rootRef, apiRef, canEdit = true, isDarkTheme = false, canvasRevision = 0 }) {
  const [activeTool, setActiveTool] = useState(() => apiRef.current?.getAppState?.()?.activeTool?.type || "selection");
  const [dockLocked, setDockLocked] = useState(true);
  const [position, setPosition] = useState({ left: 12, top: null });
  const dragRef = useRef(null);

  useEffect(() => {
    const nextTool = apiRef.current?.getAppState?.()?.activeTool?.type;
    if (nextTool) setActiveTool(nextTool);
  }, [apiRef, canvasRevision]);

  useEffect(() => {
    const syncLock = (event) => {
      if (typeof event.detail?.locked === "boolean") setDockLocked(event.detail.locked);
    };
    const toggleLockFromMenu = () => setDockLocked((locked) => !locked);
    const syncCustomTool = (event) => {
      const tool = String(event.detail?.tool || "").toLowerCase();
      if (["bucketfill", "autoshape"].includes(tool)) setActiveTool(tool);
    };
    window.addEventListener("sketchizi:dock-lock-state", syncLock);
    window.addEventListener("sketchizi:toggle-dock-lock", toggleLockFromMenu);
    window.addEventListener("sketchizi:activate-tool", syncCustomTool);
    window.dispatchEvent(new CustomEvent("sketchizi:dock-lock-state", { detail: { locked: true } }));
    return () => {
      window.removeEventListener("sketchizi:dock-lock-state", syncLock);
      window.removeEventListener("sketchizi:toggle-dock-lock", toggleLockFromMenu);
      window.removeEventListener("sketchizi:activate-tool", syncCustomTool);
    };
  }, []);

  useEffect(() => {
    const onMove = (event) => {
      if (!dragRef.current) return;
      const { offsetX, offsetY } = dragRef.current;
      const width = 48;
      const height = document.querySelector(".sketchizi-primary-dock")?.offsetHeight || 400;
      setPosition({
        left: Math.max(4, Math.min(window.innerWidth - width - 4, event.clientX - offsetX)),
        top: Math.max(4, Math.min(window.innerHeight - height - 4, event.clientY - offsetY)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const toggleLock = () => setDockLocked((locked) => {
    const next = !locked;
    window.dispatchEvent(new CustomEvent("sketchizi:dock-lock-state", { detail: { locked: next } }));
    return next;
  });

  return (
    <nav
      className={`sketchizi-primary-dock${isDarkTheme ? " is-dark" : ""}${dockLocked ? " is-locked" : " is-unlocked"}`}
      aria-label="Primary drawing tools"
      data-canvas-revision={canvasRevision}
      style={{ left: position.left, top: position.top === null ? "50%" : position.top, transform: position.top === null ? "translateY(-50%)" : "none" }}
    >
      <button
        type="button"
        className="sketchizi-primary-dock-grip"
        aria-label={dockLocked ? "Dock locked. Unlock to move" : "Move dock"}
        title={dockLocked ? "Unlock dock to move" : "Drag to move dock"}
        disabled={dockLocked || !canEdit}
        onPointerDown={(event) => {
          if (dockLocked || event.button !== 0) return;
          const rect = event.currentTarget.closest("nav").getBoundingClientRect();
          dragRef.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
          event.preventDefault();
        }}
      >
        <ToolIcon name="grip" />
      </button>
      {GROUPS.map((group, groupIndex) => (
        <React.Fragment key={groupIndex}>
          {groupIndex > 0 && <span className="sketchizi-primary-dock-divider" aria-hidden="true" />}
          <div className="sketchizi-primary-dock-group">
            {group.map(({ id, label, shortcut }) => {
              const selected = activeTool === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`sketchizi-primary-dock-tool${selected ? " is-active" : ""}`}
                  aria-label={label}
                  aria-pressed={selected}
                  title={`${label} · ${shortcut}`}
                  disabled={!canEdit}
                  onClick={() => { activateTool({ id, root: rootRef.current, apiRef }); setActiveTool(id); }}
                >
                  <ToolIcon name={id} />
                  <span className="sketchizi-primary-dock-shortcut" aria-hidden="true">{shortcut}</span>
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      <span className="sketchizi-primary-dock-divider" aria-hidden="true" />
      <button
        type="button"
        className={`sketchizi-primary-dock-tool sketchizi-primary-dock-lock${dockLocked ? " is-active" : ""}`}
        aria-label={dockLocked ? "Unlock dock" : "Lock dock"}
        aria-pressed={dockLocked}
        title={dockLocked ? "Unlock dock" : "Lock dock"}
        disabled={!canEdit}
        onClick={toggleLock}
      >
        <ToolIcon name={dockLocked ? "lock" : "unlock"} />
      </button>
    </nav>
  );
}
