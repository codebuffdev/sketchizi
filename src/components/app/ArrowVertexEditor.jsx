import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  absolutePointsToPatch,
  getAbsolutePoints,
  getSegmentMidpoints,
  insertVertex,
  moveVertex,
  removeVertex,
  segmentAngleDegrees,
  softSnapAngle,
} from "../../features/canvas/arrowRouting.js";
import {
  connectorActivity,
  getBindingChanges,
  getConnectionPorts,
  getShapeCornerRadius,
  isConnectableShape,
  normalizeBounds,
  resolveSmartBinding,
} from "../../features/canvas/connectorBinding.js";
import "./ArrowVertexEditor.css";

const LINEAR_TYPES = new Set(["arrow", "line"]);

const liveElements = (api) => (api?.getSceneElements?.() || []).filter((el) => el && !el.isDeleted);
const connectableShapes = (elements) => elements.filter(isConnectableShape);
const isBypass = (event) => Boolean(event?.altKey || event?.metaKey); // Alt / Cmd: freehand, no magnetism

function getView(api) {
  const state = api?.getAppState?.();
  if (!state) return null;
  return {
    state,
    zoom: Math.max(0.05, Number(state.zoom?.value ?? state.zoom) || 1),
    scrollX: Number(state.scrollX) || 0,
    scrollY: Number(state.scrollY) || 0,
    offsetLeft: Number(state.offsetLeft) || 0,
    offsetTop: Number(state.offsetTop) || 0,
  };
}
const toClient = (view, p) => ({ x: (p.x + view.scrollX) * view.zoom + view.offsetLeft, y: (p.y + view.scrollY) * view.zoom + view.offsetTop });
const toScene = (view, cx, cy) => ({ x: (cx - view.offsetLeft) / view.zoom - view.scrollX, y: (cy - view.offsetTop) / view.zoom - view.scrollY });

const bump = (element, patch) => ({
  ...element,
  ...patch,
  version: (Number(element.version) || 0) + 1,
  versionNonce: Math.floor(Math.random() * 2147483647),
  updated: Date.now(),
});

/** Writes new absolute points (and optional end-binding changes) to one arrow / line - one pipeline for both. */
function writePoints(api, elementId, absolutePoints, { binding = null, capture = CaptureUpdateAction.EVENTUALLY } = {}) {
  const scene = api.getSceneElements();
  const target = scene.find((el) => el.id === elementId);
  if (!target) return;
  let patch = absolutePointsToPatch(absolutePoints);
  const shapeUpdates = new Map();
  if (binding) {
    for (const [which, snap] of Object.entries(binding)) {
      if (!snap && !target[`${which}Binding`]) continue; // nothing to clear
      const changes = getBindingChanges({ ...target, ...patch }, which, snap, scene);
      patch = { ...patch, ...changes.patch };
      changes.shapeUpdates.forEach((value, key) => shapeUpdates.set(key, value));
    }
  }
  api.updateScene({
    elements: scene.map((el) => {
      if (el.id === elementId) return bump(el, patch);
      if (shapeUpdates.has(el.id)) return bump(el, { boundElements: shapeUpdates.get(el.id) });
      return el;
    }),
    captureUpdate: capture,
  });
}

/** Accent outline of the shape a connector end will bind to (zoom-correct, rotation-aware). */
function TargetOutline({ shape, view }) {
  const b = normalizeBounds(shape);
  if (!b) return null;
  const c = toClient(view, { x: b.cx, y: b.cy });
  const w = b.width * view.zoom;
  const h = b.height * view.zoom;
  const deg = ((Number(shape.angle) || 0) * 180) / Math.PI;
  const r = getShapeCornerRadius(shape) * view.zoom;
  const draw = (props) => {
    if (shape.type === "ellipse") return <ellipse rx={w / 2} ry={h / 2} {...props} />;
    if (shape.type === "diamond") return <polygon points={`0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`} {...props} />;
    return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={r} ry={r} {...props} />;
  };
  return (
    <svg className="sk-arrow-outline" width="100%" height="100%">
      <g transform={`translate(${c.x} ${c.y}) rotate(${deg})`}>
        {draw({ fill: "none", stroke: "rgba(79, 70, 229, 0.25)", strokeWidth: 6 })}
        {draw({ fill: "rgba(79, 70, 229, 0.05)", stroke: "#4f46e5", strokeWidth: 1.5 })}
      </g>
    </svg>
  );
}

export default function ArrowVertexEditor({ apiRef, canvasRevision, canvasRootRef, canEdit = true, viewModeEnabled = false }) {
  const [, setTick] = useState(0);
  const [hint, setHint] = useState(null); // { ports: [], snapPort, badge: { x, y, text, snapped } }
  const dragRef = useRef(null);
  const drawRef = useRef({ id: null, alt: false, stickyId: null });
  const enabled = canEdit && !viewModeEnabled;
  const rerender = useCallback(() => setTick((n) => n + 1), []);

  /* ---------- drag: vertex handles and "+" midpoint handles ---------- */
  const onWindowMove = useCallback((event) => {
    const drag = dragRef.current;
    const api = apiRef?.current;
    const view = getView(api);
    if (!drag || !api || !view || event.pointerId !== drag.pointerId) return;
    const element = api.getSceneElements().find((el) => el.id === drag.elementId);
    if (!element) return;
    drag.moved = true;
    const points = getAbsolutePoints(element);
    const raw = toScene(view, event.clientX, event.clientY);
    const isEnd = drag.index === 0 || drag.index === points.length - 1;
    const shapes = connectableShapes(liveElements(api));
    const bypass = isBypass(event);
    const snap = isEnd ? resolveSmartBinding(raw, shapes, { zoom: view.zoom, bypass, excludeIds: [element.id], stickyId: drag.stickyId }) : null;
    drag.stickyId = snap?.shapeId ?? null;
    let target = raw;
    let badge;
    if (snap) {
      target = { x: snap.x, y: snap.y }; // exact border / port: gap 0
      badge = { text: snap.portSnapped ? "Port Snap" : "Edge Snap", snapped: true };
    } else {
      const anchor = drag.index === 0 ? points[1] : points[drag.index - 1];
      const angle = softSnapAngle(anchor, raw, { disabled: event.altKey || event.metaKey });
      target = angle.point;
      badge = { text: `${Math.round(angle.angle)}°`, snapped: angle.snapped };
    }
    const next = moveVertex(points, drag.index, target);
    const binding = isEnd ? { [drag.index === 0 ? "start" : "end"]: snap || null } : null;
    writePoints(api, element.id, next, { binding });
    const client = toClient(view, target);
    setHint({
      shape: snap?.shape || null,
      ports: snap ? getConnectionPorts(snap.shape) : [],
      snapPort: snap,
      badge: { ...badge, x: client.x, y: client.y },
    });
  }, [apiRef]);

  const endDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    window.removeEventListener("pointermove", onWindowMove, true);
    window.removeEventListener("pointerup", endDrag, true);
    window.removeEventListener("pointercancel", endDrag, true);
    dragRef.current = null;
    connectorActivity.dragId = null;
    setHint(null);
    const api = apiRef?.current;
    if (api && (drag.moved || drag.inserted)) {
      // One IMMEDIATELY update closes the gesture so the whole drag (including a
      // pulled-out midpoint) is a single undo step.
      api.updateScene({
        elements: api.getSceneElements().map((el) => (el.id === drag.elementId ? bump(el, {}) : el)),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    }
    rerender();
  }, [apiRef, onWindowMove, rerender]);

  const beginDrag = useCallback((event, elementId, index, inserted) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { elementId, index, pointerId: event.pointerId, moved: false, inserted, stickyId: null };
    connectorActivity.dragId = elementId; // reconcile leaves a connector alone while its handle is dragged
    window.addEventListener("pointermove", onWindowMove, true);
    window.addEventListener("pointerup", endDrag, true);
    window.addEventListener("pointercancel", endDrag, true);
  }, [endDrag, onWindowMove]);

  const deleteBend = useCallback((elementId, index) => {
    const api = apiRef?.current;
    const element = api?.getSceneElements().find((el) => el.id === elementId);
    if (!element) return;
    const points = getAbsolutePoints(element);
    const next = removeVertex(points, index);
    if (next === points) return;
    writePoints(api, elementId, next, { capture: CaptureUpdateAction.IMMEDIATELY });
    rerender();
  }, [apiRef, rerender]);

  const onVertexPointerDown = (event, element, index) => {
    if (event.button !== 0) return;
    if (event.altKey) {
      // Alt + click removes an intermediate bend (endpoints are protected).
      event.preventDefault();
      event.stopPropagation();
      deleteBend(element.id, index);
      return;
    }
    beginDrag(event, element.id, index, false);
  };

  const onMidpointPointerDown = (event, element, segmentIndex, mid) => {
    if (event.button !== 0) return;
    const api = apiRef?.current;
    if (!api) return;
    // Insert the vertex immediately and keep dragging it in the same gesture.
    const points = getAbsolutePoints(element);
    writePoints(api, element.id, insertVertex(points, segmentIndex, mid));
    beginDrag(event, element.id, segmentIndex + 1, true);
  };

  useEffect(() => () => {
    connectorActivity.dragId = null;
    window.removeEventListener("pointermove", onWindowMove, true);
    window.removeEventListener("pointerup", endDrag, true);
    window.removeEventListener("pointercancel", endDrag, true);
  }, [endDrag, onWindowMove]);

  /* ---------- drawing assist: port highlight + angle badge, snap on commit ---------- */
  useEffect(() => {
    if (!enabled) return undefined;
    const root = canvasRootRef?.current;
    if (!root) return undefined;
    let frame = 0;
    let latest = null;

    const isDrawingTool = (state) => ["arrow", "line"].includes(state?.activeTool?.type);

    const computeHint = () => {
      frame = 0;
      const api = apiRef?.current;
      const view = getView(api);
      if (!api || !view || !latest || !isDrawingTool(view.state) || dragRef.current) return;
      const draft = view.state.multiElement || view.state.newElement;
      if (draft && LINEAR_TYPES.has(draft.type)) drawRef.current = { ...drawRef.current, id: draft.id, alt: isBypass(latest) };
      const raw = toScene(view, latest.clientX, latest.clientY);
      const shapes = connectableShapes(liveElements(api));
      const snap = resolveSmartBinding(raw, shapes, {
        zoom: view.zoom, bypass: isBypass(latest), excludeIds: draft ? [draft.id] : [], stickyId: drawRef.current.stickyId,
      });
      drawRef.current.stickyId = snap?.shapeId ?? null;
      let badge = null;
      if (snap) {
        const client = toClient(view, snap.point);
        badge = { text: snap.portSnapped ? "Port Snap" : "Edge Snap", snapped: true, x: client.x, y: client.y };
      } else if (draft && LINEAR_TYPES.has(draft.type) && draft.points?.length >= 2) {
        const points = getAbsolutePoints(draft);
        const anchor = points[points.length - 2];
        const angle = softSnapAngle(anchor, raw, { disabled: isBypass(latest) });
        badge = { text: `${Math.round(segmentAngleDegrees(anchor, angle.point)) % 360}°`, snapped: angle.snapped, x: latest.clientX, y: latest.clientY };
      }
      // Without a snap, still preview the ports of the shape the cursor is approaching (~3x reach).
      const nearby = snap ? snap.shape : shapes.find((shape) => {
        const b = normalizeBounds(shape);
        const pad = 42 / view.zoom;
        return raw.x >= b.minX - pad && raw.x <= b.maxX + pad && raw.y >= b.minY - pad && raw.y <= b.maxY + pad;
      });
      setHint({
        shape: snap ? snap.shape : null,
        ports: nearby ? getConnectionPorts(nearby) : [],
        snapPort: snap,
        badge,
      });
    };

    const onMove = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("canvas.excalidraw__canvas.interactive")) {
        if (!dragRef.current) setHint((current) => (current ? null : current));
        return;
      }
      latest = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
      if (drawRef.current.id) drawRef.current.alt = isBypass(event);
      if (!frame) frame = requestAnimationFrame(computeHint);
    };

    // Snap a freshly committed arrow / line: ports within 14px for both ends, and
    // the soft 15° snap for each placed bend. Alt held at commit skips the angle snap.
    const finalize = () => {
      const api = apiRef?.current;
      const { id, alt } = drawRef.current;
      if (!api || !id) return;
      const state = api.getAppState?.();
      if (state?.multiElement || state?.newElement) return; // still drawing
      drawRef.current = { id: null, alt: false, stickyId: null };
      const element = api.getSceneElements().find((el) => el.id === id);
      if (!element || element.isDeleted || !LINEAR_TYPES.has(element.type) || element.elbowed) return;
      const view = getView(api);
      const original = getAbsolutePoints(element);
      if (original.length < 2) return;
      const points = original.map((p) => ({ ...p }));
      if (!alt) {
        for (let i = 1; i < points.length - 1; i += 1) points[i] = softSnapAngle(points[i - 1], points[i]).point;
      }
      const shapes = connectableShapes(liveElements(api));
      const last = points.length - 1;
      const opts = { zoom: view.zoom, bypass: alt, excludeIds: [id] };
      const startSnap = resolveSmartBinding(points[0], shapes, opts);
      const endSnap = resolveSmartBinding(points[last], shapes, opts);
      if (startSnap) points[0] = { x: startSnap.x, y: startSnap.y };
      if (endSnap) points[last] = { x: endSnap.x, y: endSnap.y };
      else if (!alt) points[last] = softSnapAngle(points[last - 1], points[last]).point;
      const changed = points.some((p, i) => Math.abs(p.x - original[i].x) > 1e-6 || Math.abs(p.y - original[i].y) > 1e-6);
      if (!changed && !startSnap && !endSnap) return;
      writePoints(api, id, points, {
        // line and arrow take the same binding path
        binding: { ...(startSnap ? { start: startSnap } : {}), ...(endSnap ? { end: endSnap } : {}) },
        // The native commit already recorded the creation; refining it in place
        // must not add a second undo step.
        capture: CaptureUpdateAction.NEVER,
      });
    };
    const scheduleFinalize = () => window.setTimeout(() => requestAnimationFrame(finalize), 0);
    const onKeyDown = (event) => {
      if (event.key === "Enter" || event.key === "Escape") scheduleFinalize();
    };
    const onToolLeave = () => setHint((current) => (current ? null : current));

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", scheduleFinalize, true);
    window.addEventListener("dblclick", scheduleFinalize, true);
    window.addEventListener("keydown", onKeyDown, true);
    root.addEventListener("pointerleave", onToolLeave);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", scheduleFinalize, true);
      window.removeEventListener("dblclick", scheduleFinalize, true);
      window.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("pointerleave", onToolLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [apiRef, canvasRootRef, enabled]);

  /* ---------- render ---------- */
  const api = apiRef?.current;
  const view = enabled ? getView(api) : null;
  if (!view) return null;
  const { state } = view;
  const drawing = Boolean(state.multiElement || state.newElement);
  const selectedIds = Object.keys(state.selectedElementIds || {}).filter((id) => state.selectedElementIds[id]);
  const element = selectedIds.length === 1 ? liveElements(api).find((el) => el.id === selectedIds[0]) : null;
  const editable = element && LINEAR_TYPES.has(element.type) && !element.elbowed && !element.locked &&
    !(Math.abs(Number(element.angle) || 0) > 1e-6) && !state.editingLinearElement && !state.selectedLinearElement?.isEditing &&
    !drawing && state.activeTool?.type === "selection";
  const points = editable ? getAbsolutePoints(element) : [];
  const midpoints = editable ? getSegmentMidpoints(points, { zoom: view.zoom }) : [];

  const overlay = (
    <div className="sk-arrow-editor" aria-hidden="true" data-canvas-revision={canvasRevision}>
      {editable && midpoints.map((mid) => {
        const c = toClient(view, mid);
        return (
          <button
            key={`mid-${element.id}-${mid.segmentIndex}`}
            type="button"
            tabIndex={-1}
            className="sk-arrow-handle sk-arrow-handle-mid"
            style={{ left: c.x, top: c.y }}
            title="Drag to add a bend"
            onPointerDown={(event) => onMidpointPointerDown(event, element, mid.segmentIndex, mid)}
          >+</button>
        );
      })}
      {editable && points.map((point, index) => {
        const c = toClient(view, point);
        const isEnd = index === 0 || index === points.length - 1;
        return (
          <button
            key={`vtx-${element.id}-${index}`}
            type="button"
            tabIndex={-1}
            className={`sk-arrow-handle sk-arrow-handle-vertex${isEnd ? " is-endpoint" : ""}${dragRef.current?.index === index ? " is-dragging" : ""}`}
            style={{ left: c.x, top: c.y }}
            title={isEnd ? "Drag to move (Alt: free angle)" : "Drag to move · double-click or Alt+click to delete"}
            onPointerDown={(event) => onVertexPointerDown(event, element, index)}
            onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!isEnd) deleteBend(element.id, index); }}
          />
        );
      })}
      {hint?.shape && <TargetOutline shape={hint.shape} view={view} />}
      {hint?.ports?.map((port) => {
        const c = toClient(view, port);
        const active = hint.snapPort?.portSnapped && hint.snapPort.shapeId === port.shapeId && hint.snapPort.side === port.side;
        return <span key={`${port.shapeId}-${port.side}`} className={`sk-arrow-port${active ? " is-active" : ""}`} style={{ left: c.x, top: c.y }} />;
      })}
      {hint?.snapPort && (() => {
        const c = toClient(view, hint.snapPort.point);
        return <span className="sk-arrow-anchor-ring" style={{ left: c.x, top: c.y }} />;
      })()}
      {hint?.badge && (
        <span className={`sk-arrow-badge${hint.badge.snapped ? " is-snapped" : ""}`} style={{ left: hint.badge.x + 14, top: hint.badge.y - 26 }}>
          {hint.badge.text}
        </span>
      )}
    </div>
  );
  return createPortal(overlay, document.body);
}
