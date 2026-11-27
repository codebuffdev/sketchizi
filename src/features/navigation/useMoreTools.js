import { useCallback, useEffect, useState } from "react";
import { INSERT_IMAGE_EVENT } from "../canvas/imageImport/imageImportModel.js";

export function useMoreTools({ apiRef, moreToolsOpen, togglePanel, closePanel, canEdit = true }) {
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const findAnchor = useCallback(() => {
    const dock = document.querySelector(".sketchizi-radial-wheel");
    return dock instanceof HTMLElement ? dock : null;
  }, []);
  const position = useCallback(() => {
    const trigger = findAnchor();
    if (!(trigger instanceof HTMLElement)) return;
    const rect = trigger.getBoundingClientRect();
    const width = 44;
    setAnchor({
      left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 48)),
    });
  }, [findAnchor]);
  const activate = useCallback((tool) => {
    if (!canEdit) return;
    const api = apiRef.current; if (!api) return;
    closePanel("more-tools");
    if (tool === "image") {
      // Role-aware image import owns the picker (size limits + shrink prompt).
      if (!window.dispatchEvent(new CustomEvent(INSERT_IMAGE_EVENT, { cancelable: true }))) return;
      const imageButton = document.querySelector('[data-testid="toolbar-image"]');
      if (imageButton instanceof HTMLElement) { imageButton.click(); return; }
      api.setActiveTool({ type: "image" }); return;
    }
    if (tool === "text-to-diagram") { api.updateScene({ appState: { ...api.getAppState(), openDialog: { name: "ttd", tab: "text-to-diagram" } } }); return; }
    if (tool === "mermaid") { api.updateScene({ appState: { ...api.getAppState(), openDialog: { name: "ttd", tab: "mermaid" } } }); return; }
    if (tool === "zen-mode") {
      // Enter Zen Mode from the Tools menu without changing the active drawing tool.
      api.updateScene({ appState: { zenModeEnabled: true } });
      window.dispatchEvent(new CustomEvent("sketchizi:toggle-zen"));
      return;
    }
    api.setActiveTool({ type: tool });
  }, [apiRef, canEdit, closePanel]);
  useEffect(() => {
    if (!canEdit) {
      closePanel("more-tools");
      return undefined;
    }
    const update = () => position();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();
    const frame = requestAnimationFrame(update);
    const timer = setTimeout(update, 250);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [canEdit, closePanel, position]);
  return { anchor, position, activate };
}
