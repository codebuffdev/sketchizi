import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PORTS, choosePorts, getPortPoint, nearestPort, pointAlong, roundedPath, routeOrthogonal } from "./orthogonalRouter.js";
import { modeBadge } from "./yamlPreview.js";
import { formatRps, packetCountForRps } from "./trafficSimulator.js";
import { PrimitiveIcon } from "./PrimitiveIcon.jsx";

const STATUS_LABEL = { healthy: "Healthy", elevated: "Elevated", overloaded: "Overloaded", down: "Down" };
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
const PORT_REACH = 14;
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

export default function SystemDesignNodeOverlay({ graph, simulation, mode, snapshot, offset, getHost, actions, canEdit, simulate }) {
  const { scrollX, scrollY, zoom, selectedIds } = snapshot;
  const [hoverId, setHoverId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [drag, setDrag] = useState(null); // { fromId, fromPort, point }
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
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("dblclick", onDouble, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("dblclick", onDouble, true);
    };
  }, [getHost, toScene, canEdit]);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const routes = useMemo(() => graph.edges.map((edge) => {
    const a = byId.get(edge.from); const b = byId.get(edge.to);
    return { edge, points: routeOrthogonal(a, edge.fromPort, b, edge.toPort) };
  }), [graph.edges, byId]);

  const beginConnect = (event, node, port) => {
    if (!canEdit) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ fromId: node.id, fromPort: port, point: toScene(event.clientX, event.clientY) });
  };
  const moveConnect = (event) => { if (drag) setDrag({ ...drag, point: toScene(event.clientX, event.clientY) }); };
  // Dropping anywhere on a target card connects (to its nearest cardinal port), so one press-drag-release is enough.
  const endConnect = (event) => {
    if (!drag) return;
    const point = toScene(event.clientX, event.clientY);
    const target = nodeAt(graph.nodes, point, drag.fromId, 10);
    const source = byId.get(drag.fromId);
    if (target && source) actions.connect(drag.fromId, target.id, { fromPort: drag.fromPort, toPort: dropPortFor(source, target, point) });
    setDrag(null);
  };
  const dragFrom = drag ? byId.get(drag.fromId) : null;
  const dropTarget = drag ? nodeAt(graph.nodes, drag.point, drag.fromId, 10) : null;
  const dropPort = dropTarget && dragFrom ? dropPortFor(dragFrom, dropTarget, drag.point) : null;

  const layerStyle = { transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) translate(${scrollX}px, ${scrollY}px)` };

  return (
    <div className="sd-overlay" aria-hidden={false}>
      <div className="sd-layer" style={layerStyle}>
        <svg className="sd-edges" width="1" height="1" overflow="visible" aria-hidden="true">
          {routes.map(({ edge, points }) => {
            const live = simulation?.edges[edge.id];
            const targetStatus = simulation?.nodes[edge.to]?.status;
            const tone = !simulate ? "idle" : !live || live.rps <= 0 ? "idle" : targetStatus === "overloaded" || targetStatus === "down" ? "hot" : targetStatus === "elevated" ? "warm" : "ok";
            const d = roundedPath(points);
            const selected = selectedIds.includes(edge.id);
            const packets = simulate && live ? packetCountForRps(live.rps) : 0;
            const duration = Math.max(1.2, 3.4 - Math.log10((live?.rps || 1) + 1) * 0.5);
            return (
              <g key={edge.id} className={`sd-edge is-${tone}${selected ? " is-selected" : ""}${edge.lineStyle === "dashed" ? " is-dashed" : ""}`}>
                <path id={`sd-path-${edge.id}`} d={d} fill="none" />
                {packets > 0 && Array.from({ length: packets }, (_, i) => (
                  <circle key={i} r="3.2" className="sd-packet">
                    <animateMotion dur={`${duration}s`} begin={`${-(duration / packets) * i}s`} repeatCount="indefinite"><mpath href={`#sd-path-${edge.id}`} /></animateMotion>
                  </circle>
                ))}
              </g>
            );
          })}
          {drag && dragFrom && (() => {
            const cursor = { x: drag.point.x, y: drag.point.y, width: 0, height: 0 };
            return <path className="sd-edge-preview" fill="none" d={roundedPath(routeOrthogonal(dragFrom, drag.fromPort, cursor, choosePorts(dragFrom, cursor).toPort))} />;
          })()}
        </svg>

        {routes.map(({ edge, points }) => {
          const mid = pointAlong(points, 0.5);
          const live = simulation?.edges[edge.id];
          return (
            <span key={edge.id} className="sd-badge sd-mono" style={{ left: mid.x, top: mid.y }}>
              {edge.protocol}{simulate && live ? ` · ${formatRps(live.rps)}/s` : ""}
            </span>
          );
        })}

        {graph.nodes.map((node) => {
          const telemetry = simulation?.nodes[node.id];
          const selected = selectedIds.includes(node.id);
          const isDropTarget = dropTarget?.id === node.id;
          const showPorts = canEdit && (selected || hoverId === node.id || drag?.fromId === node.id || isDropTarget);
          const status = simulate && telemetry ? telemetry.status : node.health === "down" ? "down" : node.health === "degraded" ? "elevated" : "healthy";
          return (
            <div key={node.id} className={`sd-node is-${node.accent} s-${status}${selected ? " is-selected" : ""}${isDropTarget ? " is-drop-target" : ""}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height }} data-node-id={node.id} data-kind={node.kind}>
              <div className="sd-node-head">
                <PrimitiveIcon kind={node.kind} accent={node.accent} className="sd-node-icon" />
                {editingId === node.id
                  ? <LabelEditor initial={node.label} onDone={(value) => { setEditingId(null); if (value) actions.updateNodeMeta(node.id, { label: value }); }} />
                  : <strong className="sd-node-label">{node.label}</strong>}
                {/* Canvas mode's badge would repeat the subtitle line below, so it only appears where it adds information (pods / port). */}
                {mode !== "canvas" && <span className="sd-mode-badge sd-mono">{modeBadge(node, mode)}</span>}
              </div>
              <div className="sd-node-sub">{node.subtitle}</div>
              <div className="sd-node-foot">
                {simulate && telemetry ? (
                  <>
                    <span className="sd-pill sd-mono" title="Incoming requests per second">RPS {formatRps(telemetry.incomingRps)}</span>
                    <span className="sd-pill sd-mono" title="p95 latency">{telemetry.p95Ms == null ? "p95 —" : `p95 ${telemetry.p95Ms}ms`}</span>
                    <span className={`sd-status sd-mono s-${telemetry.status}`}>{STATUS_LABEL[telemetry.status]}</span>
                  </>
                ) : (
                  <>
                    <span className="sd-pill sd-mono">{node.protocol}</span>
                    <span className="sd-pill sd-mono">×{node.replicas}</span>
                    {node.health !== "healthy" && <span className={`sd-status sd-mono s-${status}`}>{STATUS_LABEL[status]}</span>}
                  </>
                )}
              </div>
              {PORTS.map((port) => (
                <button key={port} type="button" tabIndex={-1}
                  className={`sd-port is-${port}${showPorts ? " is-visible" : ""}${isDropTarget && dropPort === port ? " is-target" : ""}`}
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
