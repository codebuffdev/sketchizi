import { useEffect, useMemo, useRef, useState } from "react";
import { getTabDisplayName } from "../../features/workspace/tabLabel.js";
import { describeTabSync, getTabStatusClass } from "../../features/workspace/tabCloudState.js";
import { countLiveElements, describeClosedAt } from "../../features/workspace/closedTabs.js";
import WorkspaceModeIcon from "../../features/workspace/WorkspaceModeIcon.jsx";

function TodoGlyph() {
  return (
    <svg className="canvas-tab-icon canvas-tab-todo-icon" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="2.5" width="14" height="15" rx="2" />
      <path d="m5.5 7 1.2 1.2L9 5.8M11 7h3.5M5.5 13l1.2 1.2L9 11.8M11 13h3.5" />
    </svg>
  );
}

function TabSyncBadge({ meta }) {
  if (!meta || meta.sourceType !== "cloud") return null;
  const status = meta.syncStatus;
  const label = describeTabSync(meta);
  return (
    <span className={`canvas-tab-sync is-${status}`} role="status" aria-label={label} title={label}>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.6 12.2h6.2a2.6 2.6 0 0 0 .4-5.2 3.7 3.7 0 0 0-7.2.9 2.2 2.2 0 0 0 .6 4.3Z" />
        {status === "synced" && <path d="m6.2 9.2 1.3 1.3 2.3-2.5" />}
      </svg>
      {status === "dirty" && <i className="canvas-tab-sync-dot is-dirty" />}
      {status === "error" && <i className="canvas-tab-sync-dot is-error" />}
    </span>
  );
}

function ReopenGlyph() {
  return (
    <svg className="canvas-tabs-reopen-icon" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 9.5a5.5 5.5 0 1 1 1.6 3.9" />
      <path d="M4.5 5v4.5H9" />
    </svg>
  );
}

function CloseGlyph() {
  return <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}

export default function CanvasTabs({ tabs, activeId, onSelect, onCreate, onClose, onReorder, onRename, closedTabs = [], onReopenClosedTab, onDeleteClosedTab, onClearClosedTabs, activeMenu = null, activeRenameAction = null, activeStatusClass = "is-saved", activeStatusLabel = "Saved", disabled = false, showAddButton = true }) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [activeMenuOpen, setActiveMenuOpen] = useState(false);
  const [closedMenuOpen, setClosedMenuOpen] = useState(false);
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
    setActiveMenuOpen(false);
    setClosedMenuOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (!closedMenuOpen) return undefined;
    const closeOnOutsideInteraction = (event) => {
      if (!rootRef.current?.contains(event.target)) setClosedMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setClosedMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [closedMenuOpen]);

  useEffect(() => {
    if (closedMenuOpen && closedTabs.length === 0) setClosedMenuOpen(false);
  }, [closedMenuOpen, closedTabs.length]);

  useEffect(() => {
    if (!activeMenuOpen) return undefined;
    const closeOnOutsideInteraction = (event) => {
      if (!rootRef.current?.contains(event.target)) setActiveMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setActiveMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [activeMenuOpen]);

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
        onDoubleClick={() => { if (!tab.isTodoTab) { setOverflowOpen(false); setActiveMenuOpen(true); onRename?.(tab.id); } }}
        disabled={disabled}
      >
        {tab.isTodoTab ? <TodoGlyph /> : <WorkspaceModeIcon mode={tab.type === "page" ? "pages" : tab.type || "canvas"} className={`canvas-tab-icon canvas-tab-icon--${tab.type === "page" ? "pages" : tab.type || "canvas"}`} />}
        <span className="canvas-tab-name">{getTabDisplayName(tab.name)}</span>
        {tab.syncMeta?.sourceType === "cloud" ? <TabSyncBadge meta={tab.syncMeta} /> : tab.isTodoTab ? null : activeId === tab.id ? <span className={`canvas-tab-status-dot ${activeStatusClass}`} role="status" aria-label={activeStatusLabel} title={activeStatusLabel} /> : tab.syncMeta && <span className={`canvas-tab-status-dot ${getTabStatusClass(tab.syncMeta)}`} role="status" aria-label={describeTabSync(tab.syncMeta)} title={describeTabSync(tab.syncMeta)} />}
      </button>
      {activeId === tab.id && activeRenameAction && <span className="canvas-tab-inline-rename">{activeRenameAction}</span>}
      {activeId === tab.id && activeMenu && <button type="button" className={`canvas-tab-menu-trigger${activeMenuOpen ? " is-open" : ""}`} aria-label="Canvas options" aria-haspopup="dialog" aria-expanded={activeMenuOpen} title="Canvas options" onClick={(event) => { event.stopPropagation(); setOverflowOpen(false); setActiveMenuOpen((open) => !open); }} disabled={disabled}><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button>}
      {onClose && <button type="button" className="canvas-tab-close" aria-label={`Close ${tab.name}`} title={`Close ${tab.name}`} onClick={(event) => { event.stopPropagation(); setOverflowOpen(false); onClose(tab.id); }} disabled={disabled}><CloseGlyph /></button>}
    </div>
  );

  return (
    <div className="canvas-tabs-bar" role="tablist" aria-label="Workspace tabs" ref={rootRef} onContextMenu={(event) => { if (!closedTabs.length || !onReopenClosedTab) return; event.preventDefault(); setOverflowOpen(false); setActiveMenuOpen(false); setClosedMenuOpen(true); }}>
      <div className="canvas-tabs-list">
        {visibleTabs.map(renderTab)}
        <div className="canvas-tab-controls-group">
        {hiddenCount > 0 && (
          <div className="canvas-tabs-overflow">
            <button type="button" className={`canvas-tabs-overflow-trigger${overflowOpen ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={overflowOpen} onClick={() => setOverflowOpen((open) => !open)}>+{hiddenCount}</button>
            {overflowOpen && (
              <div className="canvas-tabs-overflow-menu" role="menu">
                {hiddenTabs.map((tab) => (
                  <div className="canvas-tabs-overflow-item" role="none" key={tab.id}>
                    <button type="button" role="menuitem" className={activeId === tab.id ? "is-active" : ""} onClick={() => { onSelect?.(tab.id); setOverflowOpen(false); }}>
                      <span className="canvas-tabs-overflow-name">{tab.isTodoTab ? <TodoGlyph /> : <WorkspaceModeIcon mode={tab.type || "canvas"} className={`canvas-tab-icon canvas-tab-icon--${tab.type || "canvas"}`} />}<span className="canvas-tabs-overflow-label" title={tab.name}>{getTabDisplayName(tab.name)}</span></span>
                      {tab.syncMeta?.sourceType === "cloud" ? <TabSyncBadge meta={tab.syncMeta} /> : tab.syncMeta && !tab.isTodoTab && <span className={`canvas-tab-status-dot ${getTabStatusClass(tab.syncMeta)}`} role="status" aria-label={describeTabSync(tab.syncMeta)} title={describeTabSync(tab.syncMeta)} />}
                    </button>
                    {onClose && <button type="button" className="canvas-tab-close canvas-tabs-overflow-close" aria-label={`Close ${tab.name}`} title={`Close ${tab.name}`} onClick={() => { setOverflowOpen(false); onClose(tab.id); }} disabled={disabled}><CloseGlyph /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {closedTabs.length > 0 && onReopenClosedTab && (
          <div className="canvas-tabs-closed">
            <button type="button" className={`canvas-tabs-closed-trigger${closedMenuOpen ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={closedMenuOpen} aria-label={`Recently closed canvases (${closedTabs.length})`} title="Recently closed (Ctrl/Cmd+Shift+T reopens the last one)" onClick={() => { setOverflowOpen(false); setActiveMenuOpen(false); setClosedMenuOpen((open) => !open); }} disabled={disabled}>
              <ReopenGlyph />
              <span className="canvas-tabs-closed-count">{closedTabs.length}</span>
            </button>
            {closedMenuOpen && (
              <div className="canvas-tabs-closed-menu" role="menu" aria-label="Recently closed canvases">
                <div className="canvas-tabs-closed-heading">
                  <strong>Recently closed</strong>
                  <span>Local drafts kept in this browser</span>
                </div>
                {closedTabs.map((record) => (
                  <div className="canvas-tabs-closed-item" role="none" key={record.closedId}>
                    <button type="button" role="menuitem" className="canvas-tabs-closed-open" title={`Reopen ${record.name}`} onClick={() => { setClosedMenuOpen(false); onReopenClosedTab(record.closedId); }}>
                      <span className="canvas-tabs-closed-name">{getTabDisplayName(record.name)}</span>
                      <small>{describeClosedAt(record)} · {countLiveElements(record)} {countLiveElements(record) === 1 ? "element" : "elements"}</small>
                    </button>
                    {onDeleteClosedTab && <button type="button" className="canvas-tab-close canvas-tabs-closed-delete" aria-label={`Delete draft ${record.name}`} title="Delete this draft permanently" onClick={() => onDeleteClosedTab(record.closedId)}><CloseGlyph /></button>}
                  </div>
                ))}
                {onClearClosedTabs && <button type="button" role="menuitem" className="canvas-tabs-closed-clear" onClick={() => { setClosedMenuOpen(false); onClearClosedTabs(); }}>Delete all local drafts</button>}
              </div>
            )}
          </div>
        )}
        {showAddButton && <button type="button" className="canvas-tabs-add" aria-label="Create new tab" title="Create new tab" onClick={() => { setOverflowOpen(false); onCreate?.(); }} disabled={disabled}><svg className="canvas-tabs-add-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></svg></button>}
        </div>
      </div>
      {activeMenuOpen && activeMenu && <div className="canvas-tabs-active-menu" role="dialog" aria-label="Canvas options">{activeMenu}</div>}
    </div>
  );
}
