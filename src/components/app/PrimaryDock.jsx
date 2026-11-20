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
  todo: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="m7.5 9 1.5 1.5L12 7.5M14 9h3M7.5 15l1.5 1.5 3-3M14 15h3" /></>,
};

const TOOLS = [
  { id: "hand", label: "Hand" },
  { id: "selection", label: "Select" },
  { id: "rectangle", label: "Rectangle" },
  { id: "ellipse", label: "Ellipse" },
  { id: "diamond", label: "Diamond" },
  { id: "arrow", label: "Arrow" },
  { id: "line", label: "Line" },
  { id: "freedraw", label: "Draw" },
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "frame", label: "Frame" },
  { id: "eraser", label: "Eraser" },
  { id: "laser", label: "Laser pointer" },
  { id: "bucketfill", label: "Bucket Fill" },
  { id: "autoshape", label: "Draw to Shape" },
  { id: "todo", label: "Todo List" },
];

function ToolIcon({ name }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

function activateTool({ id, root, apiRef, onOpenTodoTab }) {
  if (id === "todo") {
    onOpenTodoTab?.();
    return;
  }
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

export default function PrimaryDock({ rootRef, apiRef, canEdit = true, isDarkTheme = false, canvasRevision = 0, onOpenTodoTab }) {
  const [activeTool, setActiveTool] = useState(() => apiRef.current?.getAppState?.()?.activeTool?.type || "selection");
  const [customTool, setCustomTool] = useState(null);
  const [position, setPosition] = useState(null);
  const dragRef = useRef(null);
  const wheelRef = useRef(null);

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
      if (!event.target?.closest?.(".sketchizi-radial-wheel button")) setCustomTool(null);
    };
    window.addEventListener("sketchizi:activate-tool", syncCustomTool);
    window.addEventListener("click", clearCustomTool, true);
    return () => {
      window.removeEventListener("sketchizi:activate-tool", syncCustomTool);
      window.removeEventListener("click", clearCustomTool, true);
    };
  }, []);

  useEffect(() => {
    const move = (event) => {
      if (!dragRef.current) return;
      const { offsetX, offsetY } = dragRef.current;
      const width = wheelRef.current?.offsetWidth || 300;
      const height = wheelRef.current?.offsetHeight || 300;
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - offsetX)),
        top: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - offsetY)),
      });
    };
    const stop = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const activeId = customTool || activeTool;
  const style = position
    ? { left: position.left, top: position.top }
    : { left: 18, bottom: 18 };
  const startDrag = (event) => {
    if (event.button !== 0) return;
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    event.preventDefault();
  };

  return (
    <nav ref={wheelRef} className={`sketchizi-radial-wheel${isDarkTheme ? " is-dark" : ""}`} aria-label="Drawing tools" data-canvas-revision={canvasRevision} style={style}>
      <div className="sketchizi-radial-wheel-ring" aria-hidden="true" />
      {TOOLS.map((tool, index) => {
        const angle = (index * 360) / TOOLS.length - 90;
        const selected = activeId === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            className={`sketchizi-radial-wheel-tool${selected ? " is-active" : ""}`}
            aria-label={tool.label}
            aria-pressed={selected}
            title={tool.label}
            disabled={!canEdit && tool.id !== "todo"}
            style={{ "--tool-angle": `${angle}deg` }}
            onClick={() => {
              activateTool({ id: tool.id, root: rootRef.current, apiRef, onOpenTodoTab });
              if (tool.id !== "todo") {
                setActiveTool(tool.id);
                setCustomTool(["bucketfill", "autoshape"].includes(tool.id) ? tool.id : null);
              }
            }}
          >
            <ToolIcon name={tool.id} />
          </button>
        );
      })}
      <button
        type="button"
        className="sketchizi-radial-wheel-hub"
        aria-label="Move tool wheel"
        title="Drag to move tool wheel"
        onPointerDown={startDrag}
      >
        <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M22 12l-3-3m3 3-3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3" />
        </svg>
      </button>
    </nav>
  );
}
