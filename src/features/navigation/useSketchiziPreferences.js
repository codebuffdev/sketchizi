import { useCallback, useEffect, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { clearEmergencyBackup, clearSketch } from "../../persistence";

export function useSketchiziPreferences({ apiRef, closePanel, openPanel, togglePanel, activePanel, connectionMode, selectedCount, toggleGrid, activateSelectionTool, setMinimapOpen, searchRef, saveTimerRef, fileActionsRef, setStorageError, sketchReady, canEdit = true }) {
  const [themeMode, setThemeMode] = useState(() => {
    try { const saved = localStorage.getItem("diagram-app-theme"); return saved === "dark" || saved === "light" || saved === "system" ? saved : "light"; }
    catch { return "light"; }
  });
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const [propertiesAutoOpen, setPropertiesAutoOpen] = useState(() => {
    try { const saved = localStorage.getItem("sketchizi-properties-auto-open"); return saved === null ? false : saved === "true"; }
    catch { return false; }
  });
  const isDarkTheme = themeMode === "dark" || (themeMode === "system" && systemDark);

  useEffect(() => { try { localStorage.setItem("diagram-app-theme", themeMode); } catch {} }, [themeMode]);
  useEffect(() => {
    try { localStorage.setItem("sketchizi-properties-auto-open", String(propertiesAutoOpen)); } catch {}
    if (!propertiesAutoOpen) closePanel("properties");
  }, [closePanel, propertiesAutoOpen]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)"); if (!media) return undefined;
    const handleChange = (event) => setSystemDark(event.matches);
    media.addEventListener?.("change", handleChange); return () => media.removeEventListener?.("change", handleChange);
  }, []);
  useEffect(() => {
    const root = document.documentElement; root.dataset.sketchiziTheme = isDarkTheme ? "dark" : "light";
    return () => { delete root.dataset.sketchiziTheme; };
  }, [isDarkTheme]);
  useEffect(() => {
    const api = apiRef.current; if (!api) return;
    const current = api.getAppState().viewBackgroundColor;
    if (!["#ffffff", "#fff", "#121212", "#1b1b1b", "#e5e5e5"].includes(String(current).toLowerCase())) return;
    api.updateScene({ appState: { viewBackgroundColor: isDarkTheme ? "#121212" : "#ffffff" }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef, isDarkTheme, sketchReady]);

  const fitDiagram = useCallback(() => {
    const api = apiRef.current; if (!api) return;
    const elements = api.getSceneElements().filter((element) => !element.isDeleted); if (!elements.length) return;
    if (api.setViewport) api.setViewport({ target: elements, fit: "contain" });
    else api.scrollToContent?.(elements, { fitToViewport: true, animate: true });
  }, [apiRef]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      const plainKey = !event.ctrlKey && !event.metaKey && !event.altKey;
      const key = event.key.toLowerCase();
      if (isTyping) return;
      if (event.key === "?" || (event.shiftKey && event.key === "/")) { event.preventDefault(); openPanel("shortcuts"); return; }
      if (event.key === "/") {
        if (!canEdit) return;
        event.preventDefault();
        openPanel("icon-library");
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      if (!plainKey) return;
      if (key === "l") { event.preventDefault(); togglePanel("layout"); return; }
      if (key === "d") { event.preventDefault(); setThemeMode((mode) => mode === "dark" ? "light" : "dark"); return; }
      if (event.shiftKey && key === "g") { event.preventDefault(); toggleGrid(); return; }
      if (key === "p" && propertiesAutoOpen && selectedCount > 0) { event.preventDefault(); togglePanel("properties"); return; }
      if (key === "m") { event.preventDefault(); setMinimapOpen((open) => !open); return; }
      if (key === "f") { event.preventDefault(); fitDiagram(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, fitDiagram, openPanel, propertiesAutoOpen, searchRef, selectedCount, setMinimapOpen, toggleGrid, togglePanel]);

  useEffect(() => {
    const handleResetCanvas = (event) => {
      const target = event.target?.closest?.('button, [role="button"], a'); if (!target) return;
      if (target.textContent?.replace(/\s+/g, " ").trim().toLowerCase() !== "reset the canvas") return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      if (!window.confirm("Clear this canvas? Your saved Sketchizi canvas will also be cleared. This action cannot be undone.")) return;
      const api = apiRef.current; if (!api) return;
      if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      api.updateScene({ elements: [], appState: { ...api.getAppState(), selectedElementIds: {}, selectedGroupForOperation: null }, captureUpdate: CaptureUpdateAction.NEVER });
      api.history?.clear?.();
      clearEmergencyBackup(); fileActionsRef.current.clearFileAssociation?.();
      clearSketch().catch(() => setStorageError({ kind: "write", message: "The canvas was cleared, but the saved local copy could not be removed.", emergencySaved: false }));
    };
    document.addEventListener("click", handleResetCanvas, true);
    return () => document.removeEventListener("click", handleResetCanvas, true);
  }, [apiRef, fileActionsRef, saveTimerRef, setStorageError]);

  return { themeMode, setThemeMode, systemDark, isDarkTheme, propertiesAutoOpen, setPropertiesAutoOpen, fitDiagram };
}
