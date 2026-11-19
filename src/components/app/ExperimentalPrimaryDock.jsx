import React from "react";

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
  eraser: <><path d="m7 16 8-10a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-8 9H9l-5-5a2 2 0 0 1 0-3l3-4" /><path d="m11 20 8 0" /></>,
  bucketfill: <><path d="m7 4 12 12-5 5-9-9 5-5Z" /><path d="m12 9 5-5 3 3-5 5" /><path d="M18 17c0 2 1 3 2 3s2-1 2-3" /></>,
  autoshape: <><path d="M3 16c2-7 5-9 7-6" /><path d="M11 12h3m-2-2 2 2-2 2" /><rect x="16" y="6" width="5" height="12" rx="1" /></>,
};

const GROUPS = [
  [{ id: "selection", label: "Select", shortcut: "V" }, { id: "hand", label: "Hand", shortcut: "H" }],
  [{ id: "rectangle", label: "Rectangle", shortcut: "R" }, { id: "ellipse", label: "Ellipse", shortcut: "O" }, { id: "diamond", label: "Diamond", shortcut: "D" }],
  [{ id: "arrow", label: "Arrow", shortcut: "A" }, { id: "line", label: "Line", shortcut: "L" }],
  [{ id: "freedraw", label: "Draw", shortcut: "P" }, { id: "text", label: "Text", shortcut: "T" }],
  [{ id: "image", label: "Image", shortcut: "I" }, { id: "eraser", label: "Eraser", shortcut: "E" }],
  [{ id: "bucketfill", label: "Bucket Fill", shortcut: "B", custom: true }, { id: "autoshape", label: "Draw to Shape", shortcut: "⇧X", custom: true }],
];

function ToolIcon({ name }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

function activateTool({ id, root, apiRef }) {
  if (id === "bucketfill" || id === "autoshape") {
    const button = root?.querySelector(`[data-sketchizi-quick-tool="${id}"]`);
    button?.click();
    return;
  }
  if (id === "image") {
    const imageButton = root?.querySelector('[data-testid="toolbar-image"], button[aria-label*="image" i]');
    if (imageButton instanceof HTMLElement) imageButton.click();
    else apiRef.current?.setActiveTool?.({ type: "image" });
    return;
  }
  apiRef.current?.setActiveTool?.({ type: id });
}

export default function ExperimentalPrimaryDock({ rootRef, apiRef, canEdit = true, isDarkTheme = false, canvasRevision = 0 }) {
  const activeTool = apiRef.current?.getAppState?.()?.activeTool?.type || "selection";
  return (
    <nav className={`sketchizi-experimental-primary-dock${isDarkTheme ? " is-dark" : ""}`} aria-label="Experimental drawing tools" data-canvas-revision={canvasRevision}>
      {GROUPS.map((group, groupIndex) => (
        <React.Fragment key={groupIndex}>
          {groupIndex > 0 && <span className="sketchizi-experimental-dock-divider" aria-hidden="true" />}
          <div className="sketchizi-experimental-dock-group">
            {group.map(({ id, label, shortcut, custom }) => {
              const selected = activeTool === id || (id === "freedraw" && activeTool === "freedraw");
              return (
                <button
                  key={id}
                  type="button"
                  className={`sketchizi-experimental-dock-tool${selected ? " is-active" : ""}`}
                  aria-label={label}
                  aria-pressed={selected}
                  title={`${label} · ${shortcut}`}
                  disabled={!canEdit}
                  onClick={() => activateTool({ id, root: rootRef.current, apiRef })}
                >
                  <ToolIcon name={id} />
                  <span className="sketchizi-experimental-dock-shortcut" aria-hidden="true">{shortcut}</span>
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </nav>
  );
}
