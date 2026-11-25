import React, { useEffect, useRef, useState } from "react";
import { strokeWidthAppStatePatch } from "../../features/canvas/strokeWidthKey.js";

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
  eraser: <><path d="m7 16 8-10a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-8 9H9l-5-5a2 2 0 0 1 0-3l3-4" /><path d="m11 20 8 0" /></>,
  laser: <><path d="m5 19 8-8" /><path d="m12 5 1-2m4 4 2-1m-1 5 2 1" /><circle cx="16" cy="8" r="2" /></>,
  bucketfill: <><path d="M4 13.5 13.5 4 20 10.5 10.5 20 4 13.5Z" /><path d="m9 8.5 6.5 6.5M17 16c0 2 1 3 2 3s2-1 2-3" /></>,
  autoshape: <><path d="M3 16c2-7 5-9 7-6" /><path d="M11 12h3m-2-2 2 2-2 2" /><rect x="16" y="6" width="5" height="12" rx="1" /></>,
  highlighter: <><path d="m9 11 6 6" /><path d="m14.5 5.5 4 4L10 18l-5 1 1-5 8.5-8.5Z" /><path d="M4 21h8" /></>,
  todo: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="m7.5 9 1.5 1.5L12 7.5M14 9h3M7.5 15l1.5 1.5 3-3M14 15h3" /></>,
};

const HIGHLIGHTER_DEFAULTS = { strokeColor: "#ffd60a", opacity: 40, strokeWidth: 8 };

// Grace period before the dock collapses after the pointer leaves it.
const COLLAPSE_GRACE_MS = 3000;

// Hints are only shown for shortcuts already handled by Excalidraw.
const TOOLS = [
  { id: "selection", label: "Select", keyHint: "V" },
  { id: "hand", label: "Pan Canvas", keyHint: "H" },
  { id: "rectangle", label: "Rectangle", keyHint: "R" },
  { id: "ellipse", label: "Ellipse", keyHint: "O" },
  { id: "diamond", label: "Diamond", keyHint: "D" },
  { id: "arrow", label: "Arrow", keyHint: "A" },
  { id: "line", label: "Line", keyHint: "L" },
  { id: "freedraw", label: "Draw", keyHint: "P" },
  { id: "text", label: "Text", keyHint: "T" },
  { id: "highlighter", label: "Highlighter" },
  { id: "image", label: "Insert Image", keyHint: "I" },
  { id: "frame", label: "Frame", keyHint: "F" },
  { id: "eraser", label: "Eraser", keyHint: "E" },
  { id: "laser", label: "Laser Pointer", keyHint: "K" },
  { id: "bucketfill", label: "Bucket Fill" },
  { id: "autoshape", label: "Draw to Shape" },
  { id: "todo", label: "Todo List", separated: true },
];

function ToolIcon({ name, size = 19, strokeWidth = 1.7 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
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
  if (id === "highlighter") {
    const api = apiRef.current;
    api?.setActiveTool?.({ type: "freedraw" });
    api?.updateScene?.({ appState: { currentItemStrokeColor: HIGHLIGHTER_DEFAULTS.strokeColor, currentItemOpacity: HIGHLIGHTER_DEFAULTS.opacity, ...strokeWidthAppStatePatch(HIGHLIGHTER_DEFAULTS.strokeWidth) } });
    window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: "highlighter" } }));
    return;
  }
  if (id === "bucketfill" || id === "autoshape") {
    window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: id } }));
    return;
  }
  apiRef.current?.setActiveTool?.({ type: id });
}

export default function PrimaryDock({ rootRef, apiRef, selectedElements = [], canEdit = true, isDarkTheme = false, canvasRevision = 0, onOpenTodoTab, nativeMenuOpen = false }) {
  const [activeTool, setActiveTool] = useState(() => apiRef.current?.getAppState?.()?.activeTool?.type || "selection");
  const [customTool, setCustomTool] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const customToolRef = useRef(null);
  const highlighterSavedRef = useRef(null);
  const collapseTimerRef = useRef(null);
  const firstToolButtonRef = useRef(null);
  const activeButtonRef = useRef(null);

  useEffect(() => {
    const nextTool = apiRef.current?.getAppState?.()?.activeTool?.type;
    if (nextTool) setActiveTool(nextTool);
  }, [apiRef, canvasRevision]);

  customToolRef.current = customTool;

  const restoreHighlighter = () => {
    const saved = highlighterSavedRef.current;
    highlighterSavedRef.current = null;
    if (!saved) return;
    apiRef.current?.updateScene?.({ appState: { currentItemStrokeColor: saved.strokeColor, currentItemOpacity: saved.opacity, ...strokeWidthAppStatePatch(saved.strokeWidth) } });
  };

  // Leaving freedraw by any route (shortcut, native toolbar) ends highlighter mode.
  useEffect(() => {
    if (customTool === "highlighter" && activeTool !== "freedraw") {
      setCustomTool(null);
      restoreHighlighter();
      window.dispatchEvent(new CustomEvent("sketchizi:clear-custom-tool"));
    }
  }, [activeTool, customTool]);

  useEffect(() => {
    const syncCustomTool = (event) => {
      const tool = String(event.detail?.tool || "").toLowerCase();
      if (["bucketfill", "autoshape", "highlighter"].includes(tool)) setCustomTool(tool);
    };
    const clearCustomTool = (event) => {
      // Highlighter is a persistent drawing mode; canvas clicks must not end it.
      if (customToolRef.current === "highlighter") return;
      if (!event.target?.closest?.(".sketchizi-tool-sidebar button")) setCustomTool(null);
    };
    window.addEventListener("sketchizi:activate-tool", syncCustomTool);
    window.addEventListener("click", clearCustomTool, true);
    return () => {
      window.removeEventListener("sketchizi:activate-tool", syncCustomTool);
      window.removeEventListener("click", clearCustomTool, true);
    };
  }, []);

  useEffect(() => () => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
  }, []);

  const appState = apiRef.current?.getAppState?.() || {};
  const selectedIds = Object.entries(appState.selectedElementIds || {})
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => id);
  const liveSelectedElements = (apiRef.current?.getSceneElements?.() || []).filter((element) =>
    selectedIds.includes(element.id) && element && !element.isDeleted && !element.deleted,
  );
  const hasLiveSelectionState = appState.selectedElementIds &&
    typeof appState.selectedElementIds === "object";
  const selected = hasLiveSelectionState
    ? liveSelectedElements
    : selectedElements.filter((element) => element && !element.isDeleted && !element.deleted);
  const selectedType = selected.length > 0 && selected.every((element) => element.type === selected[0].type)
    ? selected[0].type
    : null;
  const selectionToolByElementType = {
    text: "text",
    arrow: "arrow",
    line: "line",
    rectangle: "rectangle",
    diamond: "diamond",
    ellipse: "ellipse",
    freedraw: "freedraw",
    frame: "frame",
    image: "image",
  };
  // Selection only changes the dock's presentation. Excalidraw's activeTool
  // remains "selection", preserving normal move/resize/text-edit behavior.
  const displayedTool = customTool || (activeTool !== "selection"
    ? activeTool
    : (selectionToolByElementType[selectedType] || "selection"));
  const activeId = customTool || activeTool;

  // Any change of the active tool (click or keyboard shortcut) collapses the
  // dock. Focus is deliberately left alone so typing shortcuts keep working.
  const previousActiveIdRef = useRef(activeId);
  const selectionKey = selected.map((element) => element.id).sort().join("|");
  const previousSelectionKeyRef = useRef(selectionKey);
  const cancelCollapseTimer = () => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  };
  useEffect(() => {
    if (previousActiveIdRef.current === activeId) return;
    previousActiveIdRef.current = activeId;
    cancelCollapseTimer();
    setExpanded(false);
  }, [activeId]);
  useEffect(() => {
    if (previousSelectionKeyRef.current === selectionKey) return;
    previousSelectionKeyRef.current = selectionKey;
    cancelCollapseTimer();
    setExpanded(false);
  }, [selectionKey]);

  const activeToolMeta = TOOLS.find((tool) => tool.id === displayedTool) || TOOLS[0];

  const expandDock = () => {
    cancelCollapseTimer();
    setExpanded(true);
  };
  const handleExpandClick = () => {
    expandDock();
    window.requestAnimationFrame(() => firstToolButtonRef.current?.focus());
  };
  const collapseDock = () => {
    cancelCollapseTimer();
    setExpanded(false);
    window.requestAnimationFrame(() => activeButtonRef.current?.focus());
  };
  const scheduleCollapse = () => {
    cancelCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      setExpanded(false);
      collapseTimerRef.current = null;
    }, COLLAPSE_GRACE_MS);
  };
  const chooseTool = (tool) => {
    if (customToolRef.current === "highlighter" && tool.id !== "highlighter") {
      restoreHighlighter();
      window.dispatchEvent(new CustomEvent("sketchizi:clear-custom-tool"));
    }
    if (tool.id === "highlighter" && customToolRef.current !== "highlighter") {
      const state = apiRef.current?.getAppState?.() || {};
      highlighterSavedRef.current = {
        strokeColor: state.currentItemStrokeColor || "#1e1e1e",
        opacity: state.currentItemOpacity ?? 100,
        strokeWidth: state.currentItemStrokeWidth ?? 2,
      };
    }
    activateTool({ id: tool.id, root: rootRef.current, apiRef, onOpenTodoTab });
    if (tool.id !== "todo") {
      setActiveTool(tool.id === "highlighter" ? "freedraw" : tool.id);
      setCustomTool(["bucketfill", "autoshape", "highlighter"].includes(tool.id) ? tool.id : null);
    }
    collapseDock();
  };

  return (
    <nav
      className={`sketchizi-tool-sidebar${isDarkTheme ? " is-dark" : ""}${nativeMenuOpen ? " is-menu-open" : ""}${expanded ? " is-expanded" : ""}`}
      aria-label="Drawing tools"
      aria-hidden={nativeMenuOpen}
      inert={nativeMenuOpen}
      data-canvas-revision={canvasRevision}
      onMouseEnter={expandDock}
      onMouseLeave={scheduleCollapse}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleCollapse();
      }}
    >
      <div className="sketchizi-tool-sidebar-list" id="sketchizi-tool-sidebar-list" aria-label="All drawing tools" inert={!expanded}>
        {TOOLS.map((tool, toolIndex) => {
          const isDisplayed = displayedTool === tool.id;
          return (
            <React.Fragment key={tool.id}>
              {tool.separated && <div className="sketchizi-tool-sidebar-divider" aria-hidden="true" />}
              <button
                type="button"
                ref={tool.id === TOOLS[0].id ? firstToolButtonRef : undefined}
                className={`sketchizi-tool-sidebar-button${isDisplayed ? " is-active" : ""}`}
                aria-label={tool.label}
                aria-pressed={isDisplayed}
                title={tool.keyHint ? `${tool.label} (${tool.keyHint})` : tool.label}
                disabled={!canEdit && tool.id !== "todo"}
                style={{ "--sk-i": toolIndex }}
                onClick={() => chooseTool(tool)}
              >
                <ToolIcon name={tool.id} />
                {tool.keyHint && <span className="sketchizi-tool-sidebar-key">{tool.keyHint}</span>}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="sketchizi-tool-sidebar-collapsed">
        <button
          type="button"
          ref={activeButtonRef}
          className="sketchizi-tool-sidebar-active"
          aria-label={`Active tool: ${activeToolMeta.label}. Expand drawing tools`}
          aria-expanded={expanded}
          aria-controls="sketchizi-tool-sidebar-list"
          title={` ${activeToolMeta.label} — hover or focus to expand tools`}
          disabled={!canEdit && activeToolMeta.id !== "todo"}
          onMouseEnter={expandDock}
          onClick={handleExpandClick}
        >
          <ToolIcon name={activeToolMeta.id} size={20} strokeWidth={1.75} />
          <svg className="sketchizi-tool-sidebar-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
        </button>
        <button
          type="button"
          className="sketchizi-tool-sidebar-expand"
          aria-label={expanded ? "Collapse drawing tools" : "Expand drawing tools"}
          aria-expanded={expanded}
          tabIndex={-1}
          onMouseEnter={expandDock}
          onClick={handleExpandClick}
        >
          <span className="sketchizi-tool-sidebar-indicator" aria-hidden="true" />
          <svg className="sketchizi-tool-sidebar-chevron" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>
    </nav>
  );
}
