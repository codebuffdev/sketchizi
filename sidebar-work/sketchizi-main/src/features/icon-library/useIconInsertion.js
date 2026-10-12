import { useEffect, useRef, useState } from "react";
import { createIconInserter, createStarterMindMap } from "./iconInsertionService";
import { logger } from "../../logging/logger";

export function useIconInsertion({ apiRef, gridEnabled, gridSize, markRecentlyUsed, canEdit = true }) {
  const iconPointerDragRef = useRef(null);
  const iconMouseDragCleanupRef = useRef(null);
  const suppressIconClickRef = useRef(false);
  const [draggingIcon, setDraggingIcon] = useState(null);
  const addIconToCanvas = createIconInserter({ apiRef, gridEnabled, gridSize, markRecentlyUsed });
  const createMindMap = () => createStarterMindMap(apiRef);

const handleDragStart = (event, icon) => {
    if (!canEdit) return;
    event.dataTransfer.setData(
      "application/x-diagram-icon",
      JSON.stringify(icon)
    );
    event.dataTransfer.effectAllowed = "copy";
  };

  // Use a pointer-based drag path as the primary interaction. Native HTML5
  // drag/drop is unreliable for controls rendered inside the scrollable
  // library panel and can be intercepted by Excalidraw's canvas.
  // Desktop mouse fallback: use classic mouse events so the library drag
  // remains reliable even when pointer capture / browser pointer events are
  // interfered with by the embedded Excalidraw editor.
  const handleIconMouseDown = (event, icon) => {
    if (!canEdit) return;
    if (event.button !== 0 || event.target.closest?.(".favorite-button")) return;

    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    const handleCancel = () => {
      cleanup();
      setDraggingIcon(null);
      suppressIconClickRef.current = false;
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", handleMove, true);
      document.removeEventListener("mouseup", handleUp, true);
      window.removeEventListener("blur", handleCancel);
      if (iconMouseDragCleanupRef.current === cleanup) {
        iconMouseDragCleanupRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const handleMove = (moveEvent) => {
      if (moved && moveEvent.buttons === 0) {
        handleCancel();
        return;
      }
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!moved && distance < 5) return;

      moved = true;
      suppressIconClickRef.current = true;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      setDraggingIcon({
        icon,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      });
    };

    const handleUp = (upEvent) => {
      cleanup();
      setDraggingIcon(null);

      if (moved) {
        upEvent.preventDefault();
        upEvent.stopPropagation();
        const canvas = document.querySelector(".excalidraw");
        const rect = canvas?.getBoundingClientRect();
        const insideCanvas = rect &&
          upEvent.clientX >= rect.left &&
          upEvent.clientX <= rect.right &&
          upEvent.clientY >= rect.top &&
          upEvent.clientY <= rect.bottom;

        if (insideCanvas) {
          addIconToCanvas(icon, upEvent.clientX, upEvent.clientY, { exact: true });
        }

        window.setTimeout(() => {
          suppressIconClickRef.current = false;
        }, 0);
      }
    };

    iconMouseDragCleanupRef.current?.();
    iconMouseDragCleanupRef.current = cleanup;
    document.addEventListener("mousemove", handleMove, true);
    document.addEventListener("mouseup", handleUp, true);
    window.addEventListener("blur", handleCancel);
  };

  const handleIconPointerDown = (event, icon) => {
    if (!canEdit) return;
    // Mouse is handled by the classic mouse fallback below. Do not run both
    // gesture implementations for the same physical drag.
    if (event.pointerType === "mouse") return;
    if (event.button !== 0 || event.target.closest?.(".favorite-button")) return;

    const isTouch = event.pointerType === "touch";
    const source = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const drag = {
      icon,
      startX,
      startY,
      pointerId,
      source,
      moved: false,
      armed: !isTouch,
      longPressTimer: null,
    };
    iconPointerDragRef.current = drag;

    const removeListeners = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
    };

    const finish = (finishEvent, cancelled = false) => {
      const current = iconPointerDragRef.current;
      if (!current || finishEvent.pointerId !== current.pointerId) return;

      iconPointerDragRef.current = null;
      removeListeners();
      if (current.longPressTimer) window.clearTimeout(current.longPressTimer);

      if (current.armed) {
        try {
          current.source.releasePointerCapture?.(current.pointerId);
        } catch (_) {}
      }

      if (!cancelled && current.moved) {
        finishEvent.preventDefault();
        finishEvent.stopPropagation();
        const canvas = document.querySelector(".excalidraw");
        const rect = canvas?.getBoundingClientRect();
        const insideCanvas = rect &&
          finishEvent.clientX >= rect.left &&
          finishEvent.clientX <= rect.right &&
          finishEvent.clientY >= rect.top &&
          finishEvent.clientY <= rect.bottom;
        if (insideCanvas) {
          addIconToCanvas(current.icon, finishEvent.clientX, finishEvent.clientY, { exact: true });
        }
      }

      setDraggingIcon(null);
      window.setTimeout(() => {
        suppressIconClickRef.current = false;
      }, 0);
    };

    const cancel = (cancelEvent) => finish(cancelEvent, true);
    const up = (upEvent) => finish(upEvent, false);

    const move = (moveEvent) => {
      const current = iconPointerDragRef.current;
      if (!current || moveEvent.pointerId !== current.pointerId) return;

      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;

      // On touch, a normal vertical swipe should scroll the icon grid. A
      // deliberate long-press arms dragging so touch scrolling and icon drag
      // no longer compete for the same gesture.
      if (isTouch && !current.armed) {
        if (Math.hypot(dx, dy) >= 8) {
          if (current.longPressTimer) window.clearTimeout(current.longPressTimer);
          iconPointerDragRef.current = null;
          removeListeners();
        }
        return;
      }

      if (!current.armed || (!current.moved && Math.hypot(dx, dy) < 5)) return;

      current.moved = true;
      suppressIconClickRef.current = true;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      setDraggingIcon({
        icon: current.icon,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      });
    };

    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", up, { capture: true });
    window.addEventListener("pointercancel", cancel, { capture: true });

    if (isTouch) {
      // Let the browser own the initial touch gesture. If the finger stays
      // still long enough, switch to an intentional drag interaction.
      drag.longPressTimer = window.setTimeout(() => {
        const current = iconPointerDragRef.current;
        if (!current || current.pointerId !== pointerId) return;
        current.armed = true;
        try {
          source.setPointerCapture?.(pointerId);
        } catch (_) {}
        event.preventDefault();
        event.stopPropagation();
      }, 350);
    } else {
      // Mouse/pen keeps the immediate drag behavior used by desktop users.
      event.preventDefault();
      event.stopPropagation();
      try {
        source.setPointerCapture?.(pointerId);
      } catch (_) {}
    }
  };

  const handleIconClick = (icon) => {
    if (!canEdit || suppressIconClickRef.current) return;
    // Keep click-to-place behavior for users who prefer a single click.
    const canvas = document.querySelector(".excalidraw");
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    handleIconInsertAtCenter(icon);
  };

  const handleIconInsertAtCenter = (icon) => {
    if (!canEdit) return;
    const canvas = document.querySelector(".excalidraw");
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    addIconToCanvas(icon, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleDragOver = (event) => {
    if (!canEdit) return;
    if (event.dataTransfer?.types?.includes("application/x-diagram-icon")) {
      // Excalidraw has its own drag/drop handlers. Use the capture phase on
      // the app canvas so an icon dragged from the library cannot be swallowed
      // by Excalidraw before it reaches our drop handler.
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (event) => {
    if (!canEdit) return;
    const raw = event.dataTransfer?.getData("application/x-diagram-icon");
    if (!raw) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      addIconToCanvas(JSON.parse(raw), event.clientX, event.clientY);
    } catch (error) {
      logger.error("Could not add icon", error, { category: "canvas", operation: "icon-drop" });
    }
  };
  useEffect(() => () => iconMouseDragCleanupRef.current?.(), []);

  return { draggingIcon, addIconToCanvas, createStarterMindMap: createMindMap, handleDragStart, handleIconMouseDown, handleIconPointerDown, handleIconClick, handleIconInsertAtCenter, handleDragOver, handleDrop };
}
