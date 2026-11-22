import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  PORT_SHAPE_TYPES,
  absolutePointsToPatch,
  findPortSnap,
  getAbsolutePoints,
  getPortBindingChanges,
  getSegmentMidpoints,
  getShapePorts,
  insertVertex,
  moveVertex,
  removeVertex,
  segmentAngleDegrees,
  softSnapAngle,
} from "../../features/canvas/arrowRouting.js";
import "./ArrowVertexEditor.css";

const LINEAR_TYPES = new Set(["arrow", "line"]);

const liveElements = (api) => (api?.getSceneElements?.() || []).filter((el) => el && !el.isDeleted);
const portShapes = (elements) => elements.filter((el) => PORT_SHAPE_TYPES.has(el.type));

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

/** Writes new absolute points (and optional end-binding changes) to one arrow / line. */
function writePoints(api, elementId, absolutePoints, { binding = null, capture = CaptureUpdateAction.EVENTUALLY } = {}) {
  const scene = api.getSceneElements();
  const target = scene.find((el) => el.id === elementId);
  if (!target) return;
  let patch = absolutePointsToPatch(absolutePoints);
  const shapeUpdates = new Map();
  if (binding && target.type === "arrow") {
    for (const [which, port] of Object.entries(binding)) {
      const changes = getPortBindingChanges({ ...target, ...patch }, which, port, scene);
      patch = { ...patch, ...changes.arrowPatch };
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

export default function ArrowVertexEditor({ apiRef, canvasRevision, canvasRootRef, canEdit = true, viewModeEnabled = false }) {
  const [, setTick] = useState(0);
  const [hint, setHint] = useState(null); // { ports: [], snapPort, badge: { x, y, text, snapped } }
  const dragRef = useRef(null);
  const drawRef = useRef({ id: null, alt: false });
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
    const shapes = portShapes(liveElements(api));
    const port = isEnd ? findPortSnap(raw, shapes, { zoom: view.zoom, excludeIds: [element.id] }) : null;
    let target = raw;
    let badge;
    if (port) {
      target = { x: port.x, y: port.y };
      badge = { text: "Port Snap", snapped: true };
    } else {
      const anchor = drag.index === 0 ? points[1] : points[drag.index - 1];
      const snap = softSnapAngle(anchor, raw, { disabled: event.altKey });
      target = snap.point;
      badge = { text: `${Math.round(snap.angle)}°`, snapped: snap.snapped };
    }
    const next = moveVertex(points, drag.index, target);
    const binding = element.type === "arrow" && isEnd ? { [drag.index === 0 ? "start" : "end"]: port || null } : null;
    writePoints(api, element.id, next, { binding });
    const client = toClient(view, target);
    setHint({
      ports: port ? getShapePorts(shapes.find((s) => s.id === port.shapeId)) : [],
      snapPort: port,
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
    dragRef.current = { elementId, index, pointerId: event.pointerId, moved: false, inserted };
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
      if (draft && LINEAR_TYPES.has(draft.type)) drawRef.current = { id: draft.id, alt: latest.altKey };
      const raw = toScene(view, latest.clientX, latest.clientY);
      const shapes = portShapes(liveElements(api));
      const port = findPortSnap(raw, shapes, { zoom: view.zoom, excludeIds: draft ? [draft.id] : [] });
      let badge = null;
      if (port) {
        const client = toClient(view, port);
        badge = { text: "Port Snap", snapped: true, x: client.x, y: client.y };
      } else if (draft && LINEAR_TYPES.has(draft.type) && draft.points?.length >= 2) {
        const points = getAbsolutePoints(draft);
        const anchor = points[points.length - 2];
        const snap = softSnapAngle(anchor, raw, { disabled: latest.altKey });
        badge = { text: `${Math.round(segmentAngleDegrees(anchor, snap.point)) % 360}°`, snapped: snap.snapped, x: latest.clientX, y: latest.clientY };
      }
      // Highlight the ports of the shape the cursor is closest to (within ~3x snap range).
      const nearby = shapes.find((shape) => {
        const x1 = Math.min(shape.x, shape.x + shape.width) - 42 / view.zoom;
        const x2 = Math.max(shape.x, shape.x + shape.width) + 42 / view.zoom;
        const y1 = Math.min(shape.y, shape.y + shape.height) - 42 / view.zoom;
        const y2 = Math.max(shape.y, shape.y + shape.height) + 42 / view.zoom;
        return raw.x >= x1 && raw.x <= x2 && raw.y >= y1 && raw.y <= y2;
      });
      setHint({
        ports: nearby ? getShapePorts(nearby) : [],
        snapPort: port,
        badge,
      });
    };

    const onMove = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("canvas.excalidraw__canvas.interactive")) {
        if (!dragRef.current) setHint((current) => (current ? null : current));
        return;
      }
      latest = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
      if (drawRef.current.id) drawRef.current.alt = event.altKey;
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
      drawRef.current = { id: null, alt: false };
      const element = api.getSceneElements().find((el) => el.id === id);
      if (!element || element.isDeleted || !LINEAR_TYPES.has(element.type) || element.elbowed) return;
      const view = getView(api);
      const original = getAbsolutePoints(element);
      if (original.length < 2) return;
      const points = original.map((p) => ({ ...p }));
      if (!alt) {
        for (let i = 1; i < points.length - 1; i += 1) points[i] = softSnapAngle(points[i - 1], points[i]).point;
      }
      const shapes = portShapes(liveElements(api));
      const last = points.length - 1;
      const startPort = findPortSnap(points[0], shapes, { zoom: view.zoom, excludeIds: [id] });
      const endPort = findPortSnap(points[last], shapes, { zoom: view.zoom, excludeIds: [id] });
      if (startPort) points[0] = { x: startPort.x, y: startPort.y };
      if (endPort) points[last] = { x: endPort.x, y: endPort.y };
      else if (!alt) points[last] = softSnapAngle(points[last - 1], points[last]).point;
      const changed = points.some((p, i) => Math.abs(p.x - original[i].x) > 1e-6 || Math.abs(p.y - original[i].y) > 1e-6);
      if (!changed && !startPort && !endPort) return;
      writePoints(api, id, points, {
        binding: element.type === "arrow" ? { ...(startPort ? { start: startPort } : {}), ...(endPort ? { end: endPort } : {}) } : null,
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
      {hint?.ports?.map((port) => {
        const c = toClient(view, port);
        const active = hint.snapPort && hint.snapPort.shapeId === port.shapeId && hint.snapPort.side === port.side;
        return <span key={`${port.shapeId}-${port.side}`} className={`sk-arrow-port${active ? " is-active" : ""}`} style={{ left: c.x, top: c.y }} />;
      })}
      {hint?.badge && (
        <span className={`sk-arrow-badge${hint.badge.snapped ? " is-snapped" : ""}`} style={{ left: hint.badge.x + 14, top: hint.badge.y - 26 }}>
          {hint.badge.text}
        </span>
      )}
    </div>
  );
  return createPortal(overlay, document.body);
}
