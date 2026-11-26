import { useEffect, useState } from "react";
import {
  calculateVerticalSpacing, formatGapLabel, SPACING_COLOR, EQUAL_SPACING_COLOR, TICK_HALF, KEYBOARD_GUIDE_MS,
} from "../../features/canvas/verticalSpacing.js";
import {
  calculateAlignmentGuides, calculateEqualSpacingGuides, calculateTextBaselineGuides, selectDisplayGuides, getGuideRenderAxis, sceneToCanvasPixel,
  calculatePlacementGuides, clientToScene, PLACEMENT_TOOLS, PLACEMENT_SNAP_TOOLS,
} from "../../features/canvas/alignmentGuides.js";

const EMPTY_GUIDES = [];
const UI_SELECTOR = "button, input, textarea, select, [role='menu'], .App-menu, .Island, .popover";
const TICK = 3.5; // half of the 7px crosshair / ruler tick
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function AlignmentGuides({ canvasRootRef, apiRef, canEdit, viewModeEnabled }) {
  const [guides, setGuides] = useState(EMPTY_GUIDES);
  const [overlay, setOverlay] = useState({ left: 0, top: 0, width: 0, height: 0 });
  // Pre-placement ruler guide (creation tools, before any click). Kept mounted
  // with `visible: false` so it can fade out instead of vanishing.
  const [placement, setPlacement] = useState(null);
  // Vertical-gap ruler + left-edge guide, in scene coordinates (zoom-normalised on render).
  const [spacing, setSpacing] = useState(null);

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !canEdit || viewModeEnabled) {
      setGuides(EMPTY_GUIDES);
      setPlacement(null);
      setSpacing(null);
      return undefined;
    }
    let dragging = false;
    let keyTimer = 0;
    let pressed = false;        // a creation-tool press/drag is in progress
    let altHeld = false;        // Alt/Option suppresses guides and snapping
    let hover = null;           // last hovering pointer position (client px)
    let hoverFrame = 0;
    let redispatching = false;  // true while we re-fire a snapped pointerdown
    let activePointerId = null;
    let frame = 0;
    let lastPointer = null;

    const hidePlacement = () => setPlacement((current) => (current && current.visible ? { ...current, visible: false } : current));

    const updateHover = () => {
      hoverFrame = 0;
      if (!hover || pressed || dragging || altHeld) { hidePlacement(); return; }
      const api = apiRef?.current;
      if (!api) return;
      const appState = api.getAppState?.() || {};
      const tool = appState.activeTool?.type;
      // Typing / mid-draw: never show the ruler over the user's work.
      if (!PLACEMENT_TOOLS.has(tool) || appState.editingTextElement || appState.newElement) { hidePlacement(); return; }
      const viewport = root.querySelector(".excalidraw");
      if (!viewport) { hidePlacement(); return; }
      const viewportRect = viewport.getBoundingClientRect();
      if (hover.x < viewportRect.left || hover.x > viewportRect.right || hover.y < viewportRect.top || hover.y > viewportRect.bottom) { hidePlacement(); return; }
      const scene = clientToScene(hover.x, hover.y, viewportRect, appState);
      const result = calculatePlacementGuides(api.getSceneElements?.() || [], { x: scene.x, y: scene.y }, { tool });
      if (!result.active) { hidePlacement(); return; }
      const rootRect = root.getBoundingClientRect();
      setOverlay({ left: viewportRect.left - rootRect.left, top: viewportRect.top - rootRect.top, width: viewportRect.width, height: viewportRect.height });
      const px = (axis, value) => sceneToCanvasPixel(value, axis === "x" ? appState.scrollX : appState.scrollY, scene.zoom);
      const cx = px("x", result.snappedX);
      const cy = px("y", result.snappedY);
      const view = { visible: true, cx, cy, width: viewportRect.width, height: viewportRect.height, v: null, h: null };
      if (result.x) view.v = {
        x: px("x", result.x.position), y1: px("y", result.x.start), y2: px("y", result.x.end),
        label: result.x.label, indent: result.x.kind === "indent", parentX: px("x", result.x.parentLeft),
      };
      if (result.y) view.h = { y: px("y", result.y.position), x1: px("x", result.y.start), x2: px("x", result.y.end), label: result.y.label };
      setPlacement(view);
    };
    const scheduleHover = () => { if (!hoverFrame) hoverFrame = requestAnimationFrame(updateHover); };

    const clear = () => {
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      hover = null;
      pressed = false;
      setPlacement(null);
      dragging = false;
      activePointerId = null;
      lastPointer = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setGuides(EMPTY_GUIDES);
      if (keyTimer) clearTimeout(keyTimer);
      keyTimer = 0;
      setSpacing(null);
    };

    // Measure (and optionally snap) the single active element. Returns the
    // spacing result, or null when there is nothing to measure.
    const measureSpacing = ({ snap, showGuides }) => {
      const api = apiRef?.current;
      if (!api) return null;
      const appState = api.getAppState?.() || {};
      const selected = Object.entries(appState.selectedElementIds || {}).filter(([, on]) => on).map(([id]) => id);
      if (selected.length !== 1) { if (showGuides) setSpacing(null); return null; }
      const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
      const elements = api.getSceneElements?.() || [];
      const result = calculateVerticalSpacing(elements, selected[0], { zoom, snap: snap && !altHeld });
      if (!result) { if (showGuides) setSpacing(null); return null; }
      if (result.snapped) {
        const target = elements.find((el) => el.id === selected[0]);
        api.updateScene?.({
          elements: elements.map((el) => (el.id === target.id
            ? { ...el, x: result.x, y: result.y, version: (el.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() }
            : el)),
        });
      }
      if (showGuides) setSpacing({ ...result, zoom, scrollX: Number(appState.scrollX) || 0, scrollY: Number(appState.scrollY) || 0 });
      return result;
    };

    // Arrow-key nudges are applied by Excalidraw; measure after it has moved
    // the element and keep the guides up briefly. Keyboard nudges never snap:
    // a 1px step would otherwise be pulled back inside the snap zone.
    const onNudgeKey = (event) => {
      if (!event.key.startsWith("Arrow") || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (apiRef?.current?.getAppState?.()?.editingTextElement) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (dragging) return;
        const shown = measureSpacing({ snap: false, showGuides: true });
        if (keyTimer) clearTimeout(keyTimer);
        keyTimer = shown ? setTimeout(() => { keyTimer = 0; setSpacing(null); }, KEYBOARD_GUIDE_MS) : 0;
      }));
    };

    const update = () => {
      frame = 0;
      if (!dragging || !lastPointer) return;
      const api = apiRef?.current;
      if (!api) return;
      const appState = api.getAppState?.() || {};
      const selectedIds = new Set(Object.entries(appState.selectedElementIds || {}).filter(([, selected]) => selected).map(([id]) => id));
      const elements = api.getSceneElements?.() || [];
      const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
      const rootRect = root.getBoundingClientRect();
      const viewport = root.querySelector('.excalidraw');
      if (!viewport) { setGuides(EMPTY_GUIDES); return; }
      const viewportRect = viewport.getBoundingClientRect();
      setOverlay({ left: viewportRect.left - rootRect.left, top: viewportRect.top - rootRect.top, width: viewportRect.width, height: viewportRect.height });
      measureSpacing({ snap: true, showGuides: true });
      const tolerance = 9 / zoom;
      const found = [
        ...calculateAlignmentGuides(elements, selectedIds, tolerance),
        ...calculateEqualSpacingGuides(elements, selectedIds, tolerance),
        ...calculateTextBaselineGuides(elements, selectedIds, tolerance),
      ];
      const toLocal = (axis, position) => sceneToCanvasPixel(
        position, axis === "x" ? appState.scrollX : appState.scrollY, zoom,
      );
      setGuides(selectDisplayGuides(found).map((guide) => {
        const displayAxis = getGuideRenderAxis(guide);
        const crossAxis = displayAxis === "x" ? "y" : "x";
        return {
          ...guide,
          displayAxis,
          screenPosition: toLocal(displayAxis, guide.position),
          screenStart: toLocal(crossAxis, guide.start),
          screenEnd: toLocal(crossAxis, guide.end),
        };
      }).filter((guide) => Number.isFinite(guide.screenPosition) && Number.isFinite(guide.screenStart) && Number.isFinite(guide.screenEnd)));
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Magnetic soft-snap: when a Text/Line/Arrow press lands inside the snap
    // zone, swallow it and re-fire the same pointerdown at the guide position.
    const snapPlacementPress = (event, target, appState, tool) => {
      if (!PLACEMENT_SNAP_TOOLS.has(tool) || event.altKey || event.isPrimary === false || appState.editingTextElement) return false;
      const viewport = root.querySelector(".excalidraw");
      const api = apiRef?.current;
      if (!viewport || !api) return false;
      const scene = clientToScene(event.clientX, event.clientY, viewport.getBoundingClientRect(), appState);
      const result = calculatePlacementGuides(api.getSceneElements?.() || [], { x: scene.x, y: scene.y }, { tool });
      if (!result.active) return false;
      const dx = (result.snappedX - scene.x) * scene.zoom;
      const dy = (result.snappedY - scene.y) * scene.zoom;
      if (!dx && !dy) return false;
      event.stopImmediatePropagation();
      event.stopPropagation();
      const snapped = new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, composed: true, view: window,
        clientX: event.clientX + dx, clientY: event.clientY + dy,
        screenX: event.screenX + dx, screenY: event.screenY + dy,
        button: event.button, buttons: event.buttons, detail: event.detail,
        pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
        width: event.width, height: event.height, pressure: event.pressure,
        tiltX: event.tiltX, tiltY: event.tiltY,
        ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey,
      });
      redispatching = true;
      try { target.dispatchEvent(snapped); } finally { redispatching = false; }
      return true;
    };
    const onPointerDown = (event) => {
      if (redispatching) return;
      const target = event.target instanceof Element ? event.target : null;
      if (event.button !== 0 || !target?.closest(".excalidraw")) return;
      // Selection handles and interaction overlays receive pointer events too;
      // listening only for .layer-canvas misses those normal drag gestures.
      if (target.closest(UI_SELECTOR)) return;
      const appState = apiRef?.current?.getAppState?.() || {};
      const tool = appState.activeTool?.type;
      if (tool && tool !== "selection") {
        // Creation tool press: snap first, then fade the ruler out so it never
        // sits over typing or drawing.
        if (PLACEMENT_TOOLS.has(tool)) {
          snapPlacementPress(event, target, appState, tool);
          pressed = true;
          hover = null;
          hidePlacement();
        }
        return;
      }
      // An object can be selected by this very pointerdown. Do not require
      // a pre-existing selection, or the first drag of an unselected object
      // will never display guides. Scene selection is read on each frame.
      // Only the selection tool starts move-drag guides.
      if (appState.activeTool?.type && appState.activeTool.type !== "selection") return;
      if (event.isPrimary === false) return;
      dragging = true;
      activePointerId = event.pointerId;
      lastPointer = { x: event.clientX, y: event.clientY };
      scheduleUpdate();
    };
    const onPointerMove = (event) => {
      altHeld = event.altKey;
      if (!dragging) {
        const target = event.target instanceof Element ? event.target : null;
        if (pressed || !target?.closest(".excalidraw") || target.closest(UI_SELECTOR)) { hover = null; hidePlacement(); return; }
        hover = { x: event.clientX, y: event.clientY };
        scheduleHover();
        return;
      }
      if (event.pointerId !== activePointerId) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      scheduleUpdate();
    };
    const onPointerEnd = (event) => {
      if (pressed) {
        // Resume hovering only after the next real pointer move, so the ruler
        // never reappears over a text editor that just opened.
        pressed = false;
        hover = null;
      }
      if (event.pointerId === activePointerId) {
        if (dragging) {
          // Excalidraw may write its raw drop position after our last frame;
          // re-apply the snap once it has settled, then drop every guide now.
          measureSpacing({ snap: true, showGuides: false });
          setTimeout(() => measureSpacing({ snap: true, showGuides: false }), 0);
        }
        clear();
      }
    };
    const onKey = (event) => {
      if (event.key !== "Alt") return;
      altHeld = event.type === "keydown";
      if (altHeld) hidePlacement(); else scheduleHover();
    };
    const onLeave = () => { hover = null; hidePlacement(); };
    root.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onNudgeKey);
    window.addEventListener("keyup", onKey);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("keydown", onNudgeKey);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      clear();
    };
  }, [apiRef, canvasRootRef, canEdit, viewModeEnabled]);

  const dragSvg = guides.length ? (
    <svg className="sketchizi-alignment-guides" style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }} viewBox={"0 0 " + Math.max(1, overlay.width) + " " + Math.max(1, overlay.height)} aria-hidden="true" focusable="false">
      {guides.map((guide, index) => guide.displayAxis === "x" ? (
        <line key={guide.kind + guide.axis + guide.screenPosition + index} data-guide-kind={guide.kind || "alignment"} x1={guide.screenPosition} x2={guide.screenPosition} y1={guide.screenStart} y2={guide.screenEnd} />
      ) : (
        <line key={guide.kind + guide.axis + guide.screenPosition + index} data-guide-kind={guide.kind || "alignment"} x1={guide.screenStart} x2={guide.screenEnd} y1={guide.screenPosition} y2={guide.screenPosition} />
      ))}
    </svg>
  ) : null;
  return (
    <>
      {dragSvg}
      {spacing && <SpacingOverlay spacing={spacing} overlay={overlay} />}
      {placement && <PlacementRuler placement={placement} overlay={overlay} />}
    </>
  );
}

/** Drafting-ruler overlay: guide line, 7px crosshair, indent bridge and pill. */
function PlacementRuler({ placement, overlay }) {
  const { cx, cy, v, h, visible } = placement;
  const width = Math.max(1, overlay.width);
  const height = Math.max(1, overlay.height);
  const pill = (label, kind, left, top) => (
    <span className="sketchizi-placement-pill" data-placement-kind={kind}
      style={{ left: clamp(left, 4, Math.max(4, width - 96)), top: clamp(top, 4, Math.max(4, height - 22)) }}>{label}</span>
  );
  return (
    <div className={`sketchizi-placement-guides${visible ? " is-visible" : ""}`} data-placement-guides="true"
      style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }} aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} focusable="false">
        {v && <line className="placement-line" data-placement-axis="x" x1={v.x} x2={v.x} y1={v.y1} y2={v.y2} />}
        {h && <line className="placement-line" data-placement-axis="y" x1={h.x1} x2={h.x2} y1={h.y} y2={h.y} />}
        {v && <>
          <line className="placement-tick" x1={v.x - TICK} x2={v.x + TICK} y1={cy} y2={cy} />
          <line className="placement-tick" x1={v.x} x2={v.x} y1={cy - TICK} y2={cy + TICK} />
        </>}
        {h && !v && <>
          <line className="placement-tick" x1={cx - TICK} x2={cx + TICK} y1={h.y} y2={h.y} />
          <line className="placement-tick" x1={cx} x2={cx} y1={h.y - TICK} y2={h.y + TICK} />
        </>}
        {v?.indent && <>
          <line className="placement-bridge" x1={v.parentX} x2={v.x} y1={cy} y2={cy} />
          <line className="placement-tick" x1={v.parentX} x2={v.parentX} y1={cy - TICK} y2={cy + TICK} />
          <line className="placement-tick" x1={v.x} x2={v.x} y1={cy - TICK} y2={cy + TICK} />
        </>}
      </svg>
      {v && pill(v.label, v.indent ? "indent" : "align-left", v.x + 10, cy + 14)}
      {h && pill(h.label, "center-y", cx + 10, h.y - 26)}
    </div>
  );
}

/**
 * Non-interactive measurement overlay. Drawn in scene units inside a group
 * transform so geometry tracks pan/zoom; every stroke, tick and label is
 * divided by `zoom` so it stays crisp and constant-size on screen.
 */
function SpacingOverlay({ spacing, overlay }) {
  const { zoom, scrollX, scrollY, prev, prevPrev, active, gap, referenceGap, isEqualSpacing, guideX, leftGuide } = spacing;
  const width = Math.max(1, overlay.width);
  const height = Math.max(1, overlay.height);
  const color = isEqualSpacing ? EQUAL_SPACING_COLOR : SPACING_COLOR;
  const sw = 1.25 / zoom;
  const tick = TICK_HALF / zoom;
  const ruler = (x, y1, y2, value, key) => {
    const label = formatGapLabel(value);
    const pillW = (label.length * 7 + 12) / zoom;
    const pillH = 18 / zoom;
    const cy = (y1 + y2) / 2;
    return (
      <g key={key} data-spacing-ruler={key}>
        <line x1={x} x2={x} y1={y1} y2={y2} stroke={color} strokeWidth={sw} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
        <line x1={x - tick} x2={x + tick} y1={y1} y2={y1} stroke={color} strokeWidth={sw} />
        <line x1={x - tick} x2={x + tick} y1={y2} y2={y2} stroke={color} strokeWidth={sw} />
        <rect x={x - pillW / 2} y={cy - pillH / 2} width={pillW} height={pillH} rx={pillH / 2} fill={color} />
        <text x={x} y={cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={11 / zoom} fontWeight="700"
          style={{ fontVariantNumeric: "tabular-nums" }}>{label}</text>
      </g>
    );
  };
  return (
    <svg className="sketchizi-spacing-guides" data-spacing-guides={isEqualSpacing ? "equal" : "measure"}
      style={{ left: overlay.left, top: overlay.top, width, height }} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <g transform={`scale(${zoom}) translate(${scrollX} ${scrollY})`}>
        {leftGuide && (
          <line data-guide-kind="left-edge" x1={leftGuide.x} x2={leftGuide.x} y1={leftGuide.y1 - 12 / zoom} y2={leftGuide.y2 + 12 / zoom}
            stroke={SPACING_COLOR} strokeWidth={sw} strokeDasharray={`${5 / zoom} ${4 / zoom}`} />
        )}
        {prev && guideX != null && gap != null && ruler(guideX, prev.bottom, active.top, gap, "primary")}
        {isEqualSpacing && prevPrev && prev && referenceGap != null && ruler(
          (Math.max(prevPrev.left, prev.left) + Math.min(prevPrev.right, prev.right)) / 2,
          prevPrev.bottom, prev.top, referenceGap, "reference",
        )}
      </g>
    </svg>
  );
}
