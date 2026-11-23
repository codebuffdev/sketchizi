import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith, restoreElements } from "@excalidraw/excalidraw";
import { getPrimitive, getPrimitiveForShortcut } from "./primitives.js";
import { createSceneStore } from "./sceneStore.js";
import {
  CUSTOM_KEY, NODE_SIZE, arrowGeometry, collectSceneRepairs, createEdgeSkeleton, createNodeSkeleton, edgePatch,
  hasSystemDesignContent, isSystemDesignEdge, isSystemDesignNode, metaPatch, readGraph, readNode,
} from "./sceneModel.js";
import { choosePorts } from "./orthogonalRouter.js";
import { isRectInView, planPlacement, scrollToReveal } from "./placement.js";
import { computeAutoLayout } from "./autoLayout.js";
import { LOAD_PRESETS } from "./trafficSimulator.js";

const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [data-sketchizi-inline-editor]"));
}

/**
 * All System Design Studio state lives here so `App.jsx` only mounts a thin boundary.
 * High-frequency scene data goes through `store` (external store), not React state in App.
 */
export function useSystemDesignWorkspace({ apiRef, apiReady, activeCanvasId, gridEnabled, setGridEnabled, gridSize = 20, canEdit = true }) {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createSceneStore();
  const store = storeRef.current;

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState("canvas");
  const [simulate, setSimulate] = useState(false);
  const [loadRps, setLoadRps] = useState(LOAD_PRESETS[1]);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;
  const reroutingRef = useRef(false);
  const lastRectsRef = useRef(new Map());
  const pushRef = useRef(null);

  /* ---------- scene subscription (snapshot + auto-detect + edge re-routing) ---------- */
  useEffect(() => {
    let unsubscribe = null;
    let boundApi = null;
    let frame = 0;
    let pending = null;

    const reroute = (api, elements) => {
      const nodes = new Map();
      for (const el of elements) if (isSystemDesignNode(el)) nodes.set(el.id, el);
      const rects = new Map([...nodes].map(([id, el]) => [id, `${el.x}|${el.y}|${el.width}|${el.height}`]));
      const moved = new Set();
      for (const [id, key] of rects) if (lastRectsRef.current.get(id) !== key) moved.add(id);
      lastRectsRef.current = rects;
      if (!moved.size || reroutingRef.current) return;
      const updates = new Map();
      for (const el of elements) {
        if (!isSystemDesignEdge(el)) continue;
        const data = el.customData[CUSTOM_KEY];
        if (!moved.has(data.from) && !moved.has(data.to)) continue;
        const a = nodes.get(data.from);
        const b = nodes.get(data.to);
        if (!a || !b) continue;
        const ports = data.fixedPorts ? { fromPort: data.fromPort, toPort: data.toPort } : choosePorts(a, b);
        const { patch } = arrowGeometry(a, ports.fromPort, b, ports.toPort);
        updates.set(el.id, newElementWith(el, { ...patch, ...edgePatch(el, ports) }));
      }
      if (!updates.size) return;
      reroutingRef.current = true;
      // NEVER: re-routing is derived state and must not pollute the undo stack.
      api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((el) => updates.get(el.id) || el), captureUpdate: CaptureUpdateAction.NEVER });
      reroutingRef.current = false;
    };

    const flush = () => {
      frame = 0;
      const api = boundApi;
      if (!api || !pending) return;
      const { elements, appState } = pending;
      pending = null;
      const live = elements.filter((el) => !el.isDeleted);
      if (!enabledRef.current && hasSystemDesignContent(live)) setEnabled(true);
      if (!enabledRef.current && !hasSystemDesignContent(live)) { lastRectsRef.current = new Map(); store.set({ ...store.getSnapshot(), elements: [], selectedIds: [] }); return; }
      // Bring legacy / orphaned elements in line (invisible hit-boxes, no ghost connectors). Idempotent: the update this
      // triggers produces a clean scene, so the next frame finds nothing to repair. NEVER keeps it out of the undo stack.
      const repairs = collectSceneRepairs(live);
      if (repairs.size && !reroutingRef.current) {
        reroutingRef.current = true;
        api.updateScene({
          elements: api.getSceneElementsIncludingDeleted().map((el) => (repairs.has(el.id) ? newElementWith(el, repairs.get(el.id)) : el)),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        reroutingRef.current = false;
        return;
      }
      reroute(api, live);
      store.set({
        elements: live,
        selectedIds: Object.entries(appState.selectedElementIds || {}).filter(([, v]) => v).map(([id]) => id),
        scrollX: appState.scrollX || 0,
        scrollY: appState.scrollY || 0,
        zoom: appState.zoom?.value || 1,
      });
    };

    const bind = (api) => {
      if (unsubscribe) unsubscribe();
      boundApi = api;
      lastRectsRef.current = new Map();
      if (!api) { unsubscribe = null; return; }
      const onChange = (elements, appState) => {
        pending = { elements, appState };
        if (!frame) frame = requestAnimationFrame(flush);
      };
      if (typeof api.onChange === "function") {
        unsubscribe = api.onChange(onChange) || null;
      } else {
        // Fallback for Excalidraw builds without the imperative onChange subscription.
        let lastKey = "";
        const timer = window.setInterval(() => {
          const elements = api.getSceneElementsIncludingDeleted?.() || [];
          const state = api.getAppState?.() || {};
          const key = `${elements.length}|${elements.map((el) => el.version).join(",")}|${state.scrollX}|${state.scrollY}|${state.zoom?.value}|${Object.keys(state.selectedElementIds || {}).join(",")}`;
          if (key !== lastKey) { lastKey = key; onChange(elements, state); }
        }, 120);
        unsubscribe = () => window.clearInterval(timer);
      }
      pushRef.current = () => onChange(api.getSceneElements?.() || [], api.getAppState?.() || {});
      pushRef.current();
    };

    bind(apiRef.current);
    // The canvas remounts per tab (key={activeCanvasId}); rebind when the API identity changes.
    const watchdog = window.setInterval(() => { if (apiRef.current !== boundApi) bind(apiRef.current); }, 250);
    return () => {
      window.clearInterval(watchdog);
      if (frame) cancelAnimationFrame(frame);
      if (unsubscribe) unsubscribe();
    };
  }, [apiRef, apiReady, activeCanvasId, store]);

  // Opening the studio on a scene with no prior change events still needs an initial snapshot.
  useEffect(() => { if (enabled) pushRef.current?.(); }, [enabled]);

  /* ---------- scene mutations ---------- */
  const commit = useCallback((elements, captureUpdate = CaptureUpdateAction.IMMEDIATELY) => {
    apiRef.current?.updateScene?.({ elements, captureUpdate });
  }, [apiRef]);

  const viewportCenterScene = useCallback(() => {
    const api = apiRef.current;
    const state = api?.getAppState?.() || {};
    const zoom = state.zoom?.value || 1;
    return {
      x: (state.width || 1200) / 2 / zoom - (state.scrollX || 0),
      y: (state.height || 800) / 2 / zoom - (state.scrollY || 0),
    };
  }, [apiRef]);

  /**
   * Add a primitive.
   * - Exactly one node selected (dock click): place it to the right of that node, in the first free slot, and connect
   *   selected -> new with an orthogonal connector. Node + connector are ONE commit, so one Cmd/Ctrl+Z removes both.
   * - Otherwise: drop it near the viewport centre in the first free slot (never on top of another node), no connector.
   * `at` (scene point) is for drag-and-drop style callers and bypasses smart placement.
   */
  const addNode = useCallback((kind, at) => {
    const api = apiRef.current;
    if (!api || !canEdit || !getPrimitive(kind)) return null;
    setEnabled(true);
    const live = api.getSceneElements();
    const nodes = live.map(readNode).filter(Boolean);
    // Live Excalidraw state is the source of truth (the store snapshot lags by a frame).
    const selectedIds = Object.entries(api.getAppState?.().selectedElementIds || {}).filter(([, v]) => v).map(([id]) => id);
    const selectedNode = !at && selectedIds.length === 1 ? nodes.find((n) => n.id === selectedIds[0]) || null : null;
    const grid = gridEnabled ? gridSize : 0;
    const { position } = at
      ? { position: { x: at.x - NODE_SIZE.width / 2, y: at.y - NODE_SIZE.height / 2 } }
      : planPlacement({ nodes, selectedNode, center: viewportCenterScene(), grid });
    const id = newId("sd");
    const nodeSkeleton = createNodeSkeleton(kind, position, {}, id);
    const skeletons = [nodeSkeleton];
    if (selectedNode) {
      const target = { id, x: nodeSkeleton.x, y: nodeSkeleton.y, width: nodeSkeleton.width, height: nodeSkeleton.height };
      skeletons.push(createEdgeSkeleton(selectedNode, target, { protocol: selectedNode.protocol }, newId("sdedge")));
    }
    const created = restoreElements(convertToExcalidrawElements(skeletons), null);
    commit([...api.getSceneElementsIncludingDeleted(), ...created]);
    api.updateScene({ appState: { selectedElementIds: { [id]: true } }, captureUpdate: CaptureUpdateAction.NEVER });

    // Keep the new node on screen (clear of the floating top pill, bottom dock and header rail).
    const view = api.getAppState?.() || {};
    const rect = { x: nodeSkeleton.x, y: nodeSkeleton.y, width: nodeSkeleton.width, height: nodeSkeleton.height };
    const viewport = { scrollX: view.scrollX, scrollY: view.scrollY, zoom: view.zoom?.value || 1, width: view.width, height: view.height };
    if (view.width && !isRectInView(rect, viewport)) {
      api.updateScene({ appState: scrollToReveal(rect, viewport), captureUpdate: CaptureUpdateAction.NEVER });
    }
    return id;
  }, [apiRef, canEdit, commit, gridEnabled, gridSize, viewportCenterScene]);

  const connect = useCallback((fromId, toId, ports = null) => {
    const api = apiRef.current;
    if (!api || !canEdit || fromId === toId) return null;
    const { nodes, edges } = readGraph(api.getSceneElements());
    const from = nodes.find((n) => n.id === fromId);
    const to = nodes.find((n) => n.id === toId);
    if (!from || !to || edges.some((e) => e.from === fromId && e.to === toId)) return null;
    const id = newId("sdedge");
    const skeleton = createEdgeSkeleton(from, to, { ...(ports || {}), protocol: from.protocol }, id);
    if (ports) skeleton.customData[CUSTOM_KEY].fixedPorts = true;
    const created = restoreElements(convertToExcalidrawElements([skeleton]), null);
    commit([...api.getSceneElementsIncludingDeleted(), ...created]);
    return id;
  }, [apiRef, canEdit, commit]);

  // `transient` (slider drags, live typing) uses EVENTUALLY so the whole gesture folds into one undo step
  // when the final, non-transient commit lands.
  const updateNodeMeta = useCallback((id, partial, { transient = false } = {}) => {
    const api = apiRef.current;
    if (!api || !canEdit) return;
    commit(
      api.getSceneElementsIncludingDeleted().map((el) => (el.id === id && isSystemDesignNode(el) ? newElementWith(el, metaPatch(el, partial)) : el)),
      transient ? CaptureUpdateAction.EVENTUALLY : CaptureUpdateAction.IMMEDIATELY,
    );
  }, [apiRef, canEdit, commit]);

  const updateEdge = useCallback((id, partial) => {
    const api = apiRef.current;
    if (!api || !canEdit) return;
    commit(api.getSceneElementsIncludingDeleted().map((el) => (el.id === id && isSystemDesignEdge(el) ? newElementWith(el, edgePatch(el, partial)) : el)));
  }, [apiRef, canEdit, commit]);

  const deleteSelection = useCallback(() => {
    const api = apiRef.current;
    if (!api || !canEdit) return;
    const selected = new Set(store.getSnapshot().selectedIds);
    if (!selected.size) return;
    const doomed = new Set(selected);
    // Deleting a node also removes the edges attached to it.
    for (const el of api.getSceneElements()) {
      if (isSystemDesignEdge(el) && (selected.has(el.customData[CUSTOM_KEY].from) || selected.has(el.customData[CUSTOM_KEY].to))) doomed.add(el.id);
    }
    commit(api.getSceneElementsIncludingDeleted().map((el) => (doomed.has(el.id) ? newElementWith(el, { isDeleted: true }) : el)));
    api.updateScene({ appState: { selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef, canEdit, commit, store]);

  const autoLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api || !canEdit) return;
    const { nodes, edges } = readGraph(api.getSceneElements());
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const positions = computeAutoLayout(nodes, edges, { origin: { x: minX, y: minY }, grid: gridEnabled ? gridSize : 20 });
    const moved = new Map();
    for (const el of api.getSceneElements()) {
      const pos = positions.get(el.id);
      if (pos && isSystemDesignNode(el)) moved.set(el.id, newElementWith(el, pos));
    }
    const rects = new Map(nodes.map((n) => [n.id, { ...n, ...(positions.get(n.id) || {}) }]));
    for (const el of api.getSceneElements()) {
      if (!isSystemDesignEdge(el)) continue;
      const d = el.customData[CUSTOM_KEY];
      const a = rects.get(d.from); const b = rects.get(d.to);
      if (!a || !b) continue;
      const ports = choosePorts(a, b);
      moved.set(el.id, newElementWith(el, { ...arrowGeometry(a, ports.fromPort, b, ports.toPort).patch, ...edgePatch(el, { ...ports, fixedPorts: false }) }));
    }
    commit(api.getSceneElementsIncludingDeleted().map((el) => moved.get(el.id) || el));
    api.scrollToContent?.([...moved.values()], { fitToContent: true, animate: true });
  }, [apiRef, canEdit, commit, gridEnabled, gridSize]);

  /* ---------- 1-9 shortcuts + delete (only while the studio is open) ---------- */
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isTypingTarget(event.target)) return;
      const primitive = getPrimitiveForShortcut(event.key);
      if (primitive) {
        event.preventDefault();
        event.stopPropagation(); // Excalidraw maps 1-9 to tools; the studio owns them while open.
        addNode(primitive.kind);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, addNode]);

  const open = useCallback(() => setEnabled(true), []);
  const close = useCallback(() => { setEnabled(false); setSimulate(false); setMode("canvas"); }, []);
  const toggle = useCallback(() => (enabledRef.current ? close() : open()), [close, open]);

  return useMemo(() => ({
    store, enabled, open, close, toggle,
    mode, setMode, simulate, setSimulate, loadRps, setLoadRps,
    gridEnabled, setGridEnabled, gridSize, canEdit,
    actions: { addNode, connect, updateNodeMeta, updateEdge, deleteSelection, autoLayout },
  }), [store, enabled, open, close, toggle, mode, simulate, loadRps, gridEnabled, setGridEnabled, gridSize, canEdit, addNode, connect, updateNodeMeta, updateEdge, deleteSelection, autoLayout]);
}
