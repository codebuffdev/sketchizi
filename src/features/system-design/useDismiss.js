import { useEffect } from "react";

/**
 * Close a popover on outside pointer-down or Escape. `ref` should wrap BOTH the trigger and the popover so a click on the
 * trigger is handled by the trigger itself (toggle) rather than closing-then-reopening. Capture phase on purpose:
 * Excalidraw stops propagation of canvas pointer events, so a bubbling listener would never see clicks on the canvas.
 */
export function useDismiss(ref, open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation(); // Don't let the same Escape also clear the canvas selection / close other panels.
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref, open, onClose]);
}
