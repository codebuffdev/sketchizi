import { useCallback, useRef, useState } from "react";
import { STUDIO_MODES } from "./yamlPreview.js";
import { BLUEPRINTS } from "./blueprints.js";
import { LOAD_PRESETS, formatRps } from "./trafficSimulator.js";
import { useDismiss } from "./useDismiss.js";
import ExportStackModal from "./ExportStackModal.jsx";

const ICONS = {
  plus: <><path d="M12 5v14M5 12h14" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  play: <><path d="m8 5 12 7-12 7V5Z" /></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="1" /></>,
  chevron: <><path d="m7 10 5 5 5-5" /></>,
};

function ToolbarIcon({ name, light = false }) {
  return (
    <svg className="sd-command-icon" width="17" height="17" viewBox="0 0 24 24"
      fill="none" stroke={light ? "#ffffff" : "#1e293b"} strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

function IconButton({ label, shortcut, children, className = "", ...props }) {
  const tooltip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button type="button" className={`sd-command-icon-btn ${className}`.trim()}
      aria-label={label} title={tooltip} data-tooltip={tooltip} {...props}>
      {children}
    </button>
  );
}

/**
 * Compact three-zone command pill. All toolbar glyphs are local SVGs with explicit
 * slate/white strokes so their contrast never depends on inherited icon color.
 */
export default function TopWorkspaceBar({
  mode, onModeChange, simulate, onSimulateChange, loadRps, onLoadChange,
  onLoadBlueprint, canEdit = true, onClose, nodes = [], edges = [],
  diagnostic = null, inspectorOpen = false, onToggleInspector, onOpenIconLibrary,
}) {
  const [loadOpen, setLoadOpen] = useState(false);
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const simRef = useRef(null);
  const blueprintsRef = useRef(null);
  const closeLoad = useCallback(() => setLoadOpen(false), []);
  const closeBlueprints = useCallback(() => setBlueprintsOpen(false), []);
  useDismiss(simRef, loadOpen, closeLoad);
  useDismiss(blueprintsRef, blueprintsOpen, closeBlueprints);

  return (
    <div className="sd-topbar" role="toolbar" aria-label="System design workspace">
      <div className="sd-surface sd-topbar-pill">
        <div className="sd-command-zone sd-command-zone-start">
          <IconButton label="Add Component" shortcut="A" onClick={onOpenIconLibrary} disabled={!canEdit}>
            <ToolbarIcon name="plus" />
          </IconButton>
          <div className="sd-blueprints" ref={blueprintsRef}>
            <IconButton label="Blueprints" shortcut="B" className={blueprintsOpen ? "is-active" : ""}
              aria-haspopup="menu" aria-expanded={blueprintsOpen}
              onClick={() => setBlueprintsOpen((open) => !open)}>
              <ToolbarIcon name="layers" />
            </IconButton>
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
        </div>

        <span className="sd-divider sd-command-divider" aria-hidden="true" />

        <div className="sd-segmented sd-command-modes" role="radiogroup" aria-label="Studio mode">
          {STUDIO_MODES.map((item) => {
            const label = item.id === "k8s" ? "K8s" : item.label;
            return (
              <button key={item.id} type="button" role="radio" aria-checked={mode === item.id}
                className={mode === item.id ? "is-active" : ""}
                onClick={() => onModeChange(item.id)}>{label}</button>
            );
          })}
        </div>

        <span className="sd-divider sd-command-divider" aria-hidden="true" />

        <div className="sd-command-zone sd-command-zone-actions">
          <div className="sd-sim sd-command-sim" ref={simRef}>
            <button type="button" className={`sd-sim-main sd-command-sim-main${simulate ? " is-on" : ""}`}
              aria-pressed={simulate} onClick={() => onSimulateChange(!simulate)}
              title={simulate ? "Stop simulation" : "Simulate traffic"}>
              <ToolbarIcon name={simulate ? "stop" : "play"} light={Boolean(simulate)} />
              <span>Simulate</span>
            </button>
            <button type="button" className={`sd-sim-caret sd-command-sim-caret${simulate ? " is-on" : ""}`}
              aria-label={`Choose simulated load, currently ${formatRps(loadRps)}`}
              aria-haspopup="menu" aria-expanded={loadOpen}
              onClick={() => setLoadOpen((open) => !open)}>
              <span className="sd-command-load">{formatRps(loadRps)}</span>
              <ToolbarIcon name="chevron" light={Boolean(simulate)} />
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

          <IconButton label="Export Stack" shortcut="E" onClick={() => setExportOpen(true)}
            disabled={!nodes.length}>
            <ToolbarIcon name="download" />
          </IconButton>
          <IconButton label="Inspector & YAML" shortcut="I"
            className={inspectorOpen ? "is-open" : ""} aria-pressed={inspectorOpen}
            onClick={onToggleInspector}>
            <ToolbarIcon name="panel" />
          </IconButton>
          <IconButton label="Exit Studio" className="sd-command-exit" onClick={onClose}>
            <ToolbarIcon name="close" />
          </IconButton>
        </div>
      </div>
      {diagnostic && <div className={`sd-diagnostic is-${diagnostic.tone}`} role="status" aria-live="polite">{diagnostic.message}</div>}
      {exportOpen && <ExportStackModal nodes={nodes} edges={edges} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
