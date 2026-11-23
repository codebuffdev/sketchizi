import { STUDIO_MODES } from "./yamlPreview.js";
import { persistencePill } from "./persistencePill.js";
import { LOAD_PRESETS, formatRps } from "./trafficSimulator.js";

export default function TopWorkspaceBar({
  canvasTabs = [], activeCanvasId, onSelectTab, onCreateTab, saveStatus,
  mode, onModeChange, simulate, onSimulateChange, loadRps, onLoadChange,
  snapEnabled, onSnapChange, zoom, onZoom, onClose,
}) {
  const pill = persistencePill(saveStatus);
  const tabs = canvasTabs.filter((tab) => !tab.isTodoTab);
  return (
    <div className="sd-topbar" role="toolbar" aria-label="System design workspace">
      <div className="sd-surface sd-topbar-left">
        <div className="sd-tabs" role="tablist" aria-label="Documents">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeCanvasId}
              className={`sd-tab${tab.id === activeCanvasId ? " is-active" : ""}`} onClick={() => onSelectTab?.(tab.id)} title={tab.name}>
              {tab.name || "Untitled"}
            </button>
          ))}
          <button type="button" className="sd-icon-btn" aria-label="New tab" title="New tab" onClick={() => onCreateTab?.()}>+</button>
        </div>
        <span className={`sd-persist is-${pill.tone}${pill.busy ? " is-busy" : ""}`} role="status" aria-live="polite">
          <i aria-hidden="true" />{pill.label}
        </span>
      </div>

      <div className="sd-surface sd-segmented" role="radiogroup" aria-label="Studio mode">
        {STUDIO_MODES.map((item) => (
          <button key={item.id} type="button" role="radio" aria-checked={mode === item.id}
            className={mode === item.id ? "is-active" : ""} onClick={() => onModeChange(item.id)}>{item.label}</button>
        ))}
      </div>

      <div className="sd-surface sd-topbar-right">
        <button type="button" className={`sd-sim-btn${simulate ? " is-on" : ""}`} aria-pressed={simulate} onClick={() => onSimulateChange(!simulate)}
          title={simulate ? "Pause traffic simulation" : "Simulate traffic"}>
          <span aria-hidden="true">{simulate ? "❚❚" : "▶"}</span> Simulate Traffic
        </button>
        <div className="sd-presets" role="group" aria-label="Load preset">
          {LOAD_PRESETS.map((rps) => (
            <button key={rps} type="button" className={`sd-mono${loadRps === rps ? " is-active" : ""}`} aria-pressed={loadRps === rps} onClick={() => onLoadChange(rps)}>{formatRps(rps)}</button>
          ))}
          <span className="sd-mono sd-unit">req/s</span>
        </div>
        <button type="button" className={`sd-chip${snapEnabled ? " is-on" : ""}`} aria-pressed={snapEnabled} onClick={() => onSnapChange(!snapEnabled)} title="Snap to grid">Snap</button>
        <div className="sd-zoom" role="group" aria-label="Zoom">
          <button type="button" className="sd-icon-btn" aria-label="Zoom out" onClick={() => onZoom(zoom - 0.1)}>−</button>
          <button type="button" className="sd-mono sd-zoom-value" aria-label="Reset zoom to 100%" onClick={() => onZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="sd-icon-btn" aria-label="Zoom in" onClick={() => onZoom(zoom + 0.1)}>+</button>
        </div>
        <button type="button" className="sd-icon-btn" aria-label="Close system design studio" title="Close studio" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
