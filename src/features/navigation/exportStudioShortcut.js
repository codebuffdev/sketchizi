/**
 * Routes the global export shortcut to Sketchizi's Export Studio before
 * Excalidraw's own window/document keyboard handlers can process it.
 */
export function registerExportStudioShortcut({ target = window, openExportStudio }) {
  const onKeyDown = (event) => {
    const isExportStudioShortcut =
      (event.ctrlKey || event.metaKey) && event.shiftKey && String(event.key || "").toLowerCase() === "e";
    if (!isExportStudioShortcut) return;

    const typingTarget = event.target?.closest?.('input, textarea, [contenteditable="true"]');
    if (typingTarget) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openExportStudio?.();
  };

  target.addEventListener("keydown", onKeyDown, true);
  return () => target.removeEventListener("keydown", onKeyDown, true);
}
