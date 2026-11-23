import { useState } from "react";
import { PRIMITIVES, primitivesByCategory } from "./primitives.js";

export default function CollapsibleQuickDock({ pinned, onPinnedChange, onAdd, onAutoLayout, canEdit }) {
  const [hover, setHover] = useState(false);
  const expanded = pinned || hover;
  const shortcutFor = (kind) => { const i = PRIMITIVES.findIndex((p) => p.kind === kind); return i >= 0 && i < 9 ? i + 1 : null; };
  return (
    <aside className={`sd-surface sd-dock${expanded ? " is-expanded" : ""}`} aria-label="System design primitives"
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onFocus={() => setHover(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHover(false); }}>
      <button type="button" className="sd-dock-handle" aria-expanded={expanded} aria-label={pinned ? "Unpin primitives dock" : "Pin primitives dock open"}
        onClick={() => onPinnedChange(!pinned)}>
        <span aria-hidden="true">{pinned ? "◂" : "▦"}</span>{expanded && <span>Primitives</span>}
      </button>
      {expanded && (
        <div className="sd-dock-body">
          {primitivesByCategory().map((category) => (
            <section key={category.id} className="sd-dock-group" aria-label={category.label}>
              <h3>{category.label}</h3>
              {category.items.map((item) => {
                const key = shortcutFor(item.kind);
                return (
                  <button key={item.kind} type="button" className={`sd-dock-item is-${item.accent}`} disabled={!canEdit}
                    onClick={() => onAdd(item.kind)} title={key ? `${item.label} (${key})` : item.label}>
                    <i aria-hidden="true" />
                    <span>{item.label}</span>
                    {key && <kbd className="sd-mono">{key}</kbd>}
                  </button>
                );
              })}
            </section>
          ))}
          <button type="button" className="sd-dock-layout" disabled={!canEdit} onClick={onAutoLayout}>Auto-Layout</button>
        </div>
      )}
    </aside>
  );
}
