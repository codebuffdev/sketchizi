import { useEffect } from "react";

/**
 * Central dismissal point for Sketchizi-owned panels/dialogs.
 *
 * This listener runs in the capture phase so an open Sketchizi modal/panel
 * can consume Escape before Excalidraw's own keyboard handling. When nothing
 * Sketchizi-owned is open, the event is left completely untouched.
 */
const FLOATING_POPOVER_SELECTOR = ".sk-tool-choice-menu, .sk-tool-layer-menu, .sk-tool-opacity-popover, .sk-tool-font-size-presets, .canvas-start-date-popover";
const BARE_CANVAS_SELECTOR = "canvas.excalidraw__canvas, canvas.interactive";

export function useSketchiziEscape({
  activeTransientPanel,
  commandPaletteOpen,
  closeCommandPalette,
  closePanel,
  closeMostRecentDrawer,
  dismissUnpinnedDrawersFromCanvas,
  isZenMode,
  exitZenMode,
  minimapOpen,
  setMinimapOpen,
  designStudioOpen,
  setDesignStudioOpen,
  templatesModalOpen,
  setTemplatesModalOpen,
  exportStudioOpen,
  setExportStudioOpen,
  collaborationOpen,
  setCollaborationOpen,
  connectionMode,
  activateSelectionTool,
  searchRef,
  apiRef,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof HTMLElement && event.target.hasAttribute("data-sketchizi-inline-editor")) return;

      const consumeEscape = (close) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        close();
      };

      // Layer 1: transient floating popovers/dropdowns. The command palette is
      // closed here; the tool popovers (calendar, opacity, font size presets,
      // tool menus) own their own Escape handling, so leave the event alone and
      // keep every drawer open for a later press.
      if (commandPaletteOpen) {
        consumeEscape(closeCommandPalette);
        return;
      }
      if (document.querySelector(FLOATING_POPOVER_SELECTOR)) return;

      // Modal dialogs/backdrops sit above drawers.
      if (collaborationOpen) {
        consumeEscape(() => setCollaborationOpen(false));
        return;
      }
      if (templatesModalOpen) {
        consumeEscape(() => setTemplatesModalOpen(false));
        return;
      }
      if (exportStudioOpen) {
        consumeEscape(() => setExportStudioOpen(false));
        return;
      }
      if (designStudioOpen) {
        consumeEscape(() => setDesignStudioOpen(false));
        return;
      }
      if (minimapOpen) {
        consumeEscape(() => setMinimapOpen(false));
        return;
      }
      if (activeTransientPanel) {
        consumeEscape(() => closePanel(activeTransientPanel));
        return;
      }

      // Layer 2: the most recently opened unpinned drawer, one per press, so
      // a left and a right drawer are never dismissed together.
      const closedDrawer = closeMostRecentDrawer?.();
      if (closedDrawer) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (closedDrawer === "iconLibrary") searchRef.current?.blur();
        return;
      }

      // Layer 3: with no drawer left to close, Escape leaves Zen Mode.
      if (isZenMode) {
        const target = event.target;
        if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
        consumeEscape(exitZenMode);
        return;
      }

      // Preserve the existing Sketchizi connection-mode dismissal. With no
      // Sketchizi panel/mode active, do nothing so Excalidraw owns Escape.
      if (connectionMode) {
        // A multi-point arrow / line that is still being placed is committed by
        // Excalidraw on Escape; switching tools first would discard the bends.
        const drawingState = apiRef.current?.getAppState?.();
        if (drawingState?.multiElement || drawingState?.newElement) return;
        consumeEscape(activateSelectionTool);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activeTransientPanel, closePanel, closeMostRecentDrawer, isZenMode, exitZenMode, commandPaletteOpen, closeCommandPalette, minimapOpen, setMinimapOpen, designStudioOpen, setDesignStudioOpen, templatesModalOpen, setTemplatesModalOpen, exportStudioOpen, setExportStudioOpen, collaborationOpen, setCollaborationOpen, connectionMode, activateSelectionTool, searchRef, apiRef]);
}

/**
 * Scoped canvas pointer-down dismissal. Only a press on the bare canvas surface
 * dismisses drawers, and only unpinned ones (see dismissUnpinnedDrawersFromCanvas).
 * Presses inside any drawer are not canvas presses, so a click in a left drawer
 * can never dismiss a right drawer, and vice versa.
 */
export function useSketchiziCanvasDismissal({ dismissUnpinnedDrawersFromCanvas }) {
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(BARE_CANVAS_SELECTOR)) return;
      dismissUnpinnedDrawersFromCanvas?.();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [dismissUnpinnedDrawersFromCanvas]);
}
