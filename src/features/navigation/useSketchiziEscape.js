import { useEffect } from "react";

/**
 * Central dismissal point for Sketchizi-owned panels/dialogs.
 *
 * This listener runs in the capture phase so an open Sketchizi modal/panel
 * can consume Escape before Excalidraw's own keyboard handling. When nothing
 * Sketchizi-owned is open, the event is left completely untouched.
 */
export function useSketchiziEscape({
  activePanel,
  commandPaletteOpen,
  closeCommandPalette,
  closePanel,
  aiAskOpen,
  setAiAskOpen,
  minimapOpen,
  setMinimapOpen,
  nativeMenuOpen,
  closeNativeMenu,
  designStudioOpen,
  setDesignStudioOpen,
  exportStudioOpen,
  setExportStudioOpen,
  templatesModalOpen,
  setTemplatesModalOpen,
  collaborationOpen,
  setCollaborationOpen,
  connectionMode,
  activateSelectionTool,
  searchRef,
  apiRef,
  closeExportDialog,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      const consumeEscape = (close) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        close();
      };

      // Excalidraw owns the image export dialog state. Keep Escape in the
      // centralized Sketchizi dismissal path so it closes before lower-priority
      // panels or Excalidraw canvas handling can consume the event.
      if (apiRef.current?.getAppState?.().openDialog?.name === "imageExport") {
        consumeEscape(closeExportDialog);
        return;
      }

      // The command palette is the topmost Sketchizi overlay. Close only it
      // so an underlying panel remains open for a later Escape press.
      if (commandPaletteOpen) {
        consumeEscape(closeCommandPalette);
        return;
      }

      // Collaboration is a modal dialog/backdrop, so it has dismissal
      // priority over an underlying Sketchizi panel.
      if (collaborationOpen) {
        consumeEscape(() => setCollaborationOpen(false));
        return;
      }

      // Close app-level overlays before panels underneath them.
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
      if (aiAskOpen) {
        consumeEscape(() => setAiAskOpen(false));
        return;
      }
      if (minimapOpen) {
        consumeEscape(() => setMinimapOpen(false));
        return;
      }
      if (nativeMenuOpen) {
        consumeEscape(closeNativeMenu);
        return;
      }

      // All application panels share the single activePanel state. A pinned
      // panel can still be dismissed explicitly with Escape.
      if (activePanel) {
        consumeEscape(() => {
          if (activePanel === "icon-library") searchRef.current?.blur();
          closePanel(activePanel);
        });
        return;
      }

      // Preserve the existing Sketchizi connection-mode dismissal. With no
      // Sketchizi panel/mode active, do nothing so Excalidraw owns Escape.
      if (connectionMode) {
        consumeEscape(activateSelectionTool);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activePanel, closePanel, commandPaletteOpen, closeCommandPalette, aiAskOpen, setAiAskOpen, minimapOpen, setMinimapOpen, nativeMenuOpen, closeNativeMenu, designStudioOpen, setDesignStudioOpen, exportStudioOpen, setExportStudioOpen, templatesModalOpen, setTemplatesModalOpen, collaborationOpen, setCollaborationOpen, connectionMode, activateSelectionTool, searchRef, apiRef, closeExportDialog]);
}
