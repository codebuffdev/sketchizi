import { useEffect, useMemo, useRef, useState } from "react";
import { getTabDisplayName } from "../../features/workspace/tabLabel.js";

function CanvasGlyph() {
  return (
    <svg className="canvas-tab-icon" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="m6 12 2.2-2.3 2.1 2 1.7-1.6L14 12" />
      <path d="M6 6.5h3" />
    </svg>
  );
}

function TodoGlyph() {
  return (
    <svg className="canvas-tab-icon canvas-tab-todo-icon" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="2.5" width="14" height="15" rx="2" />
      <path d="m5.5 7 1.2 1.2L9 5.8M11 7h3.5M5.5 13l1.2 1.2L9 11.8M11 13h3.5" />
    </svg>
  );
}

function NewCanvasGlyph() {
  return (
    <svg className="canvas-tabs-add-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="13" height="14" rx="2" />
      <path d="M8 5V3.8A1.8 1.8 0 0 1 9.8 2h9.4A1.8 1.8 0 0 1 21 3.8v10.4a1.8 1.8 0 0 1-1.8 1.8H16" />
      <path d="M10 12h6M13 9v6" />
    </svg>
  );
}

function CloseGlyph() {
  return <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}

export default function CanvasTabs({ tabs, activeId, onSelect, onCreate, onClose, onReorder, activeActions = null, leadingAction = null, hideActiveName = false, disabled = false, showAddButton = true }) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const rootRef = useRef(null);
  const visibleTabs = useMemo(() => {
    if (tabs.length <= 3) return tabs;
    const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeId));
    const start = Math.min(Math.max(0, activeIndex - 2), tabs.length - 3);
    return tabs.slice(start, start + 3);
  }, [tabs, activeId]);
  const visibleIds = new Set(visibleTabs.map((tab) => tab.id));
  const hiddenTabs = tabs.filter((tab) => !visibleIds.has(tab.id));
  const hiddenCount = hiddenTabs.length;
  const dragId = useRef(null);

  useEffect(() => {
    setOverflowOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (!overflowOpen) return undefined;
    const closeOnOutsideInteraction = (event) => {
      if (!rootRef.current?.contains(event.target)) setOverflowOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOverflowOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [overflowOpen]);

  const handleDrop = (event, targetId) => {
    event.preventDefault();
    const sourceId = dragId.current;
    dragId.current = null;
    if (sourceId && sourceId !== targetId) onReorder?.(sourceId, targetId);
  };

  const renderTab = (tab) => (
    <div className={`canvas-tab-item${activeId === tab.id ? " is-active" : ""}`} key={tab.id}>
      {activeId === tab.id && leadingAction}
      <button
        type="button"
        role="tab"
        className={`canvas-tab${activeId === tab.id ? " is-active" : ""}`}
        aria-selected={activeId === tab.id}
        title={tab.name}
        draggable={!disabled && !tab.isTodoTab}
        onDragStart={(event) => {
          if (tab.isTodoTab) { event.preventDefault(); return; }
          dragId.current = tab.id;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", tab.id);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleDrop(event, tab.id)}
        onDragEnd={() => { dragId.current = null; }}
        onClick={() => { setOverflowOpen(false); onSelect?.(tab.id); }}
        disabled={disabled}
      >
        {tab.isTodoTab ? <TodoGlyph /> : <CanvasGlyph />}
        {!(hideActiveName && activeId === tab.id) && <span className="canvas-tab-name">{getTabDisplayName(tab.name)}</span>}
        {tab.dirty && <span className="canvas-tab-dirty" aria-label="Unsaved changes" />}
      </button>
      {activeId === tab.id && activeActions && <div className="canvas-tab-active-actions" aria-label={`Actions for ${tab.name}`}>{activeActions}</div>}
      {onClose && <button type="button" className="canvas-tab-close" aria-label={`Close ${tab.name}`} title={`Close ${tab.name}`} onClick={(event) => { event.stopPropagation(); setOverflowOpen(false); onClose(tab.id); }} disabled={disabled}><CloseGlyph /></button>}
    </div>
  );

  return (
    <div className="canvas-tabs-bar" role="tablist" aria-label="Workspace tabs" ref={rootRef}>
      <div className="canvas-tabs-list">
        {visibleTabs.map(renderTab)}
        {hiddenCount > 0 && (
          <div className="canvas-tabs-overflow">
            <button type="button" className={`canvas-tabs-overflow-trigger${overflowOpen ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={overflowOpen} onClick={() => setOverflowOpen((open) => !open)}>+{hiddenCount}</button>
            {overflowOpen && (
              <div className="canvas-tabs-overflow-menu" role="menu">
                {hiddenTabs.map((tab) => (
                  <div className="canvas-tabs-overflow-item" role="none" key={tab.id}>
                    <button type="button" role="menuitem" className={activeId === tab.id ? "is-active" : ""} onClick={() => { onSelect?.(tab.id); setOverflowOpen(false); }}>
                      <span className="canvas-tabs-overflow-name">{tab.isTodoTab ? <TodoGlyph /> : <CanvasGlyph />}<span className="canvas-tabs-overflow-label" title={tab.name}>{getTabDisplayName(tab.name)}</span></span>
                      {tab.dirty && <span className="canvas-tab-dirty" aria-label="Unsaved changes" />}
                    </button>
                    {onClose && <button type="button" className="canvas-tab-close canvas-tabs-overflow-close" aria-label={`Close ${tab.name}`} title={`Close ${tab.name}`} onClick={() => { setOverflowOpen(false); onClose(tab.id); }} disabled={disabled}><CloseGlyph /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {showAddButton && <button type="button" className="canvas-tabs-add" aria-label="Create new canvas" title="Create new canvas" onClick={() => { setOverflowOpen(false); onCreate?.(); }} disabled={disabled}><NewCanvasGlyph /></button>}
      </div>
    </div>
  );
}
