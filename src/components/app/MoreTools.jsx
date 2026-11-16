import { useEffect, useState } from "react";

function ToolIcon({ name }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    layers: <><path d="M4 5h16M4 10h16M4 15h10M4 20h10" /><path d="M17 14v7m-3.5-3.5h7" /></>,
    image: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4.5 17 5-5 3.5 3 2.5-2 4 4" /></>,
    frame: <><path d="M5 3v18M19 3v18M3 7h18M3 17h18" /></>,
    embeddable: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m9 10-2 2 2 2m6-4 2 2-2 2m-2-5-2 6" /></>,
    laser: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z" /></>,
    lasso: <><path d="M12 4c5 0 8 2.2 8 5s-3 5-8 5-8-2.2-8-5 3-5 8-5Z" /><path d="M7 13.2c-.7 2.7-.2 4.8 1.6 5.5 1.5.6 3.2-.6 3.2-2.1 0-1.2-1.5-1.8-2.3-.8-.7.8-.2 2.3 1.4 3.2" /></>,
    "zen-mode": <><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" /></>,
    "dock-lock": <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export default function MoreTools({ open, anchor, position, activateTool, openPanel, toggle, canEdit = true, placement = "canvas" }) {
  const [dockLocked, setDockLocked] = useState(true);

  useEffect(() => {
    const handleDockLockState = (event) => {
      if (typeof event.detail?.locked === "boolean") setDockLocked(event.detail.locked);
    };
    window.addEventListener("sketchizi:dock-lock-state", handleDockLockState);
    return () => window.removeEventListener("sketchizi:dock-lock-state", handleDockLockState);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".sketchizi-more-tools")) return;
      toggle("more-tools");
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      toggle("more-tools");
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open, toggle]);

  useEffect(() => {
    const handleQuickTool = (event) => {
      const tool = event.detail?.tool;
      if (!canEdit || !["bucketfill", "autoshape"].includes(tool)) return;
      activateTool(tool);
    };
    window.addEventListener("sketchizi:activate-tool", handleQuickTool);
    return () => window.removeEventListener("sketchizi:activate-tool", handleQuickTool);
  }, [activateTool, canEdit]);

  const items = [
    ["layers", "Open Layers", ""],
    ["image", "Insert image", "9"],
    ["frame", "Frame tool", "F"],
    ["embeddable", "Web Embed", ""],
    ["laser", "Laser pointer", "K"],
    ["lasso", "Lasso selection", ""],
    ["zen-mode", "Zen mode", "Alt+Z"],
    ["dock-lock", dockLocked ? "Unlock dock" : "Lock dock", ""],
  ];

  return (
    <div className={`sketchizi-more-tools sketchizi-more-tools-${placement} ${open ? "open" : ""}`} style={{ "--sketchizi-more-tools-left": `${anchor.left}px`, "--sketchizi-more-tools-top": `${anchor.top}px` }}>
      <button type="button" className="sketchizi-more-tools-trigger" aria-label="Tool" aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); position(); toggle("more-tools"); }}>
        <svg className="tool-trigger-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3.5 17.5a2.1 2.1 0 0 0 3 3l4.8-4.8a5 5 0 0 0 6.4-6.4l-3 3-3-3Z"/></svg>
      </button>
      {open && <div className="sketchizi-more-tools-menu" role="menu" aria-label="Tool">
        <div className="more-tools-menu-header">
          <span>Tool</span>
          <button type="button" className="more-tools-menu-close" aria-label="Close Tool menu" onClick={() => toggle("more-tools")}>×</button>
        </div>
        {items.map(([tool, label, key]) => <button key={tool} type="button" role="menuitem" disabled={tool !== "layers" && !canEdit} onClick={() => { if (tool === "layers") openPanel?.("layers"); else activateTool(tool); }}><span className="more-tools-icon"><ToolIcon name={tool} /></span><span>{label}</span><kbd>{key}</kbd></button>)}
      </div>}
    </div>
  );
}
