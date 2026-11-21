import { useCallback, useEffect, useState } from "react";
import { isCommandPaletteShortcut } from "../commands/platformShortcut.js";

export function useCommandPalette({ closeNativeMenu }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const openCommandPalette = useCallback(() => {
    closeNativeMenu?.();
    setCommandPaletteOpen(true);
  }, [closeNativeMenu]);

  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const toggleCommandPalette = useCallback(() => {
    if (commandPaletteOpen) closeCommandPalette();
    else openCommandPalette();
  }, [commandPaletteOpen, closeCommandPalette, openCommandPalette]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isLegacyShortcut = !event.altKey
        && event.shiftKey
        && (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === "p";
      let isShortcut = isLegacyShortcut;
      if (!isShortcut && isCommandPaletteShortcut(event)) {
        // Code editors (Monaco / CodeMirror in the studios) use Ctrl+K as a
        // chord prefix; leave it to them. Everywhere else Ctrl/Cmd+K opens
        // the palette, including over Excalidraw's own Ctrl+K link shortcut.
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".monaco-editor, .cm-editor")) return;
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        isShortcut = true;
      }
      if (!isShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggleCommandPalette();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [toggleCommandPalette]);

  return { commandPaletteOpen, openCommandPalette, closeCommandPalette, toggleCommandPalette };
}
