import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./SmartInkModePicker.css";

const DRAW_TOOL_LABEL = /^(draw|freedraw|freehand)(?:\s|$)/i;

export function isNativeDrawButton(button) {
  if (!button || button.closest(".sketchizi-smart-ink-menu")) return false;
  const name = [button.getAttribute("aria-label"), button.getAttribute("data-testid"), button.getAttribute("title")]
    .filter(Boolean).join(" ").trim();
  return DRAW_TOOL_LABEL.test(name);
}

/**
 * Phase 1: both modes preserve native Excalidraw freehand strokes.
 * Write is a distinct, persistent interaction mode; recognition and
 * conversion to editable handwriting are delivered in later phases.
 */
export default function SmartInkModePicker({ canvasRootRef, apiRef, canEdit, viewModeEnabled }) {
  const [menu, setMenu] = useState(null);
  const [mode, setMode] = useState("draw");
  const chooseMode = useCallback((nextMode) => {
    setMode(nextMode);
    setMenu(null);
    apiRef?.current?.setActiveTool?.({ type: "freedraw" });
  }, [apiRef]);

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !canEdit || viewModeEnabled) {
      setMenu(null);
      return undefined;
    }
    const onDrawClick = (event) => {
      const button = event.target instanceof Element ? event.target.closest("button, [role='button']") : null;
      if (!isNativeDrawButton(button) || !button.closest(".App-toolbar")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const rect = button.getBoundingClientRect();
      setMenu((current) => current ? null : {
        left: Math.min(window.innerWidth - 222, Math.max(8, rect.left)),
        top: rect.top > window.innerHeight / 2 ? rect.top - 110 : rect.bottom + 8,
      });
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenu(null);
    };
    const onOutsideClick = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".sketchizi-smart-ink-menu")) return;
      if (event.target.closest(".App-toolbar") && isNativeDrawButton(event.target.closest("button, [role='button']"))) return;
      setMenu(null);
    };
    root.addEventListener("click", onDrawClick, true);
    document.addEventListener("pointerdown", onOutsideClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("click", onDrawClick, true);
      document.removeEventListener("pointerdown", onOutsideClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canvasRootRef, canEdit, viewModeEnabled]);

  if (!canEdit || viewModeEnabled) return null;
  return (
    <>
      {mode === "write" && <div className="sketchizi-smart-ink-indicator" role="status">Write mode · Ink strokes</div>}
      {menu && createPortal(
        <div className="sketchizi-smart-ink-menu" role="menu" aria-label="Draw mode" style={{ left: menu.left, top: menu.top }}>
          <button type="button" role="menuitemradio" aria-checked={mode === "draw"} onClick={() => chooseMode("draw")}>
            <span aria-hidden="true">✎</span><span><strong>Draw over canvas</strong><small>Freehand shapes and sketches</small></span>
            {mode === "draw" && <span aria-hidden="true">✓</span>}
          </button>
          <button type="button" role="menuitemradio" aria-checked={mode === "write"} onClick={() => chooseMode("write")}>
            <span aria-hidden="true">✍</span><span><strong>Write</strong><small>Handwriting strokes · Smart conversion coming next</small></span>
            {mode === "write" && <span aria-hidden="true">✓</span>}
          </button>
        </div>, document.body
      )}
    </>
  );
}
