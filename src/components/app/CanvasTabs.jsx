import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getTabDisplayName } from "../../features/workspace/tabLabel.js";
import { describeTabSync, getTabStatusClass } from "../../features/workspace/tabCloudState.js";
import { countLiveElements, describeClosedAt } from "../../features/workspace/closedTabs.js";
import WorkspaceModeIcon from "../../features/workspace/WorkspaceModeIcon.jsx";

function TodoGlyph() {
  return <svg className="canvas-tab-icon canvas-tab-todo-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="2.5" width="14" height="15" rx="2" /><path d="m5.5 7 1.2 1.2L9 5.8M11 7h3.5M5.5 13l1.2 1.2L9 11.8M11 13h3.5" /></svg>;
}

function TabSyncBadge({ meta }) {
  if (!meta || meta.sourceType !== "cloud") return null;
  const label = describeTabSync(meta);
  return <span className={`canvas-tab-sync is-${meta.syncStatus}`} role="status" aria-label={label} title={label} />;
}

function ReopenGlyph() {
  return <svg className="canvas-tabs-reopen-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 9.5a5.5 5.5 0 1 1 1.6 3.9" /><path d="M4.5 5v4.5H9" /></svg>;
}

function CloseGlyph() {
  return <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}

function ChevronGlyph() {
  return <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>;
}

export default function CanvasTabs({
  tabs, activeId, onSelect, onCreate, onDuplicate, onClose, onReorder, onRename,
  closedTabs = [], onReopenClosedTab, onDeleteClosedTab, onClearClosedTabs,
  activeMenu = null, activeRenameAction = null, activeStatusClass = "is-saved",
  activeStatusLabel = "Saved", disabled = false, showAddButton = true, newTabMode = "canvas",
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [tabMenuOpenId, setTabMenuOpenId] = useState(null);
  const [closedMenuOpen, setClosedMenuOpen] = useState(false);
  const [maxVisibleCount, setMaxVisibleCount] = useState(5);
  const [overflowPosition, setOverflowPosition] = useState(null);
  const [tabMenuPosition, setTabMenuPosition] = useState(null);
  const rootRef = useRef(null);
  const overflowTriggerRef = useRef(null);
  const overflowMenuRef = useRef(null);
  const tabMenuTriggerRef = useRef(null);
  const tabMenuRef = useRef(null);
  const dragId = useRef(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const updateCapacity = () => {
      const width = node.getBoundingClientRect().width;
      setMaxVisibleCount(Math.max(2, Math.min(6, Math.floor((width - 112) / 104))));
    };
    updateCapacity();
    const observer = new ResizeObserver(updateCapacity);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visibleTabs = useMemo(() => {
    if (tabs.length <= maxVisibleCount) return tabs;
    const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeId));
    const start = Math.min(Math.max(0, activeIndex - Math.floor(maxVisibleCount / 2)), tabs.length - maxVisibleCount);
    return tabs.slice(start, start + maxVisibleCount);
  }, [tabs, activeId, maxVisibleCount]);
  const visibleIds = new Set(visibleTabs.map((tab) => tab.id));
  const hiddenTabs = tabs.filter((tab) => !visibleIds.has(tab.id));

  useEffect(() => {
    setOverflowOpen(false);
    setTabMenuOpenId(null);
    setClosedMenuOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (!overflowOpen && !tabMenuOpenId) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || overflowMenuRef.current?.contains(target) || tabMenuRef.current?.contains(target)) return;
      setOverflowOpen(false);
      setTabMenuOpenId(null);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOverflowOpen(false);
        setTabMenuOpenId(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [overflowOpen, tabMenuOpenId]);

  useEffect(() => {
    if (!closedMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setClosedMenuOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") setClosedMenuOpen(false); };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [closedMenuOpen]);

  useEffect(() => {
    if (!closedTabs.length) setClosedMenuOpen(false);
  }, [closedTabs.length]);

  useEffect(() => {
    if (!overflowOpen && !tabMenuOpenId) return undefined;
    const updatePositions = () => {
      if (overflowOpen && overflowTriggerRef.current) {
        const rect = overflowTriggerRef.current.getBoundingClientRect();
        const width = overflowMenuRef.current?.offsetWidth || 260;
        setOverflowPosition({
          top: rect.bottom + 6,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        });
      }
      if (tabMenuOpenId && tabMenuTriggerRef.current) {
        const rect = tabMenuTriggerRef.current.getBoundingClientRect();
        const width = tabMenuRef.current?.offsetWidth || 220;
        setTabMenuPosition({
          top: rect.bottom + 6,
          left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        });
      }
    };
    updatePositions();
    window.addEventListener("resize", updatePositions);
    window.addEventListener("scroll", updatePositions, true);
    return () => {
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions, true);
    };
  }, [overflowOpen, tabMenuOpenId, hiddenTabs.length]);

  const handleDrop = (event, targetId) => {
    event.preventDefault();
    const sourceId = dragId.current;
    dragId.current = null;
    if (sourceId && sourceId !== targetId) onReorder?.(sourceId, targetId);
  };

  const renderTab = (tab) => {
    const isActive = activeId === tab.id;
    const mode = tab.isTodoTab ? "todo" : tab.type === "page" || tab.type === "pages" ? "pages" : tab.type || "canvas";
    const isDirty = Boolean(tab.dirty || tab.syncMeta?.syncStatus === "dirty" || tab.syncMeta?.syncStatus === "error" || (isActive && /pending|saving|error/.test(activeStatusClass)));
    return (
      <div className={`canvas-tab-item${isActive ? " is-active" : ""}`} key={tab.id}>
        <button
          type="button"
          role="tab"
          className={`canvas-tab${isActive ? " is-active" : ""}`}
          aria-selected={isActive}
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
          onClick={() => { setOverflowOpen(false); setTabMenuOpenId(null); onSelect?.(tab.id); }}
          onDoubleClick={() => {
            if (tab.isTodoTab) return;
            onSelect?.(tab.id);
            setTabMenuOpenId(null);
            onRename?.(tab.id);
          }}
          disabled={disabled}
        >
          {tab.isTodoTab ? <TodoGlyph /> : <WorkspaceModeIcon mode={mode} className={`canvas-tab-icon canvas-tab-icon--${mode}`} />}
          <span className="canvas-tab-name">{getTabDisplayName(tab.name)}</span>
          {isDirty && <span className="canvas-tab-dirty" role="status" aria-label="Unsaved changes" title="Unsaved changes" />}
        </button>
        {isActive && !tab.isTodoTab && (
          <button
            ref={tabMenuTriggerRef}
            type="button"
            className={`canvas-tab-menu-trigger${tabMenuOpenId === tab.id ? " is-open" : ""}`}
            aria-label={`Actions for ${tab.name}`}
            aria-haspopup="menu"
            aria-expanded={tabMenuOpenId === tab.id}
            title="Tab actions"
            onClick={(event) => {
              event.stopPropagation();
              setOverflowOpen(false);
              setTabMenuOpenId((current) => current === tab.id ? null : tab.id);
            }}
            disabled={disabled}
          ><ChevronGlyph /></button>
        )}
        {onClose && <button type="button" className="canvas-tab-close" aria-label={`Close ${tab.name}`} title={`Close ${tab.name}`} onClick={(event) => { event.stopPropagation(); setOverflowOpen(false); setTabMenuOpenId(null); onClose(tab.id); }} disabled={disabled}><CloseGlyph /></button>}
      </div>
    );
  };

  const renderOverflowTab = (tab) => {
    const mode = tab.isTodoTab ? "todo" : tab.type === "page" || tab.type === "pages" ? "pages" : tab.type || "canvas";
    return (
      <div className={`canvas-tabs-overflow-item${activeId === tab.id ? " is-active" : ""}`} role="none" key={tab.id}>
        <button type="button" role="menuitem" className="canvas-tabs-overflow-select" onClick={() => { onSelect?.(tab.id); setOverflowOpen(false); }}>
          {tab.isTodoTab ? <TodoGlyph /> : <WorkspaceModeIcon mode={mode} className={`canvas-tab-icon canvas-tab-icon--${mode}`} />}
          <span className="canvas-tabs-overflow-label" title={tab.name}>{getTabDisplayName(tab.name)}</span>
          {activeId === tab.id && <span className="canvas-tabs-overflow-active-dot" aria-label="Active tab" />}
        </button>
        {onClose && <button type="button" className="canvas-tab-close canvas-tabs-overflow-close" aria-label={`Close ${tab.name}`} title={`Close ${tab.name}`} onClick={() => { setOverflowOpen(false); onClose(tab.id); }} disabled={disabled}><CloseGlyph /></button>}
      </div>
    );
  };

  const activeMenuTab = tabs.find((tab) => tab.id === tabMenuOpenId);

  return (
    <div className="canvas-tabs-bar" ref={rootRef} onContextMenu={(event) => {
      if (!closedTabs.length || !onReopenClosedTab) return;
      event.preventDefault();
      setOverflowOpen(false);
      setTabMenuOpenId(null);
      setClosedMenuOpen(true);
    }}>
      <div className="canvas-tabs-list" role="tablist" aria-label="Workspace tabs">
        {visibleTabs.map(renderTab)}
        <div className="canvas-tab-controls-group">
          {hiddenTabs.length > 0 && (
            <button ref={overflowTriggerRef} type="button" className={`canvas-tabs-overflow-trigger${overflowOpen ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={overflowOpen} aria-label={`${hiddenTabs.length} more tabs`} onClick={() => { setTabMenuOpenId(null); setOverflowOpen((open) => !open); }}>+{hiddenTabs.length}</button>
          )}
          {closedTabs.length > 0 && onReopenClosedTab && (
            <div className="canvas-tabs-closed">
              <button type="button" className={`canvas-tabs-closed-trigger${closedMenuOpen ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={closedMenuOpen} aria-label={`Recently closed canvases (${closedTabs.length})`} title="Recently closed (Ctrl/Cmd+Shift+T reopens the last one)" onClick={() => { setOverflowOpen(false); setTabMenuOpenId(null); setClosedMenuOpen((open) => !open); }} disabled={disabled}><ReopenGlyph /><span className="canvas-tabs-closed-count">{closedTabs.length}</span></button>
              {closedMenuOpen && <div className="canvas-tabs-closed-menu" role="menu" aria-label="Recently closed canvases">
                <div className="canvas-tabs-closed-heading"><strong>Recently closed</strong><span>Local drafts kept in this browser</span></div>
                {closedTabs.map((record) => <div className="canvas-tabs-closed-item" role="none" key={record.closedId}>
                  <button type="button" role="menuitem" className="canvas-tabs-closed-open" title={`Reopen ${record.name}`} onClick={() => { setClosedMenuOpen(false); onReopenClosedTab(record.closedId); }}><span className="canvas-tabs-closed-name">{getTabDisplayName(record.name)}</span><small>{describeClosedAt(record)} · {countLiveElements(record)} {countLiveElements(record) === 1 ? "element" : "elements"}</small></button>
                  {onDeleteClosedTab && <button type="button" className="canvas-tab-close canvas-tabs-closed-delete" aria-label={`Delete draft ${record.name}`} title="Delete this draft permanently" onClick={() => onDeleteClosedTab(record.closedId)}><CloseGlyph /></button>}
                </div>)}
                {onClearClosedTabs && <button type="button" role="menuitem" className="canvas-tabs-closed-clear" onClick={() => { setClosedMenuOpen(false); onClearClosedTabs(); }}>Delete all local drafts</button>}
              </div>}
            </div>
          )}
          {showAddButton && <button type="button" className="canvas-tabs-add" aria-label="Create new canvas" title="Create new canvas" onClick={() => { setOverflowOpen(false); setTabMenuOpenId(null); onCreate?.(); }} disabled={disabled}>+</button>}
        </div>
      </div>
      {overflowOpen && typeof document !== "undefined" && createPortal(
        <div ref={overflowMenuRef} className="canvas-tabs-overflow-menu canvas-tabs-overflow-menu-portal" role="menu" style={overflowPosition ? { top: overflowPosition.top, left: overflowPosition.left } : { visibility: "hidden", top: 0, left: 0 }}>
          <div className="canvas-tabs-overflow-heading">Open tabs <span>{tabs.length}</span></div>
          <div className="canvas-tabs-overflow-scroll">{tabs.map(renderOverflowTab)}</div>
        </div>,
        document.body
      )}
      {tabMenuOpenId && activeMenuTab && typeof document !== "undefined" && createPortal(
        <div ref={tabMenuRef} className="canvas-tabs-tab-menu-portal" role="menu" style={tabMenuPosition ? { top: tabMenuPosition.top, left: tabMenuPosition.left } : { visibility: "hidden", top: 0, left: 0 }}>
          <button type="button" role="menuitem" onClick={() => { setTabMenuOpenId(null); onRename?.(activeMenuTab.id); }}>Rename</button>
          <button type="button" role="menuitem" onClick={() => { setTabMenuOpenId(null); onDuplicate?.(activeMenuTab.id); }}>Duplicate</button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setTabMenuOpenId(null); onClose?.(activeMenuTab.id); }}>Close</button>
          {activeMenu && activeMenuTab.id === activeId && <div className="canvas-tabs-tab-menu-details">{activeMenu}</div>}
        </div>,
        document.body
      )}
      {activeRenameAction && <span className="canvas-tab-inline-rename">{activeRenameAction}</span>}
    </div>
  );
}
