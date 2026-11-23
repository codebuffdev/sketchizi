import { useEffect, useRef, useState } from "react";
import { ACCENTS, HEALTH_OVERRIDES, PROTOCOLS } from "./primitives.js";
import { formatRps } from "./trafficSimulator.js";
import { nodeYaml } from "./yamlPreview.js";

const DRAWER_TABS = [{ id: "config", label: "Config & Load" }, { id: "yaml", label: "Node YAML" }];
const YAML_KINDS = [{ id: "k8s", label: "Kubernetes", file: "deployment.yaml" }, { id: "compose", label: "Compose", file: "docker-compose.yml" }];
import { Icon, PrimitiveIcon } from "./PrimitiveIcon.jsx";

const HEALTH_LABEL = { healthy: "Healthy", degraded: "Degraded", down: "Down" };
const STATUS_LABEL = { healthy: "Healthy", elevated: "Elevated", overloaded: "Overloaded", down: "Down" };

function Slider({ label, value, min, max, step = 1, format = (v) => v, onLive, onCommit, disabled }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => onCommit(Number(local));
  return (
    <label className="sd-slider">
      <span>{label}<b className="sd-mono">{format(local)}</b></span>
      <input type="range" min={min} max={Math.max(max, local)} step={step} value={local} disabled={disabled}
        onChange={(e) => { setLocal(Number(e.target.value)); onLive(Number(e.target.value)); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}

/**
 * Selection UI, in two deliberately separate layers:
 *  1. A compact contextual pill under the studio bar, shown only while exactly one node/connector is selected:
 *       node:       [icon] Auth / IAM  |  Healthy · Degraded · Down  |  YAML ▾  | trash
 *       connector:  Connector          |  Solid · Dashed            |  Inspect ▾ | trash
 *  2. The telemetry / YAML drawer on the right. It is CLOSED by default and opens only when the person clicks YAML / Inspect.
 */
export default function ContextualInspectorDrawer({ selection, mode, simulation, simulate, actions, canEdit, open, tab, onTabChange, onOpenInspector, onClose }) {
  const [wide, setWide] = useState(false); // 380px default, 640px expanded; remembered while the studio is open
  const [yamlKind, setYamlKind] = useState(null); // null = follow the studio mode
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const selectedId = selection?.item?.id;
  useEffect(() => { onTabChange("config"); setCopied(false); }, [selectedId, onTabChange]);

  const item = selection?.item || null;
  const isNode = selection?.kind === "node";
  const isEdge = selection?.kind === "edge";
  const telemetry = isNode ? simulation?.nodes[item.id] : null;
  const edgeLive = isEdge ? simulation?.edges[item.id] : null;
  const yamlMode = yamlKind || (mode === "compose" ? "compose" : "k8s");
  const yamlFile = YAML_KINDS.find((k) => k.id === yamlMode)?.file;
  const yamlText = isNode ? nodeYaml(yamlMode, item) || "# External node — no container image." : "";
  const activeTab = isNode ? tab : "config"; // connectors have no manifest, so no tabs
  const patchNode = (partial, transient = false) => actions.updateNodeMeta(item.id, partial, { transient });
  const toggleLabel = isNode ? "YAML" : "Inspect";
  const copyYaml = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(yamlText);
      else {
        const area = document.createElement("textarea");
        area.value = yamlText; area.setAttribute("readonly", ""); area.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  };

  return (
    <>
      {selection && <div className="sd-surface sd-pill-bar" role="toolbar" aria-label={isNode ? "Node options" : "Connector options"}>
        {isNode ? (
          <>
            <PrimitiveIcon kind={item.kind} accent={item.accent} />
            <input className="sd-inline-input" aria-label="Label" value={item.label} maxLength={60} disabled={!canEdit}
              onChange={(e) => patchNode({ label: e.target.value }, true)} onBlur={(e) => patchNode({ label: e.target.value.trim() || item.label })} onKeyDown={(e) => e.stopPropagation()} />
          </>
        ) : (
          <span className="sd-pill-title">Connector</span>
        )}

        {isNode && <>
          <span className="sd-divider" aria-hidden="true" />
          <div className="sd-replica-stepper" role="group" aria-label="Replicas">
            <span>Replicas</span>
            <button type="button" aria-label="Decrease replicas" disabled={!canEdit || item.replicas <= 0}
              onClick={() => patchNode({ replicas: Math.max(0, item.replicas - 1) })}>−</button>
            <b className="sd-mono">{item.replicas}</b>
            <button type="button" aria-label="Increase replicas" disabled={!canEdit || item.replicas >= 500}
              onClick={() => patchNode({ replicas: Math.min(500, item.replicas + 1) })}>+</button>
          </div>
        </>}

        <span className="sd-divider" aria-hidden="true" />

        {isNode ? (
          <div className="sd-seg-mini" role="radiogroup" aria-label="Health override">
            {HEALTH_OVERRIDES.map((h) => <button key={h} type="button" role="radio" aria-checked={item.health === h} disabled={!canEdit}
              className={`is-health-${h}${item.health === h ? " is-active" : ""}`} onClick={() => patchNode({ health: h })}>{HEALTH_LABEL[h]}</button>)}
          </div>
        ) : (
          <>
          <label className="sd-edge-protocol-wrap"><span>Protocol</span>
            <select className="sd-edge-protocol" aria-label="Protocol" value={item.protocol} disabled={!canEdit}
              onChange={(event) => actions.updateEdge(item.id, { protocol: event.target.value })}>
              {PROTOCOLS.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
            </select>
          </label>
          <div className="sd-seg-mini" role="radiogroup" aria-label="Line style">
            {["solid", "dashed"].map((s) => <button key={s} type="button" role="radio" aria-checked={item.lineStyle === s} disabled={!canEdit}
              className={item.lineStyle === s ? "is-active" : ""} onClick={() => actions.updateEdge(item.id, { lineStyle: s })}>{s}</button>)}
          </div>
          </>
        )}

        <span className="sd-divider" aria-hidden="true" />

        <button type="button" className={`sd-pill-toggle${open ? " is-active" : ""}`} aria-expanded={open} aria-controls="sd-inspector-drawer"
          onClick={() => onOpenInspector?.(isNode ? "yaml" : "config")}>
          {toggleLabel}<Icon name={open ? "chevronUp" : "chevronDown"} size={14} />
        </button>
        <button type="button" className="sd-icon-btn is-danger" aria-label="Delete" title="Delete" disabled={!canEdit || !selection} onClick={actions.deleteSelection}>
          <Icon name="trash" />
        </button>
      </div>}

      {open && (
        <aside id="sd-inspector-drawer" className={`sd-surface sd-drawer${wide ? " is-wide" : ""}${activeTab === "yaml" ? " is-yaml" : ""}`} aria-label="Telemetry and YAML">
          <header className="sd-drawer-head">
            <strong>{isNode ? item.label : isEdge ? `${item.protocol} connector` : "Telemetry & YAML"}</strong>
            <span className="sd-drawer-actions">
              <button type="button" className="sd-expand-btn" aria-pressed={wide} onClick={() => setWide((v) => !v)}
                title={wide ? "Back to the compact 380px drawer" : "Widen the drawer to 640px"}>
                <Icon name={wide ? "shrink" : "expand"} size={13} />{wide ? "Compact" : "Expand"}
              </button>
              <button type="button" className="sd-icon-btn" aria-label="Close inspector" title="Close" onClick={onClose}><Icon name="close" /></button>
            </span>
          </header>
          {isNode && (
            <div className="sd-inspector-tabs" role="tablist" aria-label="Inspector sections">
              {DRAWER_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" id={`sd-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`sd-panel-${t.id}`}
                  className={tab === t.id ? "is-active" : ""} onClick={() => onTabChange(t.id)}>{t.label}</button>
              ))}
            </div>
          )}
          {!selection ? (
            <div className="sd-drawer-body sd-inspector-empty">
              <strong>System Design Inspector</strong>
              <p>Select a node or connector to inspect live telemetry, configuration, and YAML. This panel stays available while you work on the canvas.</p>
              <div className="sd-readouts">
                <div><small>Simulation</small><b className="sd-mono">{simulate ? "Running" : "Idle"}</b></div>
                <div><small>Selected item</small><b className="sd-mono">None</b></div>
              </div>
            </div>
          ) : isNode && activeTab === "yaml" ? (
            <div className="sd-yaml-panel" role="tabpanel" id="sd-panel-yaml" aria-labelledby="sd-tab-yaml">
              <div className="sd-yaml-bar">
                <div className="sd-seg-mini" role="radiogroup" aria-label="Manifest format">
                  {YAML_KINDS.map((k) => (
                    <button key={k.id} type="button" role="radio" aria-checked={yamlMode === k.id} className={yamlMode === k.id ? "is-active" : ""} onClick={() => setYamlKind(k.id)}>{k.label}</button>
                  ))}
                </div>
                <span className="sd-yaml-file sd-mono">{yamlFile}</span>
                <button type="button" className={`sd-copy-btn${copied ? " is-done" : ""}`} onClick={copyYaml} aria-live="polite">
                  <Icon name={copied ? "check" : "copy"} size={13} />{copied ? "Copied" : "Copy YAML"}
                </button>
              </div>
              <pre className="sd-yaml sd-mono" tabIndex={0} aria-label="Live YAML preview">{yamlText}</pre>
            </div>
          ) : (
            <div className="sd-drawer-body" role={isNode ? "tabpanel" : undefined} id={isNode ? "sd-panel-config" : undefined} aria-labelledby={isNode ? "sd-tab-config" : undefined}>
              {isNode ? (
                <>
                  <div className="sd-readouts">
                    <div><small>RPS</small><b className="sd-mono">{simulate && telemetry ? formatRps(telemetry.incomingRps) : "—"}</b></div>
                    <div><small>p95</small><b className="sd-mono">{simulate && telemetry ? (telemetry.p95Ms == null ? "—" : `${telemetry.p95Ms}ms`) : "—"}</b></div>
                    <div><small>Util</small><b className="sd-mono">{simulate && telemetry ? `${Number.isFinite(telemetry.utilization) ? Math.round(telemetry.utilization * 100) : "∞"}%` : "—"}</b></div>
                    <div className={telemetry ? `s-${telemetry.status}` : ""}><small>Status</small><b className="sd-mono">{simulate && telemetry ? STATUS_LABEL[telemetry.status] : "idle"}</b></div>
                  </div>
                  {!simulate && <p className="sd-hint">Press <b>Simulate</b> in the top bar to see live load on this node.</p>}
                  <Slider label="Replicas" value={item.replicas} min={0} max={20} disabled={!canEdit} onLive={(v) => patchNode({ replicas: v }, true)} onCommit={(v) => patchNode({ replicas: v })} />
                  <Slider label="Capacity / replica (RPS)" value={item.capacityPerReplica} min={100} max={50000} step={100} disabled={!canEdit} format={(v) => formatRps(v)} onLive={(v) => patchNode({ capacityPerReplica: v }, true)} onCommit={(v) => patchNode({ capacityPerReplica: v })} />
                  {(item.kind === "redis" || item.kind === "cdn") && (
                    <Slider label="Cache hit rate" value={Math.round(item.cacheHitRate * 100)} min={0} max={100} disabled={!canEdit} format={(v) => `${v}%`} onLive={(v) => patchNode({ cacheHitRate: v / 100 }, true)} onCommit={(v) => patchNode({ cacheHitRate: v / 100 })} />
                  )}
                  <div className="sd-field"><span>Accent</span>
                    <div className="sd-seg-mini" role="radiogroup" aria-label="Accent">
                      {ACCENTS.map((a) => <button key={a} type="button" role="radio" aria-checked={item.accent === a} aria-label={a} title={a} disabled={!canEdit}
                        className={`sd-swatch is-${a}${item.accent === a ? " is-active" : ""}`} onClick={() => patchNode({ accent: a })} />)}
                    </div>
                  </div>
                  <div className="sd-meta sd-mono"><span>{item.protocol}</span><span>:{item.port}</span><span>{item.image}</span></div>
                </>
              ) : isEdge ? (
                <>
                  <div className="sd-readouts">
                    <div><small>RPS</small><b className="sd-mono">{simulate && edgeLive ? formatRps(edgeLive.rps) : "—"}</b></div>
                    <div><small>Protocol</small><b className="sd-mono">{item.protocol}</b></div>
                  </div>
                  <label className="sd-field"><span>Protocol</span>
                    <select value={item.protocol} disabled={!canEdit} onChange={(e) => actions.updateEdge(item.id, { protocol: e.target.value })}>
                      {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                </>
              ) : <p className="sd-hint">Select a System Design node or connector to inspect its configuration.</p>}
            </div>
          )}
        </aside>
      )}
    </>
  );
}
