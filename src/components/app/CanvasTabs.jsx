import { useMemo, useState } from "react";

export default function CanvasTabs({ tabs, activeId, onSelect, onCreate, onReorder, disabled = false }) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const visibleTabs = tabs.slice(0, 3);
  const hiddenTabs = tabs.slice(3);
  const hiddenCount = hiddenTabs.length;
  const dragId = useMemo(() => ({ current: null }), []);

  const handleDrop = (event, targetId) => {
    event.preventDefault();
    const sourceId = dragId.current;
    dragId.current = null;
    if (sourceId && sourceId !== targetId) onReorder?.(sourceId, targetId);
  };

  return (
    <div className="canvas-tabs-bar" role="tablist" aria-label="Open canvases">
      <div className="canvas-tabs-list">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`canvas-tab${activeId === tab.id ? " is-active" : ""}`}
            aria-selected={activeId === tab.id}
            title={tab.name}
            draggable={!disabled}
            onDragStart={(event) => {
              dragId.current = tab.id;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", tab.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, tab.id)}
            onDragEnd={() => { dragId.current = null; }}
            onClick={() => onSelect?.(tab.id)}
            disabled={disabled}
          >
            <span className="canvas-tab-name">{tab.name}</span>
            {tab.dirty && <span className="canvas-tab-dirty" aria-label="Unsaved changes" />}
          </button>
        ))}
        {hiddenCount > 0 && (
          <div className="canvas-tabs-overflow">
            <button
              type="button"
              className={`canvas-tabs-overflow-trigger${overflowOpen ? " is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((open) => !open)}
            >
              +{hiddenCount}
            </button>
            {overflowOpen && (
              <div className="canvas-tabs-overflow-menu" role="menu">
                {hiddenTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="menuitem"
                    className={activeId === tab.id ? "is-active" : ""}
                    onClick={() => { onSelect?.(tab.id); setOverflowOpen(false); }}
                  >
                    <span>{tab.name}</span>
                    {tab.dirty && <span className="canvas-tab-dirty" aria-label="Unsaved changes" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="canvas-tabs-add"
          aria-label="Create new canvas"
          title="Create new canvas"
          onClick={onCreate}
          disabled={disabled}
        >
          +
        </button>
      </div>
    </div>
  );
}
