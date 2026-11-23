import { useCallback, useRef, useState } from "react";
import { STUDIO_MODES } from "./yamlPreview.js";
import { BLUEPRINTS } from "./blueprints.js";
import { LOAD_PRESETS, formatRps } from "./trafficSimulator.js";
import { Icon } from "./PrimitiveIcon.jsx";
import { useDismiss } from "./useDismiss.js";

/**
 * One centered pill:  [ Blueprints ▾ ]  |  [ Canvas | K8s Studio | Compose ]  |  [ ▶ Simulate ▾ ]  |  ×
 * While running, Simulate turns emerald and reads  [ ■ Stop Simulation · 10k/s ▾ ].
 *
 * Everything lives in the top-centre on purpose. Sketchizi's own header already owns the top-left (documents, save
 * status) and the top-right/right rail (zoom, date, AI, account), so the studio adds nothing in either corner.
 */
export default function TopWorkspaceBar({ mode, onModeChange, simulate, onSimulateChange, loadRps, onLoadChange, onLoadBlueprint, canEdit = true, onClose }) {
  const [loadOpen, setLoadOpen] = useState(false);
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const simRef = useRef(null);
  const blueprintsRef = useRef(null);
  const closeLoad = useCallback(() => setLoadOpen(false), []);
  const closeBlueprints = useCallback(() => setBlueprintsOpen(false), []);
  useDismiss(simRef, loadOpen, closeLoad);
  useDismiss(blueprintsRef, blueprintsOpen, closeBlueprints);

  return (
    <div className="sd-topbar" role="toolbar" aria-label="System design workspace">
      <div className="sd-surface sd-topbar-pill">
        <div className="sd-blueprints" ref={blueprintsRef}>
          <button type="button" className={`sd-blueprints-btn${blueprintsOpen ? " is-active" : ""}`} aria-haspopup="menu" aria-expanded={blueprintsOpen}
            title="Load a starter architecture" onClick={() => setBlueprintsOpen((open) => !open)}>
            <Icon name="layers" size={14} />
            <span>Blueprints</span>
            <Icon name="chevronDown" size={14} />
          </button>
          {blueprintsOpen && (
            <div className="sd-popover sd-blueprint-menu" role="menu" aria-label="Starter architectures">
              {BLUEPRINTS.map((blueprint) => (
                <button key={blueprint.id} type="button" role="menuitem" disabled={!canEdit}
                  onClick={() => { onLoadBlueprint?.(blueprint.id); setBlueprintsOpen(false); }}>
                  <strong>{blueprint.label}</strong>
                  <small>{blueprint.description}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="sd-divider" aria-hidden="true" />

        <div className="sd-segmented" role="radiogroup" aria-label="Studio mode">
          {STUDIO_MODES.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={mode === item.id}
              className={mode === item.id ? "is-active" : ""} onClick={() => onModeChange(item.id)}>{item.label}</button>
          ))}
        </div>

        <span className="sd-divider" aria-hidden="true" />

        <div className="sd-sim" ref={simRef}>
          <button type="button" className={`sd-sim-main${simulate ? " is-on" : ""}`} aria-pressed={simulate}
            onClick={() => onSimulateChange(!simulate)}
            title={simulate ? "Stop the traffic simulation" : `Simulate traffic at ${formatRps(loadRps)} req/s`}>
            <Icon name={simulate ? "stop" : "play"} />
            {simulate ? (
              <>
                <span>Stop Simulation</span>
                <span className="sd-mono sd-sim-load-label">· {formatRps(loadRps)}/s</span>
              </>
            ) : (
              <span>Simulate</span>
            )}
          </button>
          <button type="button" className={`sd-sim-caret${simulate ? " is-on" : ""}`} aria-label="Choose simulated load"
            aria-haspopup="menu" aria-expanded={loadOpen} onClick={() => setLoadOpen((open) => !open)}>
            <Icon name="chevronDown" size={14} />
          </button>
          {loadOpen && (
            <div className="sd-popover sd-load-menu" role="menu" aria-label="Simulated load">
              {LOAD_PRESETS.map((rps) => (
                <button key={rps} type="button" role="menuitemradio" aria-checked={loadRps === rps}
                  className={`sd-mono${loadRps === rps ? " is-active" : ""}`}
                  onClick={() => { onLoadChange(rps); setLoadOpen(false); }}>
                  {formatRps(rps)} <small>req/s</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="sd-divider" aria-hidden="true" />

        <button type="button" className="sd-icon-btn" aria-label="Close system design studio" title="Close studio" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
