import { useCallback, useEffect, useRef, useState } from "react";
import {
  SWITCHER_IDLE_MS,
  buildSwitchOrder,
  classifyTabSwitchKey,
  getActiveWorkspaceTabId,
  getAdjacentTabId,
} from "../features/workspace/tabPinning.js";

// Ctrl+[ / Ctrl+] indent in code and text editors, so the fallback chords stay
// out of them. Ctrl+Tab has no editing meaning and is always claimed.
const EDITOR_SELECTOR = "input, textarea, select, [contenteditable='true'], .monaco-editor, .cm-editor";

/**
 * Ctrl+Tab / Ctrl+Shift+Tab (and Ctrl+] / Ctrl+[ for browsers that reserve
 * Ctrl+Tab) cycle the workspace tabs, pinned tabs first, with wrap-around.
 *
 * Each press switches immediately through selectWorkspaceTab, which already
 * captures the outgoing tab's elements / pan / zoom into its snapshot and
 * restores the incoming tab's, so every tab keeps its own canvas state.
 *
 * While Ctrl is held the returned `switcher` drives the "Switch Tab" popover.
 * It closes on Control keyup, on window blur, or after SWITCHER_IDLE_MS
 * without another press.
 */
export function useTabSwitcher({ canvasTabsRef, activeCanvasIdRef, canvasTabsRestoredRef, selectWorkspaceTab, blocked = false }) {
  const [switcher, setSwitcher] = useState({ open: false, activeId: null });
  const idleTimerRef = useRef(null);
  const selectRef = useRef(selectWorkspaceTab);
  const blockedRef = useRef(blocked);
  selectRef.current = selectWorkspaceTab;
  blockedRef.current = blocked;

  const closeSwitcher = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    setSwitcher((current) => (current.open ? { open: false, activeId: current.activeId } : current));
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const chord = classifyTabSwitchKey(event);
      if (!chord) return;
      const target = event.target;
      if (chord.fallback && target instanceof Element && target.closest(EDITOR_SELECTOR)) return;

      // Claim the chord even when there is nothing to switch to, so the
      // browser does not move its own tab underneath the app.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || blockedRef.current || !canvasTabsRestoredRef.current) return;

      const tabs = canvasTabsRef.current;
      const order = buildSwitchOrder(tabs);
      if (order.length < 2) return;
      const activeId = getActiveWorkspaceTabId(tabs, activeCanvasIdRef.current);
      const nextId = getAdjacentTabId(order, activeId, chord.direction);
      if (!nextId || nextId === activeId) return;

      // Commit an in-progress canvas text edit before the scene is swapped.
      if (target instanceof HTMLElement && target.closest(".excalidraw") && target.matches("textarea, [contenteditable='true']")) target.blur();

      selectRef.current?.(nextId);
      setSwitcher({ open: true, activeId: nextId });
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(closeSwitcher, SWITCHER_IDLE_MS);
    };
    const onKeyUp = (event) => { if (event.key === "Control") closeSwitcher(); };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", closeSwitcher);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", closeSwitcher);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [activeCanvasIdRef, canvasTabsRef, canvasTabsRestoredRef, closeSwitcher]);

  return { switcher, closeSwitcher };
}
