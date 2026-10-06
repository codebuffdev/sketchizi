import { useCallback, useEffect, useState } from "react";

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
      const isShortcut = !event.altKey
        && event.shiftKey
        && (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === "p";
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
