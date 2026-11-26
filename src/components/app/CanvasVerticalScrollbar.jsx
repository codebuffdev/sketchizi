import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A camera-aware vertical navigator for Excalidraw's infinite canvas.
 * Excalidraw stores camera position in appState.scrollY rather than a DOM
 * scrollTop, so this control maps the visible scene bounds to a virtual track.
 */
export default function CanvasVerticalScrollbar({ apiRef, canvasRootRef, canvasRevision = 0, disabled = false }) {
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const frameRef = useRef(0);
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  const boundsRef = useRef({ min: -1000, max: 1000, viewport: 800 });
  const draggingRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [percent, setPercent] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(64);

  const readCamera = useCallback(() => {
    const api = apiRef?.current;
    const root = canvasRootRef?.current;
    if (!api || !root) return null;
    const state = api.getAppState?.() || {};
    const zoom = Math.max(0.01, Number(state.zoom?.value ?? state.zoom) || 1);
    const viewport = Math.max(1, root.getBoundingClientRect().height / zoom);
    const top = -(Number(state.scrollY) || 0);
    const elements = (api.getSceneElements?.() || []).filter((el) => el && !el.isDeleted && !el.deleted);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const el of elements) {
      const y = Number(el.y) || 0;
      const h = Math.max(0, Number(el.height) || 0);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + h);
    }
    if (!Number.isFinite(minY)) { minY = top - viewport; maxY = top + viewport * 2; }
    const min = Math.min(minY - viewport * 0.65, top - viewport);
    const max = Math.max(maxY - viewport * 0.35, top + viewport);
    boundsRef.current = { min, max: Math.max(min + viewport, max), viewport };
    return { top, bounds: boundsRef.current };
  }, [apiRef, canvasRootRef]);

  const paintThumb = useCallback(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;
    const { min, max } = boundsRef.current;
    const range = Math.max(1, max - min);
    const progress = Math.max(0, Math.min(1, (currentRef.current - min) / range));
    const height = Math.max(32, Math.min(track.clientHeight, track.clientHeight * boundsRef.current.viewport / (range + boundsRef.current.viewport)));
    setThumbHeight(height);
    thumb.style.height = height + "px";
    const travel = Math.max(0, track.clientHeight - height);
    thumb.style.transform = `translate3d(0, ${progress * travel}px, 0)`;
    setPercent(Math.round(progress * 100));
  }, []);

  const stopAnimation = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  const animateTo = useCallback((next) => {
    const { min, max } = boundsRef.current;
    targetRef.current = Math.max(min, Math.min(max, next));
    if (frameRef.current) return;
    const tick = () => {
      const difference = targetRef.current - currentRef.current;
      if (Math.abs(difference) < 0.35) {
        currentRef.current = targetRef.current;
        frameRef.current = 0;
      } else {
        currentRef.current += difference * 0.14;
        frameRef.current = requestAnimationFrame(tick);
      }
      apiRef?.current?.updateScene?.({
        appState: { scrollY: -currentRef.current },
        captureUpdate: "NEVER",
      });
      paintThumb();
      if (!frameRef.current && Math.abs(targetRef.current - currentRef.current) >= 0.35) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [apiRef, paintThumb]);

  useEffect(() => {
    if (disabled) return undefined;
    const camera = readCamera();
    if (camera && !draggingRef.current && !frameRef.current) {
      currentRef.current = camera.top;
      targetRef.current = camera.top;
    }
    paintThumb();
  }, [canvasRevision, disabled, readCamera, paintThumb]);

  useEffect(() => {
    const root = canvasRootRef?.current;
    if (!root || disabled) return undefined;
    const reveal = (event) => {
      if (window.innerWidth - event.clientX <= 48) setVisible(true);
      else if (!draggingRef.current && !trackRef.current?.matches(":hover")) setVisible(false);
    };
    const onLeave = () => { if (!draggingRef.current) setVisible(false); };
    const onWheel = (event) => {
      if (window.innerWidth - event.clientX > 48 || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const camera = readCamera();
      if (!camera) return;
      animateTo(targetRef.current + event.deltaY / Math.max(0.01, Number(apiRef.current?.getAppState?.()?.zoom?.value) || 1));
      setVisible(true);
    };
    window.addEventListener("pointermove", reveal, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    const onResize = () => { readCamera(); paintThumb(); };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointermove", reveal);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("resize", onResize);
    };
  }, [apiRef, animateTo, canvasRootRef, disabled, paintThumb, readCamera]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  const jumpTo = (clientY) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const height = thumbRef.current?.getBoundingClientRect().height || thumbHeight;
    const travel = Math.max(1, rect.height - height);
    const progress = Math.max(0, Math.min(1, (clientY - rect.top - height / 2) / travel));
    const { min, max } = boundsRef.current;
    animateTo(min + progress * (max - min));
  };

  const onThumbPointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = { pointerId: event.pointerId, startY: event.clientY, startScroll: currentRef.current };
    stopAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setVisible(true);
  };
  const onThumbPointerMove = (event) => {
    const drag = draggingRef.current;
    const track = trackRef.current;
    if (!drag || !track || drag.pointerId !== event.pointerId) return;
    const height = thumbRef.current?.getBoundingClientRect().height || thumbHeight;
    const travel = Math.max(1, track.clientHeight - height);
    const { min, max } = boundsRef.current;
    const next = drag.startScroll + (event.clientY - drag.startY) / travel * (max - min);
    currentRef.current = Math.max(min, Math.min(max, next));
    targetRef.current = currentRef.current;
    apiRef?.current?.updateScene?.({ appState: { scrollY: -currentRef.current }, captureUpdate: "NEVER" });
    paintThumb();
  };
  const onThumbPointerUp = (event) => {
    if (draggingRef.current?.pointerId !== event.pointerId) return;
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (disabled) return null;
  return (
    <aside className={`sketchizi-canvas-scrollbar${visible ? " is-visible" : ""}`} aria-label="Canvas vertical navigation"
      onPointerEnter={() => setVisible(true)} onPointerLeave={() => { if (!draggingRef.current) setVisible(false); }}>
      <button className="sketchizi-scroll-step" type="button" aria-label="Scroll canvas up" onClick={() => animateTo(targetRef.current - boundsRef.current.viewport * 0.16)}>▲</button>
      <div className="sketchizi-scroll-track" ref={trackRef} role="scrollbar" aria-label="Canvas vertical position" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        onPointerDown={(event) => { if (event.target === trackRef.current) jumpTo(event.clientY); }}>
        <div className="sketchizi-scroll-thumb" ref={thumbRef} onPointerDown={onThumbPointerDown} onPointerMove={onThumbPointerMove} onPointerUp={onThumbPointerUp} onPointerCancel={onThumbPointerUp} />
      </div>
      <span className="sketchizi-scroll-percent" aria-live="off">{percent}%</span>
      <button className="sketchizi-scroll-step" type="button" aria-label="Scroll canvas down" onClick={() => animateTo(targetRef.current + boundsRef.current.viewport * 0.16)}>▼</button>
    </aside>
  );
}
