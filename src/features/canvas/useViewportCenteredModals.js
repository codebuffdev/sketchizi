import { useEffect } from "react";

/**
 * Excalidraw renders its built-in dialogs ("Clear canvas", help, etc.) into a
 * `.excalidraw-modal-container` appended inside the canvas host. Our shell
 * offsets / clips that host (docks, side panels), so the dialog centres on the
 * canvas box instead of the browser viewport. Re-parenting the container to
 * <body> makes `position: fixed; inset: 0` resolve against the viewport.
 * Styling lives in styles/viewport-centered-modal.css.
 */
export function useViewportCenteredModals(rootRef) {
  useEffect(() => {
    const root = rootRef?.current;
    if (!root || typeof MutationObserver !== "function") return undefined;
    const lift = (node) => {
      if (!(node instanceof HTMLElement)) return;
      const containers = node.matches?.(".excalidraw-modal-container") ? [node] : [...(node.querySelectorAll?.(".excalidraw-modal-container") || [])];
      containers.forEach((container) => {
        if (container.parentElement !== document.body) document.body.appendChild(container);
      });
    };
    lift(root);
    const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(lift)));
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [rootRef]);
}
