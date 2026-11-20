import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TodoList from "./TodoList.jsx";

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
};

const GROUPS = [
  [{ id: "selection", label: "Select" }, { id: "hand", label: "Hand" }],
  [{ id: "rectangle", label: "Rectangle" }, { id: "ellipse", label: "Ellipse" }, { id: "diamond", label: "Diamond" }],
  [{ id: "arrow", label: "Arrow" }, { id: "line", label: "Line" }],
  [{ id: "freedraw", label: "Draw" }, { id: "text", label: "Text" }],
  [{ id: "image", label: "Image" }, { id: "frame", label: "Frame" }],
  [{ id: "eraser", label: "Eraser" }, { id: "laser", label: "Laser pointer" }],
  [{ id: "bucketfill", label: "Bucket Fill" }, { id: "autoshape", label: "Draw to Shape", custom: true }],
];

function ToolIcon({ name }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

function activateTool({ id, root, apiRef }) {
  if (id === "image") {
    const imageButton = root?.querySelector('.excalidraw [data-testid="toolbar-image"], .excalidraw button[aria-label*="image" i]');
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

export default function PrimaryDock({ rootRef, apiRef, canEdit = true, isDarkTheme = false, canvasRevision = 0, menuOpen = false, todoItems = [], onTodoItemsChange }) {
  const [activeTool, setActiveTool] = useState(() => apiRef.current?.getAppState?.()?.activeTool?.type || "selection");
  const [customTool, setCustomTool] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  useEffect(() => { if (!menuOpen) setPaletteOpen(false); }, [menuOpen]);
  useEffect(() => {
    const nextTool = apiRef.current?.getAppState?.()?.activeTool?.type;
    if (nextTool) setActiveTool(nextTool);
  }, [apiRef, canvasRevision]);
  useEffect(() => {
    const syncCustomTool = (event) => {
      const tool = String(event.detail?.tool || "").toLowerCase();
      if (["bucketfill", "autoshape"].includes(tool)) setCustomTool(tool);
    };
    const clearCustomTool = (event) => {
      if (event.target?.closest?.(".sketchizi-primary-dock button")) setCustomTool(null);
    };
    window.addEventListener("sketchizi:activate-tool", syncCustomTool);
    window.addEventListener("click", clearCustomTool, true);
    return () => {
      window.removeEventListener("sketchizi:activate-tool", syncCustomTool);
      window.removeEventListener("click", clearCustomTool, true);
    };
  }, []);
  const activeId = customTool || activeTool;
  const activeEntry = GROUPS.flat().find((tool) => tool.id === activeId) || GROUPS[0][0];
  const renderTool = ({ id, label }, index = 0, radial = false) => {
    const selected = customTool ? customTool === id : activeTool === id;
    return (
      <button key={id} type="button" className={`sketchizi-primary-dock-tool${selected ? " is-active" : ""}`}
        aria-label={label} aria-pressed={selected} title={label} disabled={!canEdit}
        style={radial ? { "--tool-angle": `${(index * 360) / GROUPS.flat().length}deg`, "--tool-counter-angle": `${-(index * 360) / GROUPS.flat().length}deg` } : undefined}
        onClick={() => {
          activateTool({ id, root: rootRef.current, apiRef });
          setActiveTool(id);
          if (id !== "bucketfill" && id !== "autoshape") setCustomTool(null);
          if (menuOpen) setPaletteOpen(false);
        }}>
        <ToolIcon name={id} />
        {menuOpen && <span className="sketchizi-primary-dock-tool-label">{label}</span>}
      </button>
    );
  };
  const todoControl = (
    <>
      <button type="button" className={`sketchizi-primary-dock-tool sketchizi-todo-dock-trigger${todoOpen ? " is-active" : ""}${menuOpen ? " sketchizi-todo-menu-trigger" : ""}`}
        aria-label="Todo List" title="Todo List" aria-expanded={todoOpen} aria-haspopup="dialog"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setTodoOpen((open) => !open);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="3.5" width="16" height="17" rx="2" />
          <path d="m7.5 9 1.5 1.5L12 7.5M14 9h3M7.5 15l1.5 1.5 3-3M14 15h3" />
        </svg>
      </button>
      {todoOpen && typeof document !== "undefined" && createPortal(
        <TodoList items={todoItems} onChange={onTodoItemsChange} onClose={() => setTodoOpen(false)} isDarkTheme={isDarkTheme} />,
        document.body
      )}
    </>
  );
  if (menuOpen) {
    return (
      <>
        <div className={`sketchizi-dock-launcher-wrap${isDarkTheme ? " is-dark" : ""}`} data-canvas-revision={canvasRevision}>
          <button type="button" className="sketchizi-dock-launcher" aria-label="Open drawing tools"
            aria-expanded={paletteOpen} aria-haspopup="dialog" onClick={() => setPaletteOpen((open) => !open)}>
            <ToolIcon name={activeEntry.id} />
            <span>{activeEntry.label}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          {paletteOpen && (
            <div className="sketchizi-dock-quick-palette" role="dialog" aria-label="Drawing tools">
              <div className="sketchizi-dock-radial-hub"><ToolIcon name={activeEntry.id} /><span>{activeEntry.label}</span><small>ACTIVE TOOL</small></div>
              <div className="sketchizi-dock-radial-tools">{GROUPS.flat().map((tool, index) => renderTool(tool, index, true))}</div>
              <button type="button" className="sketchizi-dock-radial-close" aria-label="Close drawing tools" onClick={() => setPaletteOpen(false)}>×</button>
            </div>
          )}
        </div>
        {todoControl}
      </>
    );
  }
  return (
    <nav className={`sketchizi-primary-dock${isDarkTheme ? " is-dark" : ""}`} aria-label="Primary drawing tools" data-canvas-revision={canvasRevision}>
      {GROUPS.map((group, groupIndex) => (
        <div className="sketchizi-primary-dock-group" key={groupIndex}>
          {group.map(renderTool)}
        </div>
      ))}
      <div className="sketchizi-primary-dock-group sketchizi-primary-dock-utility-group">
        {todoControl}
      </div>
    </nav>
  );
}
