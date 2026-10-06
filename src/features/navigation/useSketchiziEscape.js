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
  collaborationOpen,
  setCollaborationOpen,
  connectionMode,
  activateSelectionTool,
  searchRef,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

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
  }, [activePanel, closePanel, collaborationOpen, setCollaborationOpen, commandPaletteOpen, closeCommandPalette, connectionMode, activateSelectionTool, searchRef]);
}
