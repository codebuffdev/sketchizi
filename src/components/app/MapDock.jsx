import React, { useCallback, useEffect, useRef, useState } from "react";
import CanvasMapRadar from "./CanvasMapRadar.jsx";
import { fitToContent } from "../../features/canvas/mapRadar.js";

// How long the pointer may be outside both the button and the popover before
// a hover-opened popover closes. Long enough to cross the gap without flicker.
export const MAP_LEAVE_GRACE_MS = 200;

function isTypingTarget(target) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || Boolean(target?.isContentEditable);
}

/**
 * Bottom-right "Map" pill and its floating radar.
 *
 *  - Hover opens the radar; leaving both the pill and the radar closes it
 *    after MAP_LEAVE_GRACE_MS unless it is pinned.
 *  - Click (or the M key, wired by the app to `pinned`) pins it open.
 *  - Esc, or the "Esc ×" badge, closes it from either state and unpins it.
 */
export default function MapDock({
  apiRef,
  pinned,
  onTogglePinned,
  onClose,
  isDarkTheme = true,
  onViewportChange,
}) {
  const [hovering, setHovering] = useState(false);
  const wrapRef = useRef(null);
  const leaveTimerRef = useRef(0);
  const draggingRef = useRef(false);
  const open = pinned || hovering;

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = 0;
  }, []);

  const scheduleLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = 0;
      // A drag keeps the radar open even if the pointer strays outside it.
      if (!draggingRef.current) setHovering(false);
    }, MAP_LEAVE_GRACE_MS);
  }, [clearLeaveTimer]);

  useEffect(() => clearLeaveTimer, [clearLeaveTimer]);

  // Touch has no hover; a tap on the pill pins instead.
  const handlePointerEnter = (event) => {
    if (event.pointerType === "touch") return;
    clearLeaveTimer();
    setHovering(true);
  };
  const handlePointerLeave = (event) => {
    if (event.pointerType === "touch") return;
    scheduleLeave();
  };

  const handleDragChange = useCallback((active) => {
    draggingRef.current = active;
    if (!active && !wrapRef.current?.matches(":hover")) scheduleLeave();
  }, [scheduleLeave]);

  const close = useCallback(() => {
    clearLeaveTimer();
    draggingRef.current = false;
    setHovering(false);
    onClose?.();
  }, [clearLeaveTimer, onClose]);

  const fit = useCallback(() => {
    if (fitToContent(apiRef.current)) onViewportChange?.();
  }, [apiRef, onViewportChange]);

  useEffect(() => {
    if (!open) return undefined;
    // Window + capture runs before the document-level layered Escape handler
    // and Excalidraw's own key handling.
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        // Pinned but not hovered: the app's layered Escape handler owns this
        // so open modals still close before the map does.
        if (!hovering) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === "1" && !event.shiftKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        fit();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, hovering, close, fit]);

  return (
    <div
      ref={wrapRef}
      className={`sk-map-wrap${open ? " is-open" : ""}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        type="button"
        className={`sk-map-pill${pinned ? " is-pinned" : ""}${open ? " is-open" : ""}`}
        onClick={onTogglePinned}
        aria-pressed={pinned}
        aria-expanded={open}
        aria-controls="sk-map-popover"
        aria-keyshortcuts="M"
        title={pinned ? "Unpin map (M)" : "Map (M) — hover to peek, click to pin"}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.7 5.5-2.2V4.5L15 6.7 9 4Z" />
          <path d="M9 4v13.3M15 6.7V20" />
        </svg>
        <span>Map</span>
        <i className="sk-map-pin-dot" aria-hidden="true" />
      </button>
      {open && (
        <div
          id="sk-map-popover"
          className="sk-map-popover"
          role="region"
          aria-label="Canvas map"
          data-pinned={pinned ? "true" : "false"}
        >
          <CanvasMapRadar
            apiRef={apiRef}
            isDarkTheme={isDarkTheme}
            onClose={close}
            onFit={fit}
            onDragChange={handleDragChange}
            onViewportChange={onViewportChange}
          />
        </div>
      )}
    </div>
  );
}
