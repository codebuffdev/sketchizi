import { useEffect, useState } from "react";
import { ACCENTS, HEALTH_OVERRIDES, PROTOCOLS } from "./primitives.js";
import { formatRps } from "./trafficSimulator.js";
import { nodeYaml } from "./yamlPreview.js";

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

export default function ContextualInspectorDrawer({ selection, mode, simulation, simulate, actions, canEdit }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!selection) return null; // Hidden when nothing (or more than one thing) is selected.
  const { kind, item } = selection;
  const isNode = kind === "node";
  const telemetry = isNode ? simulation?.nodes[item.id] : null;
  const edgeLive = !isNode ? simulation?.edges[item.id] : null;
  const yamlMode = mode === "compose" ? "compose" : "k8s";
  const patchNode = (partial, transient = false) => actions.updateNodeMeta(item.id, partial, { transient });

  return (
    <>
      <div className="sd-surface sd-pill-bar" role="toolbar" aria-label={isNode ? "Node options" : "Connector options"}>
        {isNode ? (
          <input className="sd-inline-input" aria-label="Label" value={item.label} maxLength={60} disabled={!canEdit}
            onChange={(e) => patchNode({ label: e.target.value }, true)} onBlur={(e) => patchNode({ label: e.target.value.trim() || item.label })} onKeyDown={(e) => e.stopPropagation()} />
        ) : (
          <span className="sd-pill-title">Connector</span>
        )}
        {isNode && (
          <div className="sd-seg-mini" role="radiogroup" aria-label="Accent">
            {ACCENTS.map((a) => <button key={a} type="button" role="radio" aria-checked={item.accent === a} aria-label={a} title={a} disabled={!canEdit}
              className={`sd-swatch is-${a}${item.accent === a ? " is-active" : ""}`} onClick={() => patchNode({ accent: a })} />)}
          </div>
        )}
        {!isNode && (
          <div className="sd-seg-mini" role="radiogroup" aria-label="Line style">
            {["solid", "dashed"].map((s) => <button key={s} type="button" role="radio" aria-checked={item.lineStyle === s} disabled={!canEdit}
              className={item.lineStyle === s ? "is-active" : ""} onClick={() => actions.updateEdge(item.id, { lineStyle: s })}>{s}</button>)}
          </div>
        )}
        {isNode && (
          <div className="sd-seg-mini" role="radiogroup" aria-label="Health override">
            {HEALTH_OVERRIDES.map((h) => <button key={h} type="button" role="radio" aria-checked={item.health === h} disabled={!canEdit}
              className={`is-health-${h}${item.health === h ? " is-active" : ""}`} onClick={() => patchNode({ health: h })}>{HEALTH_LABEL[h]}</button>)}
          </div>
        )}
        <button type="button" className="sd-icon-btn is-danger" aria-label="Delete" title="Delete" disabled={!canEdit} onClick={actions.deleteSelection}>🗑</button>
      </div>

      <aside className={`sd-surface sd-drawer${collapsed ? " is-collapsed" : ""}`} aria-label="Telemetry and YAML">
        <button type="button" className="sd-drawer-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? "◂" : "▸"}<span>{collapsed ? "" : isNode ? item.label : `${item.protocol} connector`}</span>
        </button>
        {!collapsed && (
          <div className="sd-drawer-body">
            {isNode ? (
              <>
                <div className="sd-readouts">
                  <div><small>RPS</small><b className="sd-mono">{simulate && telemetry ? formatRps(telemetry.incomingRps) : "—"}</b></div>
                  <div><small>p95</small><b className="sd-mono">{simulate && telemetry ? (telemetry.p95Ms == null ? "—" : `${telemetry.p95Ms}ms`) : "—"}</b></div>
                  <div><small>Util</small><b className="sd-mono">{simulate && telemetry ? `${Number.isFinite(telemetry.utilization) ? Math.round(telemetry.utilization * 100) : "∞"}%` : "—"}</b></div>
                  <div className={telemetry ? `s-${telemetry.status}` : ""}><small>Status</small><b className="sd-mono">{simulate && telemetry ? STATUS_LABEL[telemetry.status] : "idle"}</b></div>
                </div>
                <Slider label="Replicas" value={item.replicas} min={0} max={20} disabled={!canEdit} onLive={(v) => patchNode({ replicas: v }, true)} onCommit={(v) => patchNode({ replicas: v })} />
                <Slider label="Capacity / replica (RPS)" value={item.capacityPerReplica} min={100} max={50000} step={100} disabled={!canEdit} format={(v) => formatRps(v)} onLive={(v) => patchNode({ capacityPerReplica: v }, true)} onCommit={(v) => patchNode({ capacityPerReplica: v })} />
                {(item.kind === "redis" || item.kind === "cdn") && (
                  <Slider label="Cache hit rate" value={Math.round(item.cacheHitRate * 100)} min={0} max={100} disabled={!canEdit} format={(v) => `${v}%`} onLive={(v) => patchNode({ cacheHitRate: v / 100 }, true)} onCommit={(v) => patchNode({ cacheHitRate: v / 100 })} />
                )}
                <div className="sd-meta sd-mono"><span>{item.protocol}</span><span>:{item.port}</span><span>{item.image}</span></div>
                <div className="sd-yaml-head sd-mono">{yamlMode === "compose" ? "docker-compose.yml" : "deployment.yaml"}</div>
                <pre className="sd-yaml sd-mono" aria-label="Live YAML preview">{nodeYaml(yamlMode, item) || "# External node — no container image."}</pre>
              </>
            ) : (
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
            )}
          </div>
        )}
      </aside>
    </>
  );
}
