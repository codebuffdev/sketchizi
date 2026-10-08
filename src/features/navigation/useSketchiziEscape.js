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
  iconLibraryPinned,
  commandPaletteOpen,
  closeCommandPalette,
  closePanel,
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

      // Excalidraw owns the image export dialog state. Keep Escape in the
      // centralized Sketchizi dismissal path so it closes before lower-priority
      // panels or Excalidraw canvas handling can consume the event.
      if (apiRef.current?.getAppState?.().openDialog?.name === "imageExport") {
        event.preventDefault();
        event.stopPropagation();
        closeExportDialog();
        return;
      }

      // The command palette is the topmost Sketchizi overlay. Close only it
      // so an underlying panel remains open for a later Escape press.
      if (commandPaletteOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeCommandPalette();
        return;
      }

      // Collaboration is a modal dialog/backdrop, so it has dismissal
      // priority over an underlying Sketchizi panel.
      if (collaborationOpen) {
        event.preventDefault();
        event.stopPropagation();
        setCollaborationOpen(false);
        return;
      }

      // The pinned Icon Library intentionally consumes Escape without closing.
      if (activePanel === "icon-library" && iconLibraryPinned) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // All application panels share the single activePanel state.
      if (activePanel) {
        event.preventDefault();
        event.stopPropagation();
        if (activePanel === "icon-library") searchRef.current?.blur();
        closePanel(activePanel);
        return;
      }

      // Preserve the existing Sketchizi connection-mode dismissal. With no
      // Sketchizi panel/mode active, do nothing so Excalidraw owns Escape.
      if (connectionMode) {
        event.preventDefault();
        event.stopPropagation();
        activateSelectionTool();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activePanel, iconLibraryPinned, closePanel, collaborationOpen, setCollaborationOpen, commandPaletteOpen, closeCommandPalette, connectionMode, activateSelectionTool, searchRef, apiRef, closeExportDialog]);
}
