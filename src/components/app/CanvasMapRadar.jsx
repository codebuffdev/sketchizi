import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  RADAR_VIOLET,
  clampCenterToWorld,
  computeRadarTransform,
  getContentBounds,
  getElementGeometry,
  getViewportRect,
  isDrawable,
  pointInRect,
  radarFill,
  radarStroke,
  radarToWorld,
  scrollForCenter,
  worldToRadar,
} from "../../features/canvas/mapRadar.js";

const FALLBACK_SIZE = { width: 228, height: 124 };
const ARROW_KEY_STEP = 0.12; // fraction of the camera moved per arrow press
const CLICK_SLOP_PX = 3; // press-and-release within this distance is a click, not a drag

function readFallbackViewport() {
  const rect = document.querySelector(".excalidraw")?.getBoundingClientRect();
  return rect && rect.width ? { width: rect.width, height: rect.height } : undefined;
}

// CanvasRenderingContext2D.roundRect needs Chrome 99 / Safari 16; degrade to rect().
function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawElement(ctx, element, tf, isDark, selected) {
  const { box, points } = getElementGeometry(element);
  const topLeft = worldToRadar(tf, box.x, box.y);
  // Keep tiny elements visible as a speck rather than dropping them.
  const w = Math.max(1.4, box.w * tf.scale);
  const h = Math.max(1.4, box.h * tf.scale);
  const opacity = Math.min(1, Math.max(0.35, (Number(element.opacity) || 100) / 100));
  const stroke = selected ? RADAR_VIOLET : radarStroke(element.strokeColor, isDark);
  const fill = radarFill(element.backgroundColor, isDark);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineWidth = selected ? 1.5 : 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = stroke;

  if (element.angle) {
    const cx = topLeft.x + w / 2;
    const cy = topLeft.y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(element.angle);
    ctx.translate(-cx, -cy);
  }

  const paintShape = (pathFn) => {
    ctx.beginPath();
    pathFn();
    if (fill) {
      ctx.globalAlpha = opacity * 0.5;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = opacity;
    }
    ctx.stroke();
  };

  switch (element.type) {
    case "ellipse":
      paintShape(() => ctx.ellipse(topLeft.x + w / 2, topLeft.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2));
      break;
    case "diamond":
      paintShape(() => {
        ctx.moveTo(topLeft.x + w / 2, topLeft.y);
        ctx.lineTo(topLeft.x + w, topLeft.y + h / 2);
        ctx.lineTo(topLeft.x + w / 2, topLeft.y + h);
        ctx.lineTo(topLeft.x, topLeft.y + h / 2);
        ctx.closePath();
      });
      break;
    case "line":
    case "arrow":
    case "freedraw": {
      if (!points || points.length < 2) {
        ctx.fillStyle = stroke;
        ctx.fillRect(topLeft.x, topLeft.y, w, h);
        break;
      }
      ctx.beginPath();
      points.forEach((point, index) => {
        const p = worldToRadar(tf, element.x + point[0], element.y + point[1]);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      break;
    }
    case "text":
      // Text bound to a shape is already inside that shape's silhouette.
      if (element.containerId) break;
      ctx.globalAlpha = opacity * 0.55;
      ctx.fillStyle = stroke;
      ctx.beginPath();
      roundRectPath(ctx, topLeft.x, topLeft.y + h * 0.3, w, Math.max(1.4, h * 0.4), 1);
      ctx.fill();
      break;
    case "frame":
    case "magicframe":
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      roundRectPath(ctx, topLeft.x, topLeft.y, w, h, 2);
      ctx.stroke();
      break;
    case "image":
      ctx.globalAlpha = opacity * 0.4;
      ctx.fillStyle = stroke;
      ctx.beginPath();
      roundRectPath(ctx, topLeft.x, topLeft.y, w, h, 1.5);
      ctx.fill();
      ctx.globalAlpha = opacity;
      ctx.stroke();
      break;
    default:
      paintShape(() => roundRectPath(ctx, topLeft.x, topLeft.y, w, h, Math.min(2.5, w / 4, h / 4)));
  }
  ctx.restore();
}

export default function CanvasMapRadar({
  apiRef,
  isDarkTheme = true,
  onClose,
  onFit,
  onDragChange,
  onViewportChange,
}) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  // Mutable render state lives in a ref so pointer-driven redraws never
  // re-render React. Only the header readouts use state.
  const live = useRef({
    elements: [],
    appState: null,
    size: { ...FALLBACK_SIZE, dpr: 1 },
    drag: null,
    tf: null,
    lens: null,
    dark: isDarkTheme,
  });
  const [zoomPercent, setZoomPercent] = useState(() => Math.round((apiRef.current?.getAppState?.()?.zoom?.value || 1) * 100));
  const [isEmpty, setIsEmpty] = useState(false);

  live.current.dark = isDarkTheme;
  // Latest callbacks, so handlers and unmount cleanup never go stale.
  const callbacks = useRef({});
  callbacks.current = { onDragChange, onViewportChange };

  /** Camera rectangle in world space; while dragging it follows the pointer. */
  const resolveFrame = useCallback(() => {
    const L = live.current;
    const appState = L.appState || apiRef.current?.getAppState?.() || {};
    const viewport = getViewportRect(appState, readFallbackViewport());
    if (L.drag) {
      viewport.x = L.drag.center.x - viewport.w / 2;
      viewport.y = L.drag.center.y - viewport.h / 2;
    }
    const content = getContentBounds(L.elements);
    // The transform is frozen for the duration of a drag so 1 radar px is
    // always the same number of world units and the lens tracks 1:1.
    const tf = L.drag
      ? L.drag.tf
      : computeRadarTransform({ content, viewport, width: L.size.width, height: L.size.height });
    return { appState, viewport, content, tf };
  }, [apiRef]);

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    const L = live.current;
    if (!canvas) return;

    // Flush the pending pan from the pointer handler (one scene update per frame).
    if (L.drag?.pending) {
      L.drag.pending = false;
      const api = apiRef.current;
      const { viewport } = resolveFrame();
      api?.updateScene?.({
        appState: scrollForCenter(L.drag.center.x, L.drag.center.y, viewport.w, viewport.h),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      callbacks.current.onViewportChange?.();
    }

    const { appState, viewport, content, tf } = resolveFrame();
    L.tf = tf;
    L.lens = viewport;

    const { width, height, dpr } = L.size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const selectedIds = appState.selectedElementIds || {};
    for (const element of L.elements) {
      if (!isDrawable(element)) continue;
      drawElement(ctx, element, tf, L.dark, Boolean(selectedIds[element.id]));
    }

    // Camera lens: viewportSize / zoom in world units.
    const topLeft = worldToRadar(tf, viewport.x, viewport.y);
    const lensW = Math.max(6, viewport.w * tf.scale);
    const lensH = Math.max(5, viewport.h * tf.scale);
    ctx.save();
    ctx.fillStyle = "rgba(139, 92, 246, 0.14)";
    ctx.strokeStyle = RADAR_VIOLET;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    roundRectPath(ctx, topLeft.x, topLeft.y, lensW, lensH, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const percent = Math.round(viewport.zoom * 100);
    setZoomPercent((current) => (current === percent ? current : percent));
    const empty = !content;
    setIsEmpty((current) => (current === empty ? current : empty));
  }, [apiRef, resolveFrame]);

  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Size the backing store for devicePixelRatio.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return undefined;
    const resize = () => {
      // clientWidth/Height ignore the popover's enter transform.
      const width = Math.max(1, stage.clientWidth || FALLBACK_SIZE.width);
      const height = Math.max(1, stage.clientHeight || FALLBACK_SIZE.height);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      live.current.size = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      schedule();
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(stage);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [schedule]);

  // Stay live with the canvas: scene edits, pan and zoom all arrive via onChange.
  useEffect(() => {
    const api = apiRef.current;
    const L = live.current;
    L.elements = api?.getSceneElements?.() || [];
    L.appState = api?.getAppState?.() || null;
    schedule();
    const unsubscribe = api?.onChange?.((elements, appState) => {
      L.elements = elements || [];
      L.appState = appState || L.appState;
      schedule();
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [apiRef, schedule]);

  useEffect(() => { schedule(); }, [isDarkTheme, schedule]);

  // ---- pointer interaction --------------------------------------------------

  const localPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? canvas.clientWidth / rect.width : 1;
    const sy = rect.height ? canvas.clientHeight / rect.height : 1;
    return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy };
  };

  const endDrag = useCallback((event) => {
    const L = live.current;
    const drag = L.drag;
    if (!drag) return;
    if (event && drag.pointerId !== event.pointerId) return;
    // A click (no drag) on the lens would otherwise do nothing: jump to it, so
    // click-to-jump works anywhere on the radar.
    if (event?.type === "pointerup" && drag.grabbed && !drag.moved) {
      drag.center = clampCenterToWorld(drag.tf, drag.clickWorld.x, drag.clickWorld.y);
      drag.pending = true;
    }
    if (drag.pending) draw(); // flush the last position before releasing
    L.drag = null;
    try { canvasRef.current?.releasePointerCapture?.(drag.pointerId); } catch { /* already released */ }
    if (canvasRef.current) canvasRef.current.style.cursor = "";
    callbacks.current.onDragChange?.(false);
    schedule();
  }, [draw, schedule]);

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();
    const L = live.current;
    const { viewport, tf } = resolveFrame();
    const pointer = localPoint(event);
    const world = radarToWorld(tf, pointer.x, pointer.y);
    const lens = { x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h };
    const lensCenter = { x: lens.x + lens.w / 2, y: lens.y + lens.h / 2 };

    // Grab the lens where you touched it; anywhere else jumps the camera there
    // and carries on as a drag from the lens centre.
    const grabbed = pointInRect(world.x, world.y, lens);
    const grab = grabbed ? { x: world.x - lensCenter.x, y: world.y - lensCenter.y } : { x: 0, y: 0 };
    const center = clampCenterToWorld(tf, world.x - grab.x, world.y - grab.y);

    L.drag = {
      pointerId: event.pointerId, tf, grab, center, pending: true,
      grabbed, moved: false, start: pointer, clickWorld: world,
    };
    try { canvasRef.current.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    canvasRef.current.style.cursor = "grabbing";
    callbacks.current.onDragChange?.(true);
    schedule();
  };

  const handlePointerMove = (event) => {
    const L = live.current;
    const drag = L.drag;
    if (!drag) {
      // Hover affordance: grab over the lens, crosshair elsewhere.
      if (L.tf && L.lens && event.pointerType === "mouse") {
        const pointer = localPoint(event);
        const world = radarToWorld(L.tf, pointer.x, pointer.y);
        canvasRef.current.style.cursor = pointInRect(world.x, world.y, L.lens) ? "grab" : "";
      }
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    const pointer = localPoint(event);
    if (!drag.moved && Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) > CLICK_SLOP_PX) drag.moved = true;
    // Until the pointer leaves the click slop, a lens grab holds still.
    if (drag.grabbed && !drag.moved) return;
    const world = radarToWorld(drag.tf, pointer.x, pointer.y);
    drag.center = clampCenterToWorld(drag.tf, world.x - drag.grab.x, world.y - drag.grab.y);
    drag.pending = true;
    schedule();
  };

  const handleKeyDown = (event) => {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!dir) return;
    event.preventDefault();
    event.stopPropagation();
    const L = live.current;
    const { viewport, tf } = resolveFrame();
    const center = clampCenterToWorld(
      tf,
      viewport.x + viewport.w / 2 + dir[0] * viewport.w * ARROW_KEY_STEP,
      viewport.y + viewport.h / 2 + dir[1] * viewport.h * ARROW_KEY_STEP,
    );
    L.appState = { ...(L.appState || {}), ...scrollForCenter(center.x, center.y, viewport.w, viewport.h) };
    apiRef.current?.updateScene?.({
      appState: scrollForCenter(center.x, center.y, viewport.w, viewport.h),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    callbacks.current.onViewportChange?.();
    schedule();
  };

  // A drag that ends because the popover unmounts must still release the lock.
  useEffect(() => () => {
    if (live.current.drag) {
      live.current.drag = null;
      callbacks.current.onDragChange?.(false);
    }
  }, []);

  return (
    <>
      <div className="sk-map-head">
        <span className="sk-map-title">Map</span>
        <span className="sk-map-zoom" title="Current zoom" aria-label={`Zoom ${zoomPercent} percent`}>{zoomPercent}%</span>
        <button
          type="button"
          className="sk-map-fit"
          onClick={onFit}
          disabled={isEmpty}
          title="Center and fit all content (1)"
          aria-keyshortcuts="1"
        >
          <span>Fit</span>
          <kbd>1</kbd>
        </button>
        <button
          type="button"
          className="sk-map-esc"
          onClick={onClose}
          title="Close map (Esc)"
          aria-label="Close map"
        >
          <kbd>Esc</kbd>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="sk-map-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="sk-map-canvas"
          tabIndex={0}
          role="application"
          aria-label="Canvas map. Click or drag to move the view. Arrow keys pan."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={handleKeyDown}
        />
        {isEmpty && <span className="sk-map-empty">Nothing on the canvas yet</span>}
      </div>
    </>
  );
}
