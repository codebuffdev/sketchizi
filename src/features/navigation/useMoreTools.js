import { useCallback, useEffect, useState } from "react";

export function useMoreTools({ apiRef, moreToolsOpen, togglePanel, closePanel, canEdit = true }) {
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const findAnchor = useCallback(() => {
    const selectors = [
      ".excalidraw .App-toolbar__extra-tools-trigger",
      ".excalidraw [data-testid=\"toolbar-more-tools\"]",
      ".excalidraw [aria-label*=\"More tools\" i]",
      ".excalidraw [title*=\"More tools\" i]",
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) return node;
    }
    const toolbar = document.querySelector(".excalidraw .App-toolbar");
    if (toolbar instanceof HTMLElement) return Array.from(toolbar.querySelectorAll("button")).at(-1) || null;
    return null;
  }, []);
  const position = useCallback(() => {
    const trigger = findAnchor(); if (!(trigger instanceof HTMLElement)) return;
    const rect = trigger.getBoundingClientRect(); const width = 44;
    setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 8 });
    const toolbar = document.querySelector(".excalidraw .App-toolbar");
    const lastButton = toolbar instanceof HTMLElement ? Array.from(toolbar.querySelectorAll("button")).at(-1) : null;
    if (lastButton instanceof HTMLElement && !lastButton.dataset.sketchiziMoreToolsHidden) {
      lastButton.dataset.sketchiziMoreToolsHidden = "true";
      lastButton.dataset.sketchiziOriginalVisibility = lastButton.style.visibility || "";
      lastButton.style.visibility = "hidden"; lastButton.style.pointerEvents = "none";
    }
  }, [findAnchor]);
  const activate = useCallback((tool) => {
    if (!canEdit) return;
    const api = apiRef.current; if (!api) return;
    closePanel("more-tools");
    if (tool === "image") {
      const imageButton = document.querySelector('[data-testid="toolbar-image"]');
      if (imageButton instanceof HTMLElement) { imageButton.click(); return; }
      api.setActiveTool({ type: "image" }); return;
    }
    if (tool === "text-to-diagram") { api.updateScene({ appState: { ...api.getAppState(), openDialog: { name: "ttd", tab: "text-to-diagram" } } }); return; }
    if (tool === "mermaid") { api.updateScene({ appState: { ...api.getAppState(), openDialog: { name: "ttd", tab: "mermaid" } } }); return; }
    api.setActiveTool({ type: tool });
  }, [apiRef, canEdit, closePanel]);
  useEffect(() => {
    const restore = () => document.querySelectorAll(".excalidraw .App-toolbar button[data-sketchizi-more-tools-hidden=\"true\"]").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.visibility = node.dataset.sketchiziOriginalVisibility || ""; node.style.pointerEvents = "";
      delete node.dataset.sketchiziMoreToolsHidden; delete node.dataset.sketchiziOriginalVisibility;
    });
    if (!canEdit) {
      restore();
      closePanel("more-tools");
      return undefined;
    }
    const update = () => position();
    const observer = new MutationObserver(update); observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    update(); const frame = requestAnimationFrame(update); const timer = setTimeout(update, 250);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); restore(); };
  }, [canEdit, closePanel, position]);
  return { anchor, position, activate };
}
