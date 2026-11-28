import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampScroll,
  computeScrollState,
  scrollForProgress,
  thumbLength,
} from "../../features/canvas/scrollbarModel.js";

const WAKE_MS = 900; // idle time before the thumb fades out after a wheel scroll / drag
const LERP = 0.14;
const SETTLE_PX = 0.35;

const AXES = {
  vertical: { scrollKey: "scrollY", size: "height", client: "clientY", wheelDelta: "deltaY" },
  horizontal: { scrollKey: "scrollX", size: "width", client: "clientX", wheelDelta: "deltaX" },
};

/**
 * One scrollbar axis. Excalidraw keeps its camera in appState.scrollX/scrollY, so the
 * thumb is mapped onto the padded bounds of the drawn content (see scrollbarModel.js).
 * The track is hidden entirely when the canvas is empty or the content fits the viewport.
 */
function useScrollAxis({ name, apiRef, canvasRootRef, canvasRevision, disabled }) {
  const cfg = AXES[name];
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const axisRef = useRef({ enabled: false });
  const frameRef = useRef(0);
  const currentRef = useRef(0);
  const targetRef = useRef(0);
  const draggingRef = useRef(null);
  const wakeTimerRef = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [awake, setAwake] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [percent, setPercent] = useState(0);

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(wakeTimerRef.current);
    wakeTimerRef.current = window.setTimeout(() => {
      wakeTimerRef.current = 0;
      if (!draggingRef.current) setAwake(false);
    }, WAKE_MS);
  }, []);

  const measure = useCallback(() => {
    const api = apiRef?.current;
    const root = canvasRootRef?.current;
    if (!api || !root) return axisRef.current;
    const rect = root.getBoundingClientRect();
    const state = computeScrollState({
      elements: api.getSceneElements?.() || [],
      appState: api.getAppState?.() || {},
      width: rect.width,
      height: rect.height,
    });
    axisRef.current = state[name];
    setEnabled((previous) => (previous === axisRef.current.enabled ? previous : axisRef.current.enabled));
    return axisRef.current;
  }, [apiRef, canvasRootRef, name]);

  const paint = useCallback(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const axis = axisRef.current;
    if (!track || !thumb || !axis.enabled) return;
    const trackPx = cfg.size === "height" ? track.clientHeight : track.clientWidth;
    if (!trackPx) return;
    const length = thumbLength(axis, trackPx);
    const span = axis.scrollMax - axis.scrollMin;
    const progress = span > 0 ? Math.max(0, Math.min(1, (currentRef.current - axis.scrollMin) / span)) : 0;
    const offset = progress * Math.max(0, trackPx - length);
    thumb.style[cfg.size] = `${length}px`;
    thumb.style.transform = name === "vertical" ? `translate3d(0, ${offset}px, 0)` : `translate3d(${offset}px, 0, 0)`;
    setPercent(Math.round(progress * 100));
  }, [cfg.size, name]);

  const write = useCallback((value) => {
    apiRef?.current?.updateScene?.({ appState: { [cfg.scrollKey]: -value }, captureUpdate: "NEVER" });
  }, [apiRef, cfg.scrollKey]);

  const stopAnimation = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  /** Glide the camera to `next`, always clamped to the drawn bounds. */
  const animateTo = useCallback((next) => {
    targetRef.current = clampScroll(axisRef.current, next);
    if (frameRef.current) return;
    const tick = () => {
      const difference = targetRef.current - currentRef.current;
      if (Math.abs(difference) < SETTLE_PX) {
        currentRef.current = targetRef.current;
        frameRef.current = 0;
      } else {
        currentRef.current += difference * LERP;
        frameRef.current = requestAnimationFrame(tick);
      }
      write(currentRef.current);
      paint();
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [paint, write]);

  // Keep metrics + thumb in sync with every scene / camera change.
  useEffect(() => {
    if (disabled) return;
    const axis = measure();
    if (!draggingRef.current && !frameRef.current) {
      currentRef.current = axis.top ?? 0;
      targetRef.current = currentRef.current;
    }
    paint();
  }, [canvasRevision, disabled, enabled, measure, paint]);

  useEffect(() => {
    if (disabled) return undefined;
    const onResize = () => { measure(); paint(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [disabled, measure, paint]);

  useEffect(() => () => { stopAnimation(); window.clearTimeout(wakeTimerRef.current); }, [stopAnimation]);

  /** Wheel delta in CSS px along this axis. Returns false when the axis is not scrollable (native pan applies). */
  const wheelBy = useCallback((deltaPx) => {
    const axis = measure();
    if (!axis.enabled) return false;
    if (!frameRef.current && !draggingRef.current) { currentRef.current = axis.top; targetRef.current = axis.top; }
    const zoom = Math.max(0.01, Number(apiRef.current?.getAppState?.()?.zoom?.value) || 1);
    animateTo(targetRef.current + deltaPx / zoom);
    wake();
    return true;
  }, [animateTo, apiRef, measure, wake]);

  const jumpTo = (clientPos) => {
    const track = trackRef.current;
    const axis = axisRef.current;
    if (!track || !axis.enabled) return;
    const rect = track.getBoundingClientRect();
    const trackPx = cfg.size === "height" ? rect.height : rect.width;
    const start = cfg.size === "height" ? rect.top : rect.left;
    const length = thumbLength(axis, trackPx);
    const travel = Math.max(1, trackPx - length);
    animateTo(scrollForProgress(axis, (clientPos - start - length / 2) / travel));
    wake();
  };

  const onThumbPointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    measure();
    draggingRef.current = { pointerId: event.pointerId, start: event[cfg.client], startScroll: currentRef.current };
    stopAnimation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    setAwake(true);
  };
  const onThumbPointerMove = (event) => {
    const drag = draggingRef.current;
    const track = trackRef.current;
    const axis = axisRef.current;
    if (!drag || !track || !axis.enabled || drag.pointerId !== event.pointerId) return;
    const trackPx = cfg.size === "height" ? track.clientHeight : track.clientWidth;
    const travel = Math.max(1, trackPx - thumbLength(axis, trackPx));
    const next = drag.startScroll + ((event[cfg.client] - drag.start) / travel) * (axis.scrollMax - axis.scrollMin);
    currentRef.current = clampScroll(axis, next);
    targetRef.current = currentRef.current;
    write(currentRef.current);
    paint();
  };
  const onThumbPointerUp = (event) => {
    if (draggingRef.current?.pointerId !== event.pointerId) return;
    draggingRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    wake();
  };

  return { name, trackRef, thumbRef, enabled, awake, dragging, percent, wheelBy, jumpTo, onThumbPointerDown, onThumbPointerMove, onThumbPointerUp };
}

function Axis({ axis }) {
  const { name, enabled, awake, dragging } = axis;
  return (
    <div
      className={`sketchizi-scrollzone is-${name}${enabled ? "" : " is-disabled"}${awake ? " is-awake" : ""}${dragging ? " is-dragging" : ""}`}
      ref={axis.trackRef}
      role="scrollbar"
      aria-label={`Canvas ${name} position`}
      aria-orientation={name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={axis.percent}
      aria-hidden={!enabled}
      data-axis={name}
      onPointerDown={(event) => { if (event.target === event.currentTarget) axis.jumpTo(event[AXES[name].client]); }}
    >
      <div
        className="sketchizi-scroll-thumb"
        ref={axis.thumbRef}
        onPointerDown={axis.onThumbPointerDown}
        onPointerMove={axis.onThumbPointerMove}
        onPointerUp={axis.onThumbPointerUp}
        onPointerCancel={axis.onThumbPointerUp}
      />
    </div>
  );
}

/**
 * Content-bounded, auto-hiding, hover-revealed floating scrollbars for the infinite canvas.
 * Hidden (display: none) on an empty canvas or when the drawing fits the viewport on that axis.
 */
export default function CanvasScrollbars({ apiRef, canvasRootRef, canvasRevision = 0, disabled = false }) {
  const shared = { apiRef, canvasRootRef, canvasRevision, disabled };
  const vertical = useScrollAxis({ name: "vertical", ...shared });
  const horizontal = useScrollAxis({ name: "horizontal", ...shared });
  const verticalRef = useRef(vertical);
  const horizontalRef = useRef(horizontal);
  verticalRef.current = vertical;
  horizontalRef.current = horizontal;

  // One wheel listener for both axes. Zoom chords (Ctrl/Cmd/Alt) always pass through. When the
  // relevant axis is not scrollable (empty / fits) the wheel is left to Excalidraw untouched.
  useEffect(() => {
    const root = canvasRootRef?.current;
    if (!root || disabled) return undefined;
    const onWheel = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const onZone = event.target instanceof Element && Boolean(event.target.closest(".sketchizi-scrollzone"));
      if (!onZone && !(event.target instanceof HTMLCanvasElement)) return;
      const horizontalIntent = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const raw = horizontalIntent ? (event.shiftKey ? (event.deltaY || event.deltaX) : event.deltaX) : event.deltaY;
      const rect = root.getBoundingClientRect();
      const axis = horizontalIntent ? horizontalRef.current : verticalRef.current;
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? (horizontalIntent ? rect.width : rect.height) : 1;
      if (!axis.wheelBy(raw * unit)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => root.removeEventListener("wheel", onWheel, true);
  }, [canvasRootRef, disabled]);

  if (disabled) return null;
  return (
    <>
      <Axis axis={vertical} />
      <Axis axis={horizontal} />
    </>
  );
}
