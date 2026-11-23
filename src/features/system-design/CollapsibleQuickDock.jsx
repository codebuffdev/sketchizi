import { useCallback, useEffect, useRef, useState } from "react";
import { PRIMITIVES, morePrimitivesByCategory, quickPrimitives } from "./primitives.js";
import { Icon, PrimitiveIcon } from "./PrimitiveIcon.jsx";
import { useDismiss } from "./useDismiss.js";

const shortcutFor = (kind) => {
  const index = PRIMITIVES.findIndex((item) => item.kind === kind);
  return index >= 0 && index < 9 ? index + 1 : null;
};

/**
 * Compact floating dock, bottom-centre:  [ Client  Gateway  Service  Database  Cache  Queue ] | + More | layout, snap
 *
 * Only the six most common primitives are always visible. The other ten live in the "+ More" popover (collapsed by
 * default), so there is no 16-item list parked on the canvas. Clicking a primitive places it next to the selected
 * node and connects the two (see planPlacement / addNode); with nothing selected it lands in free space near the centre.
 */
export default function CollapsibleQuickDock({ onAdd, onAutoLayout, snapEnabled, onSnapChange, canEdit }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const wrapRef = useRef(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismiss(wrapRef, moreOpen, closeMore);

  // Move focus into the popover when it opens so the keyboard path is: "+ More" -> Enter -> Tab through items -> Esc.
  useEffect(() => {
    if (moreOpen) wrapRef.current?.querySelector(".sd-more-menu button")?.focus({ preventScroll: true });
  }, [moreOpen]);

  const add = (kind) => { onAdd(kind); setMoreOpen(false); };
  const hint = (item) => {
    const key = shortcutFor(item.kind);
    return `${item.label}${key ? ` (${key})` : ""} — placed next to the selected node and connected`;
  };

  return (
    <nav className="sd-surface sd-dock" aria-label="System design primitives">
      <div className="sd-dock-quick">
        {quickPrimitives().map((item) => (
          <button key={item.kind} type="button" className="sd-dock-item" disabled={!canEdit} onClick={() => add(item.kind)}
            title={hint(item)} aria-label={`Add ${item.label}`}>
            <PrimitiveIcon kind={item.kind} />
            <span>{item.shortLabel}</span>
          </button>
        ))}
      </div>

      <span className="sd-divider" aria-hidden="true" />

      <div className="sd-more" ref={wrapRef}>
        <button type="button" className={`sd-dock-item sd-more-trigger${moreOpen ? " is-active" : ""}`} aria-haspopup="menu"
          aria-expanded={moreOpen} disabled={!canEdit} onClick={() => setMoreOpen((open) => !open)} title="More primitives">
          <Icon name="plus" />
          <span>More</span>
        </button>
        {moreOpen && (
          <div className="sd-popover sd-more-menu" role="menu" aria-label="More primitives">
            {morePrimitivesByCategory().map((category) => (
              <section key={category.id} aria-label={category.label}>
                <h3>{category.label}</h3>
                <div className="sd-more-grid">
                  {category.items.map((item) => (
                    <button key={item.kind} type="button" role="menuitem" className="sd-more-item" onClick={() => add(item.kind)} title={hint(item)}>
                      <PrimitiveIcon kind={item.kind} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <span className="sd-divider" aria-hidden="true" />

      <div className="sd-dock-tools">
        <button type="button" className="sd-icon-btn" disabled={!canEdit} onClick={onAutoLayout} aria-label="Auto-layout" title="Auto-layout the graph">
          <Icon name="layout" />
        </button>
        <button type="button" className={`sd-icon-btn${snapEnabled ? " is-on" : ""}`} aria-pressed={snapEnabled} onClick={() => onSnapChange(!snapEnabled)}
          aria-label="Snap to grid" title={snapEnabled ? "Snap to grid: on" : "Snap to grid: off"}>
          <Icon name="grid" />
        </button>
      </div>
    </nav>
  );
}
