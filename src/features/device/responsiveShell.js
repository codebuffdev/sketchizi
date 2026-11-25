/**
 * Responsive shell runtime.
 *
 * CSS (src/styles/responsive-fluid.css) owns layout. This module only supplies
 * the things CSS cannot do on its own:
 *   1. a single source of truth for the viewport class (phone / tablet / desktop)
 *   2. a "drawing in progress" signal so chrome can dim while the user draws
 *   3. Safari's non-standard pinch gesture guard on the canvas
 *   4. clamping of popover menus that would otherwise overflow the viewport
 *   5. drag-to-dismiss for bottom sheets on phones
 *
 * Excalidraw already implements wheel/trackpad zoom, two-finger pinch zoom and
 * pan. We intentionally do NOT re-implement those; `touch-action: none` on the
 * canvas (see CSS) is what keeps the browser from hijacking the gestures.
 */

export const BREAKPOINTS = Object.freeze({ tablet: 768, desktop: 1024 });

/** Popover-style surfaces that are positioned by feature CSS and may overflow. */
export const POPOVER_SELECTOR = [
  ".sk-tool-choice-menu",
  ".sketchizi-more-tools-menu",
  ".desktop-app-dropdown",
  ".workspace-popover-menu",
  ".smart-studio-popover",
  ".canvas-pages-chapter-popover",
  ".collaboration-share-panel",
  ".sketchizi-todo-popover:not(.is-full-page)",
  "[data-rf-popover]",
].join(",");

/** Side panels that become slide-over drawers (tablet) and bottom sheets (phone). */
export const SHEET_SELECTOR = [
  ".library-panel",
  ".properties-panel",
  ".architecture-validation-panel",
  ".ai-ask-panel",
  ".sd-drawer",
  "[data-rf-sheet]",
].join(",");

const SHEET_CLOSE_SELECTOR = [
  "[data-rf-close]",
  ".mobile-panel-close",
  ".properties-close",
  ".architecture-validation-close",
  "button[aria-label^='Close']",
  "button[aria-label^='Hide']",
].join(",");

/** Height (px) of the grabber strip at the top of a sheet that starts a drag. */
export const SHEET_GRAB_ZONE = 44;

export function getViewportClass(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return "desktop";
  if (w < BREAKPOINTS.tablet) return "phone";
  if (w < BREAKPOINTS.desktop) return "tablet";
  return "desktop";
}

/**
 * Offset (dx, dy) that moves `rect` fully inside `bounds`, keeping `margin` px
 * of breathing room. If the rect is larger than the bounds it is pinned to the
 * top/left edge instead of oscillating.
 */
export function computeClampOffset(rect, bounds, margin = 8) {
  const axis = (start, end, min, max) => {
    const size = end - start;
    if (size > max - min - margin * 2) return min + margin - start;
    if (start < min + margin) return min + margin - start;
    if (end > max - margin) return max - margin - end;
    return 0;
  };
  return {
    dx: Math.round(axis(rect.left, rect.right, bounds.left, bounds.right)),
    dy: Math.round(axis(rect.top, rect.bottom, bounds.top, bounds.bottom)),
  };
}

export function shouldDismissSheet({ dy, velocity = 0, height = 0 }) {
  if (dy <= 0) return false;
  const distance = Math.min(120, Math.max(60, height * 0.25));
  return dy >= distance || velocity >= 0.6;
}

const raf = (win, fn) => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : win.setTimeout(fn, 16));

function readSafeInsets(doc) {
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:fixed", "visibility:hidden", "pointer-events:none", "inset:0",
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)",
  ].join(";");
  doc.body.appendChild(probe);
  const cs = doc.defaultView.getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

export function installResponsiveShell(win = typeof window !== "undefined" ? window : null) {
  if (!win || !win.document) return () => {};
  const doc = win.document;
  const root = doc.documentElement;
  const cleanups = [];
  const on = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  /* ---- 1. viewport state ------------------------------------------------ */
  let frame = 0;
  const applyViewport = () => {
    frame = 0;
    const vv = win.visualViewport;
    const width = win.innerWidth || root.clientWidth;
    const height = win.innerHeight || root.clientHeight;
    root.dataset.viewport = getViewportClass(width);
    root.dataset.orientation = width > height ? "landscape" : "portrait";
    root.style.setProperty("--app-vw", `${width}px`);
    root.style.setProperty("--app-vh", `${height}px`);
    // On-screen keyboard height, so sheets/dialogs can lift above it.
    const keyboard = vv ? Math.max(0, Math.round(height - vv.height - vv.offsetTop)) : 0;
    root.style.setProperty("--keyboard-inset", `${keyboard}px`);
    scheduleClamp();
  };
  const scheduleViewport = () => { if (!frame) frame = raf(win, applyViewport); };

  const coarse = win.matchMedia?.("(pointer: coarse)");
  const applyInput = () => { root.dataset.input = coarse?.matches ? "coarse" : "fine"; };
  applyInput();
  coarse?.addEventListener?.("change", applyInput);
  cleanups.push(() => coarse?.removeEventListener?.("change", applyInput));

  on(win, "resize", scheduleViewport, { passive: true });
  on(win, "orientationchange", scheduleViewport, { passive: true });
  on(win.visualViewport, "resize", scheduleViewport, { passive: true });
  on(win.visualViewport, "scroll", scheduleViewport, { passive: true });

  /* ---- 2. drawing signal: lets CSS dim chrome while drawing -------------- */
  let drawingTimer = 0;
  const inCanvas = (event) => event.target instanceof win.Element && event.target.closest?.(".canvas .excalidraw canvas");
  on(doc, "pointerdown", (event) => {
    if (event.pointerType === "mouse" || !inCanvas(event)) return;
    win.clearTimeout(drawingTimer);
    root.dataset.canvasActive = "true";
  }, { capture: true, passive: true });
  const endDrawing = () => {
    win.clearTimeout(drawingTimer);
    drawingTimer = win.setTimeout(() => { delete root.dataset.canvasActive; }, 260);
  };
  on(win, "pointerup", endDrawing, { capture: true, passive: true });
  on(win, "pointercancel", endDrawing, { capture: true, passive: true });

  /* ---- 3. Safari pinch gesture guard (canvas only) ----------------------- */
  const blockGesture = (event) => { if (inCanvas(event) || event.target?.closest?.(".canvas")) event.preventDefault(); };
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => on(doc, type, blockGesture, { passive: false }));

  /* ---- 4. popover clamping ---------------------------------------------- */
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let clampFrame = 0;
  const clampAll = () => {
    clampFrame = 0;
    const vw = win.innerWidth;
    const vh = win.visualViewport ? win.visualViewport.height : win.innerHeight;
    const bounds = { left: insets.left, top: insets.top, right: vw - insets.right, bottom: vh - insets.bottom };
    doc.querySelectorAll(POPOVER_SELECTOR).forEach((el) => {
      const style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.position === "static") return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const prevX = Number(el.dataset.rfDx || 0);
      const prevY = Number(el.dataset.rfDy || 0);
      // Measure where the popover would sit without our own correction.
      const natural = {
        left: rect.left - prevX, right: rect.right - prevX,
        top: rect.top - prevY, bottom: rect.bottom - prevY,
      };
      const { dx, dy } = computeClampOffset(natural, bounds, 8);
      if (dx === prevX && dy === prevY) return;
      el.dataset.rfDx = String(dx);
      el.dataset.rfDy = String(dy);
      el.style.translate = dx || dy ? `${dx}px ${dy}px` : "";
    });
  };
  function scheduleClamp() { if (!clampFrame) clampFrame = raf(win, clampAll); }

  if (doc.body) {
    insets = readSafeInsets(doc);
    const observer = new win.MutationObserver(scheduleClamp);
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-expanded", "open", "style"] });
    cleanups.push(() => observer.disconnect());
  }

  /* ---- 5. bottom-sheet drag-to-dismiss (phones) -------------------------- */
  const phoneQuery = win.matchMedia?.(`(max-width: ${BREAKPOINTS.tablet - 1}px)`);
  let drag = null;
  on(doc, "pointerdown", (event) => {
    if (!phoneQuery?.matches || (event.pointerType === "mouse" && event.button !== 0)) return;
    const sheet = event.target instanceof win.Element ? event.target.closest(SHEET_SELECTOR) : null;
    if (!sheet) return;
    const rect = sheet.getBoundingClientRect();
    if (event.clientY - rect.top > SHEET_GRAB_ZONE) return;
    if (event.target.closest?.("button, a, input, select, textarea, [role='button']")) return;
    drag = { sheet, startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, id: event.pointerId, height: rect.height };
    sheet.style.transition = "none";
    sheet.setPointerCapture?.(event.pointerId);
  }, true);
  on(doc, "pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = Math.max(0, event.clientY - drag.startY);
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    drag.velocity = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    drag.sheet.style.translate = `0 ${dy}px`;
    event.preventDefault();
  }, { passive: false });
  const finishDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { sheet, startY, velocity, height } = drag;
    drag = null;
    const dy = Math.max(0, event.clientY - startY);
    sheet.style.transition = "translate .18s ease";
    if (event.type === "pointerup" && shouldDismissSheet({ dy, velocity, height })) {
      const close = sheet.querySelector(SHEET_CLOSE_SELECTOR);
      if (close) close.click();
    }
    sheet.style.translate = "";
    win.setTimeout(() => { sheet.style.transition = ""; }, 220);
  };
  on(doc, "pointerup", finishDrag, true);
  on(doc, "pointercancel", finishDrag, true);

  applyViewport();
  return () => {
    if (frame) win.cancelAnimationFrame?.(frame);
    if (clampFrame) win.cancelAnimationFrame?.(clampFrame);
    win.clearTimeout(drawingTimer);
    cleanups.splice(0).forEach((fn) => fn());
  };
}
