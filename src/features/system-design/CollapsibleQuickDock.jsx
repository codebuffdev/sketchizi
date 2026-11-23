import { quickPrimitives } from "./primitives.js";
import { Icon, PrimitiveIcon } from "./PrimitiveIcon.jsx";

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
export default function CollapsibleQuickDock({ onAdd, onOpenIconLibrary, onAutoLayout, snapEnabled, onSnapChange, canEdit }) {
  const add = (kind) => onAdd(kind);
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

      <button type="button" className="sd-dock-item sd-more-trigger" disabled={!canEdit}
        onClick={onOpenIconLibrary} title="Open all 16 System Design primitives in Icon Library"
        aria-label="More System Design primitives">
        <Icon name="plus" />
        <span>More</span>
      </button>

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
