import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PORTS, choosePorts, getPortPoint, nearestPort, pointAlong, roundedPath, routeOrthogonal } from "./orthogonalRouter.js";
import { nodeFacets, serviceNames } from "./yamlPreview.js";
import { formatRps, packetCountForRps, nodeCapacity } from "./trafficSimulator.js";
import { PrimitiveIcon } from "./PrimitiveIcon.jsx";
import { isConnectKeyBlockedTarget, isConnectKeyEvent, resolveConnectKeyAction } from "./connectKeyboard.js";
import { registerPlainCKeyClaim } from "../canvas/codeBlock/codeBlockShortcut.js";

const STATUS_LABEL = { healthy: "Healthy", elevated: "Elevated", overloaded: "Overloaded", lagging: "Lagging", down: "Down" };
const stop = (event) => event.stopPropagation();

// `margin` (scene px) widens the hit area so ports, which straddle the card edge, stay reachable: the pointer
// is still "on" the node while it travels from the card body onto a port that sits half outside it.
function nodeAt(nodes, point, excludeId, margin = 0) {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i];
    if (n.id !== excludeId && point.x >= n.x - margin && point.x <= n.x + n.width + margin && point.y >= n.y - margin && point.y <= n.y + n.height + margin) return n;
  }
  return null;
}
const PORT_REACH = 20;
const PORT_SNAP = 28; // a drop this close to a port means "that port"

/**
 * Which port of `target` a connector dropped at `point` should enter. Near a port (<= PORT_SNAP): that port, because the
 * person aimed at it. Anywhere else on the card: the port facing the source, which gives the cleanest elbow.
 */
function dropPortFor(source, target, point) {
  const nearest = nearestPort(target, point);
  const p = getPortPoint(target, nearest);
  return Math.hypot(p.x - point.x, p.y - point.y) <= PORT_SNAP ? nearest : choosePorts(source, target).toPort;
}

function LabelEditor({ initial, onDone }) {
  const ref = useRef(null);
  const cancelled = useRef(false);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="sd-label-input" data-sketchizi-inline-editor aria-label="Node name" defaultValue={initial} maxLength={60}
      onPointerDown={stop} onDoubleClick={stop}
      onBlur={(e) => onDone(cancelled.current ? null : e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || (e.key !== "Enter" && e.key !== "Escape")) return;
        e.preventDefault();
        cancelled.current = e.key === "Escape";
        e.currentTarget.blur();
      }} />
  );
}

export default function SystemDesignNodeOverlay({ graph, simulation, mode, snapshot, offset, getHost, actions, canEdit, simulate, onOpenIconLibrary }) {
  const { scrollX, scrollY, zoom, selectedIds } = snapshot;
  const [hoverId, setHoverId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [drag, setDrag] = useState(null); // { fromId, fromPort, point }
  const [armedConnect, setArmedConnect] = useState(null);
  const armedConnectRef = useRef(null);
  const armConnect = (next) => { armedConnectRef.current = next; setArmedConnect(next); };
  const nodesRef = useRef(graph.nodes);
  nodesRef.current = graph.nodes;
  const viewRef = useRef({ scrollX, scrollY, zoom });
  viewRef.current = { scrollX, scrollY, zoom };

  const toScene = useCallback((clientX, clientY) => {
    const host = getHost();
    const rect = host?.getBoundingClientRect();
    const { scrollX: sx, scrollY: sy, zoom: z } = viewRef.current;
    return rect ? { x: (clientX - rect.left) / z - sx, y: (clientY - rect.top) / z - sy } : { x: 0, y: 0 };
  }, [getHost]);

  // Hover tracking + double-click label editing on the Excalidraw host (overlay cards stay pointer-transparent
  // so Excalidraw keeps native drag/select/resize on the underlying rectangle).
  useEffect(() => {
    const host = getHost();
    if (!host) return undefined;
    let frame = 0;
    const onMove = (event) => {
      if (frame) return;
      const { clientX, clientY } = event;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const hit = nodeAt(nodesRef.current, toScene(clientX, clientY), null, PORT_REACH);
        setHoverId((current) => (current === (hit?.id || null) ? current : hit?.id || null));
      });
    };
    const onLeave = () => setHoverId(null);
    const onDouble = (event) => {
      if (!canEdit) return;
      const hit = nodeAt(nodesRef.current, toScene(event.clientX, event.clientY));
      if (!hit) return;
      event.stopPropagation(); // Keep Excalidraw from opening its own bound-text editor.
      event.preventDefault();
      setEditingId(hit.id);
    };
    const onClick = (event) => {
      const armed = armedConnectRef.current;
      if (!canEdit || !armed) return;
      const target = nodeAt(nodesRef.current, toScene(event.clientX, event.clientY), armed.nodeId, 20);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      actions.connect(armed.nodeId, target.id);
      armConnect(null);
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("dblclick", onDouble, true);
    host.addEventListener("click", onClick, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("dblclick", onDouble, true);
      host.removeEventListener("click", onClick, true);
    };
  }, [getHost, toScene, canEdit, actions]);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const names = useMemo(() => serviceNames(graph.nodes), [graph.nodes]);
  const routes = useMemo(() => graph.edges.map((edge) => {
    const a = byId.get(edge.from); const b = byId.get(edge.to);
    return { edge, points: routeOrthogonal(a, edge.fromPort, b, edge.toPort) };
  }), [graph.edges, byId]);

  const beginConnect = (event, node, port) => {
    if (!canEdit) return;
    event.stopPropagation();
    event.preventDefault();
    const armed = armedConnectRef.current;
    if (armed && armed.nodeId !== node.id) {
      const source = byId.get(armed.nodeId);
      const optimal = source ? choosePorts(source, node) : null;
      actions.connect(armed.nodeId, node.id, { fromPort: armed.port || optimal?.fromPort || "right", toPort: port });
      armConnect(null);
      setDrag(null);
      return;
    }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer may already be cancelled */ }
    setDrag({ fromId: node.id, fromPort: port, point: toScene(event.clientX, event.clientY) });
  };
  const moveConnect = (event) => { if (drag) setDrag({ ...drag, point: toScene(event.clientX, event.clientY) }); };
  // Dropping anywhere on a target card connects (to its nearest cardinal port), so one press-drag-release is enough.
  const endConnect = (event) => {
    if (!drag) return;
    const point = toScene(event.clientX, event.clientY);
    const target = nodeAt(graph.nodes, point, drag.fromId, 20);
    const source = byId.get(drag.fromId);
    if (target && source) {
      actions.connect(drag.fromId, target.id, { fromPort: drag.fromPort, toPort: dropPortFor(source, target, point) });
      armConnect(null);
    } else if (source) {
      const sourcePort = getPortPoint(source, drag.fromPort);
      if (Math.hypot(sourcePort.x - point.x, sourcePort.y - point.y) <= 18) armConnect({ nodeId: source.id, port: drag.fromPort });
    }
    setDrag(null);
  };
  const dragFrom = drag ? byId.get(drag.fromId) : null;
  const dropTarget = drag ? nodeAt(graph.nodes, drag.point, drag.fromId, 20) : null;
  const dropPort = dropTarget && dragFrom ? dropPortFor(dragFrom, dropTarget, drag.point) : null;

  // Latest state for the claim below, which is registered once and must not go stale.
  const connectKeyStateRef = useRef(null);
  connectKeyStateRef.current = { canEdit, selectedIds, nodeIds: byId, hoverId };

  // The Code Block tool also owns a plain C through a window-level capture handler that registers at app start,
  // so it ran first and swallowed the key before this overlay could arm a card. Claim exactly the keypresses
  // this overlay will handle so the Code Block tool steps aside only then.
  useEffect(() => registerPlainCKeyClaim((event) => {
    const state = connectKeyStateRef.current;
    if (!state?.canEdit || !isConnectKeyEvent(event) || isConnectKeyBlockedTarget(event.target)) return false;
    return resolveConnectKeyAction({ selectedIds: state.selectedIds, isNode: (id) => state.nodeIds.has(id), hoverId: state.hoverId }) !== null;
  }), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      // Same plain-C condition as isConnectKeyEvent (used by the claim above); kept inline because the
      // guardrail tests pin this exact check in the overlay source.
      if (!canEdit || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || event.key.toLowerCase() !== "c" || isConnectKeyBlockedTarget(event.target)) return;
      const action = resolveConnectKeyAction({ selectedIds, isNode: (id) => byId.has(id), hoverId });
      if (!action) return;
      event.preventDefault(); event.stopPropagation();
      if (action.type === "connect") { actions.connect(action.fromId, action.toId); armConnect(null); }
      else armConnect({ nodeId: action.sourceId, port: null });
    };
    // Escape cancels an armed connection. Other window-level Escape handlers (e.g. the tool dock clearing the
    // selection) stop the keydown before it reaches this overlay, but never the matching keyup.
    const onKeyUp = (event) => {
      if (event.key === "Escape" && armedConnectRef.current) armConnect(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [canEdit, selectedIds, byId, hoverId, actions]);

  const layerStyle = { transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) translate(${scrollX}px, ${scrollY}px)` };

  return (
    <div className="sd-overlay" aria-hidden={false}>
      <div className="sd-layer" style={layerStyle}>
        <svg className="sd-edges" width="1" height="1" overflow="visible" aria-hidden="true">
          <defs>
            <marker id="sd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M1.5 1.5 8 5 1.5 8.5" className="sd-arrow-head" fill="none" />
            </marker>
          </defs>
          {routes.map(({ edge, points }) => {
            const live = simulation?.edges[edge.id];
            const targetStatus = simulation?.nodes[edge.to]?.status;
            const tone = !simulate ? "idle" : (live?.serviceUnavailable || live?.replicaFailed || live?.cycleBlocked) ? "hot" : live?.consumerDown ? "warm" : !live || live.rps <= 0 ? "idle" : targetStatus === "overloaded" || targetStatus === "down" ? "hot" : targetStatus === "elevated" ? "warm" : "ok";
            const d = roundedPath(points);
            const selected = selectedIds.includes(edge.id);
            const packets = simulate && live ? packetCountForRps(live.rps) : 0;
            const duration = Math.max(1.2, 3.4 - Math.log10((live?.rps || 1) + 1) * 0.5);
            return (
              <g key={edge.id} className={`sd-edge is-${tone}${selected ? " is-selected" : ""}${(live?.serviceUnavailable || live?.replicaFailed || live?.consumerDown || live?.cycleBlocked) || edge.lineStyle === "dashed" || (simulate && ["elevated", "overloaded", "down"].includes(targetStatus)) ? " is-dashed" : ""}`}>
                <path id={`sd-path-${edge.id}`} d={d} fill="none" markerEnd="url(#sd-arrow)" />
                {packets > 0 && Array.from({ length: packets }, (_, i) => (
                  <circle key={i} r="3.6" className="sd-packet">
                    <animateMotion dur={`${duration}s`} begin={`${-(duration / packets) * i}s`} repeatCount="indefinite"><mpath href={`#sd-path-${edge.id}`} /></animateMotion>
                  </circle>
                ))}
              </g>
            );
          })}
          {drag && dragFrom && (() => {
            const cursor = { x: drag.point.x, y: drag.point.y, width: 0, height: 0 };
            const previewTarget = dropTarget || cursor;
            const previewPort = dropTarget ? dropPort : choosePorts(dragFrom, cursor).toPort;
            return <path className={`sd-edge-preview${dropTarget ? " is-snapped" : ""}`} fill="none"
              d={roundedPath(routeOrthogonal(dragFrom, drag.fromPort, previewTarget, previewPort))} />;
          })()}
        </svg>

        {routes.map(({ edge, points }) => {
          const mid = pointAlong(points, 0.5);
          const live = simulate ? simulation?.edges[edge.id] : null;
          const flowing = Boolean(live && live.rps > 0);
          const healthFailed = Boolean(live?.serviceUnavailable || live?.replicaFailed || live?.cycleBlocked);
          const tone = !live ? "" : healthFailed ? " is-hot" : !flowing ? " is-idle" : ` is-${simulation?.nodes[edge.to]?.status === "overloaded" || simulation?.nodes[edge.to]?.status === "down" ? "hot" : simulation?.nodes[edge.to]?.status === "elevated" ? "warm" : "ok"}`;
          if (!flowing && !healthFailed) return null;
          return (
            <span key={edge.id} className={`sd-badge sd-mono is-live${tone}${healthFailed ? " is-health-failed" : live.consumerDown ? " is-buffered" : ""}`} style={{ left: mid.x, top: mid.y }}>
              {live.serviceUnavailable ? <>0/s · 503 Dropped</> : live.replicaFailed ? <>0/s · Replica Unhealthy</> : live.consumerDown ? <>Buffered · Consumer Down</> : live.cycleBlocked ? <>0/s · Cycle Blocked</> : <>{edge.protocol} · <b>{formatRps(live.rps)}/s</b>{live.retryAmplification && <> · Retries · +25%</>}{live.cacheHitRate > 0 && <> · {Math.round(live.cacheHitRate * 100)}% cached</>}</>}
            </span>
          );
        })}

        {graph.nodes.map((node) => {
          const telemetry = simulation?.nodes[node.id];
          const selected = selectedIds.includes(node.id);
          const isDropTarget = dropTarget?.id === node.id;
          const showPorts = canEdit && (selected || hoverId === node.id || drag?.fromId === node.id || armedConnect?.nodeId === node.id || isDropTarget);
          const facets = nodeFacets(node, mode, names);
          const density = node.width >= 340 && node.height >= 165 ? "hero" : node.width >= 250 && node.height >= 115 ? "medium" : "compact";
          const capacity = nodeCapacity(node);
          const utilization = telemetry?.utilization;
          const utilizationPercent = Number.isFinite(utilization) ? Math.max(0, Math.min(100, Math.round(utilization * 100))) : utilization === Infinity ? 100 : 0;
          const replicas = Math.max(1, Number(node.replicas) || 1);
          const rpsLabel = simulate && telemetry ? formatRps(telemetry.incomingRps) : "—";
          const p95Label = simulate && telemetry && telemetry.p95Ms != null ? telemetry.p95Ms + "ms" : "—";
          const runtimeMeta = mode === "compose" ? (facets.badge || "external") + " · " + (facets.chips[0] || "runtime") : mode === "k8s" ? (facets.badge || "external") + " · " + facets.sub : (facets.badge || node.protocol || "TCP") + " · :" + (node.port || "—");
          const status = simulate && telemetry ? telemetry.status : node.health === "down" ? "down" : node.health === "degraded" ? "elevated" : "healthy";
          return (
            <div key={node.id} className={`sd-node is-${node.accent} s-${status}${selected ? " is-selected" : ""}${hoverId === node.id ? " is-hovered" : ""}${isDropTarget ? " is-drop-target" : ""}${armedConnect?.nodeId === node.id ? " is-connect-armed" : ""}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height }} data-node-id={node.id} data-kind={node.kind}>
              <div className={"sd-node-content is-" + density}>
                <div className="sd-node-head">
                  <button type="button" className={"sd-node-icon-button" + (node.customIcon ? " has-custom-icon" : "")}
                    title="Insert or change tech icon" aria-label={"Insert or change tech icon for " + node.label}
                    disabled={!canEdit} onPointerDown={stop} onClick={(event) => {
                      stop(event); event.preventDefault(); onOpenIconLibrary?.(node);
                    }}>
                    {node.customIcon?.src
                      ? <img className="sd-node-custom-icon" src={node.customIcon.src} alt={node.customIcon.name || ""} draggable={false} />
                      : <PrimitiveIcon kind={node.kind} accent={node.accent} className="sd-node-icon" />}
                    <span className="sd-node-icon-add" aria-hidden="true">+</span>
                  </button>
                  <div className="sd-node-title-wrap">
                    <strong className="sd-node-label">{node.label}</strong>
                    {density === "hero" && <span className="sd-node-hero-sub">{facets.sub}</span>}
                  </div>
                  {density !== "compact" && <span className={"sd-status sd-mono s-" + status}>{STATUS_LABEL[status] || "Idle"}</span>}
                  {density === "hero" && <span className="sd-replica-badge">{replicas} {replicas === 1 ? "replica" : "replicas"}</span>}
                </div>
                {density === "compact" ? <>
                  <div className={"sd-node-sub" + (mode === "compose" ? " sd-mono" : "")}>{facets.sub}</div>
                  <div className="sd-node-foot">
                    {mode === "canvas" ? <>
                      <span className={"sd-pill sd-mono" + (!simulate ? " is-quiet" : "")}>RPS {rpsLabel}</span>
                      <span className={"sd-pill sd-mono" + (!simulate ? " is-quiet" : "")}>p95 {p95Label}</span>
                    </> : facets.chips.map((chip) => <span key={chip} className="sd-pill sd-mono">{chip}</span>)}
                  </div>
                </> : density === "medium" ? <>
                  <div className="sd-node-medium-middle">
                    <div className={"sd-node-sub" + (mode === "compose" ? " sd-mono" : "")}>{facets.sub}</div>
                    <div className="sd-node-capacity">{replicas}× · {capacity ? formatRps(capacity) : "—"} RPS cap</div>
                    <div className={"sd-util sd-util-inline s-" + status} role="meter" aria-label={node.label + " utilization"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilizationPercent}><i style={{ width: utilizationPercent + "%" }} /></div>
                  </div>
                  <div className="sd-node-foot sd-node-metric-strip">
                    <span><small>RPS</small><b>{rpsLabel}</b></span>
                    <span><small>p95</small><b>{p95Label}</b></span>
                    <span><small>UTIL</small><b>{simulate && telemetry ? (Number.isFinite(utilization) ? utilizationPercent + "%" : "∞") : "—"}</b></span>
                  </div>
                </> : <>
                  <div className="sd-node-hero-body">
                    <div className="sd-node-telemetry">
                      <div><small>RPS</small><b>{rpsLabel}</b></div>
                      <div><small>p95 Latency</small><b>{p95Label}</b></div>
                      <div><small>Utilization</small><b>{simulate && telemetry ? (Number.isFinite(utilization) ? utilizationPercent + "%" : "∞") : "—"}</b></div>
                    </div>
                    <div className={"sd-util sd-util-inline s-" + status} role="meter" aria-label={node.label + " utilization"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilizationPercent}><i style={{ width: utilizationPercent + "%" }} /></div>
                  </div>
                  <div className="sd-node-hero-footer"><span>{runtimeMeta}</span><span>{capacity ? formatRps(capacity) + " RPS capacity" : "External workload"}</span></div>
                </>}
              </div>
              {PORTS.map((port) => (
                <button key={port} type="button" tabIndex={-1}
                  className={`sd-port is-${port}${showPorts ? " is-visible" : ""}${isDropTarget && dropPort === port ? " is-target" : ""}${armedConnect?.nodeId === node.id && (armedConnect.port === port || armedConnect.port == null) ? " is-armed" : ""}`}
                  aria-label={`${node.label} ${port} connector`}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerDown={(e) => beginConnect(e, node, port)} onPointerMove={moveConnect} onPointerUp={endConnect} onPointerCancel={() => setDrag(null)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
