import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { clearEmergencyBackup, clearSketch } from "../../persistence";
import { getInitialThemeMode, THEME_PREFERENCE_KEY } from "./themePreference.js";
import { applyCanvasThemeBackground } from "./canvasTheme.js";

export function useSketchiziPreferences({ apiRef, apiReady = false, closePanel, openPanel, togglePanel, activePanel, connectionMode, selectedCount, toggleGrid, toggleCanvasGrid, activateSelectionTool, setMinimapOpen, searchRef, saveTimerRef, fileActionsRef, setStorageError, sketchReady, savedSketch = null, canEdit = true }) {
  const [themeModeState, setThemeModeState] = useState(() => getInitialThemeMode());
  const themeMode = themeModeState === "light" ? "light" : "dark";
  const isDarkTheme = themeMode === "dark";
  const systemDark = isDarkTheme;
  const setThemeMode = useCallback((nextMode) => {
    setThemeModeState((current) => {
      const resolved = typeof nextMode === "function" ? nextMode(current) : nextMode;
      return resolved === "light" ? "light" : "dark";
    });
  }, []);
  // Canvas background is not independently configurable in the Day/Night-only design.
  // Keep no-op callbacks for the native menu adapter, but never let legacy saved
  // canvas-background preferences override the global application theme.
  const markCanvasBackgroundCustom = useCallback(() => {}, []);
  const useThemeDefaultBackground = useCallback(() => {
    applyCanvasThemeBackground(apiRef.current, isDarkTheme);
  }, [apiRef, isDarkTheme]);

  useEffect(() => { try { localStorage.setItem(THEME_PREFERENCE_KEY, themeMode); } catch {} }, [themeMode]);
  useEffect(() => {
    const root = document.documentElement; root.dataset.sketchiziTheme = isDarkTheme ? "dark" : "light";
    return () => { delete root.dataset.sketchiziTheme; };
  }, [isDarkTheme]);
  useEffect(() => {
    if (!apiReady || !sketchReady) return undefined;

    // Excalidraw applies `theme` and restored scene state during its own update
    // cycle. Reconcile after that cycle (two animation frames), not inline with
    // React's render or a potentially stale onChange snapshot.
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        applyCanvasThemeBackground(apiRef.current, isDarkTheme);
      });
    });
    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [apiRef, apiReady, isDarkTheme, savedSketch, sketchReady]);

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
      if (key === "d") { event.preventDefault(); setThemeMode((mode) => mode === "dark" ? "light" : "dark"); return; }
      if (event.shiftKey && key === "g") { event.preventDefault(); toggleGrid(); return; }
      if (!event.shiftKey && key === "g") { event.preventDefault(); toggleCanvasGrid?.(); return; }
      if (key === "p" && selectedCount > 0) { event.preventDefault(); togglePanel("properties"); return; }
      if (key === "m") { event.preventDefault(); setMinimapOpen((open) => !open); return; }
      if (key === "f") { event.preventDefault(); fitDiagram(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, fitDiagram, openPanel, searchRef, selectedCount, setMinimapOpen, toggleCanvasGrid, toggleGrid, togglePanel]);

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

  return { themeMode, setThemeMode, systemDark, isDarkTheme, fitDiagram, markCanvasBackgroundCustom, useThemeDefaultBackground };
}
