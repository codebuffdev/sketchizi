import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { clearEmergencyBackup, clearSketch } from "../../persistence";
import { getInitialThemeMode, THEME_PREFERENCE_KEY } from "./themePreference.js";
import { CANVAS_BACKGROUND_MODE_KEY, resolveCanvasBackgroundMode } from "./canvasBackgroundMode.js";
import { CANVAS_BACKGROUND_EXPLICIT_COLOR_KEY, CANVAS_BACKGROUND_PATTERN_KEY, CANVAS_BACKGROUND_PATTERNS, normalizeHexColor } from "./canvasBackgroundOptions.js";

const LIGHT_CANVAS_BACKGROUND = "#ffffff";
const DARK_CANVAS_BACKGROUND = "#121212";

export function useSketchiziPreferences({ apiRef, apiReady = false, closePanel, openPanel, togglePanel, activePanel, connectionMode, selectedCount, toggleGrid, activateSelectionTool, setMinimapOpen, searchRef, saveTimerRef, fileActionsRef, setStorageError, sketchReady, savedSketch = null, canEdit = true }) {
  const [themeMode, setThemeMode] = useState(() => getInitialThemeMode());
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const isDarkTheme = themeMode === "dark" || (themeMode === "system" && systemDark);
  const canvasBackgroundModeKey = CANVAS_BACKGROUND_MODE_KEY;
  const [canvasBackgroundMode, setCanvasBackgroundMode] = useState(() => {
    try {
      const mode = localStorage.getItem(canvasBackgroundModeKey);
      return ["theme", "custom", "light", "dark"].includes(mode) ? mode : null;
    } catch { return null; }
  });
  const explicitCustomBackgroundRef = useRef((() => {
    try { return normalizeHexColor(localStorage.getItem(CANVAS_BACKGROUND_EXPLICIT_COLOR_KEY)); }
    catch { return null; }
  })());
  const [canvasBackgroundPattern, setCanvasBackgroundPatternState] = useState(() => {
    try {
      const saved = localStorage.getItem(CANVAS_BACKGROUND_PATTERN_KEY);
      return CANVAS_BACKGROUND_PATTERNS.some((item) => item.id === saved) ? saved : "solid";
    } catch { return "solid"; }
  });
  const setCanvasBackgroundPattern = useCallback((pattern) => {
    if (!CANVAS_BACKGROUND_PATTERNS.some((item) => item.id === pattern)) return;
    setCanvasBackgroundPatternState(pattern);
    try { localStorage.setItem(CANVAS_BACKGROUND_PATTERN_KEY, pattern); } catch {}
  }, []);

  // Older Sketchizi versions did not persist whether a scene background was
  // automatic or explicitly chosen. When restoring such a scene, preserve its
  // background as custom rather than silently replacing it on startup.
  useEffect(() => {
    if (!sketchReady || canvasBackgroundMode !== null) return;
    let storedMode = null;
    try { storedMode = localStorage.getItem(canvasBackgroundModeKey); } catch {}
    const initialMode = resolveCanvasBackgroundMode(storedMode, Boolean(savedSketch));
    setCanvasBackgroundMode(initialMode);
    try { localStorage.setItem(canvasBackgroundModeKey, initialMode); } catch {}
  }, [canvasBackgroundMode, savedSketch, sketchReady]);

  const markCanvasBackgroundCustom = useCallback(() => {
    explicitCustomBackgroundRef.current = null;
    setCanvasBackgroundMode("custom");
    try {
      localStorage.setItem(canvasBackgroundModeKey, "custom");
      localStorage.removeItem(CANVAS_BACKGROUND_EXPLICIT_COLOR_KEY);
    } catch {}
  }, [canvasBackgroundModeKey]);

  const setCanvasBackgroundModePreference = useCallback((mode) => {
    if (!["theme", "light", "dark"].includes(mode)) return;
    explicitCustomBackgroundRef.current = null;
    setCanvasBackgroundMode(mode);
    try {
      localStorage.setItem(canvasBackgroundModeKey, mode);
      localStorage.removeItem(CANVAS_BACKGROUND_EXPLICIT_COLOR_KEY);
    } catch {}
    const api = apiRef.current;
    if (!api || !apiReady) return;
    const nextBackground = mode === "light"
      ? LIGHT_CANVAS_BACKGROUND
      : mode === "dark"
        ? DARK_CANVAS_BACKGROUND
        : isDarkTheme ? DARK_CANVAS_BACKGROUND : LIGHT_CANVAS_BACKGROUND;
    api.updateScene({ appState: { viewBackgroundColor: nextBackground }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef, apiReady, canvasBackgroundModeKey, isDarkTheme]);

  const applyCanvasBackgroundColor = useCallback((value) => {
    const color = normalizeHexColor(value);
    if (!color) return false;
    explicitCustomBackgroundRef.current = color;
    setCanvasBackgroundMode("custom");
    try {
      localStorage.setItem(canvasBackgroundModeKey, "custom");
      localStorage.setItem(CANVAS_BACKGROUND_EXPLICIT_COLOR_KEY, color);
    } catch {}
    const api = apiRef.current;
    if (api && apiReady) api.updateScene({ appState: { viewBackgroundColor: color }, captureUpdate: CaptureUpdateAction.NEVER });
    return true;
  }, [apiRef, apiReady, canvasBackgroundModeKey]);

  const useThemeDefaultBackground = useCallback(() => {
    setCanvasBackgroundModePreference("theme");
  }, [setCanvasBackgroundModePreference]);

  useEffect(() => { try { localStorage.setItem(THEME_PREFERENCE_KEY, themeMode); } catch {} }, [themeMode]);
  useEffect(() => { try { localStorage.setItem(CANVAS_BACKGROUND_PATTERN_KEY, canvasBackgroundPattern); } catch {} }, [canvasBackgroundPattern]);
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
    const api = apiRef.current;
    if (!api || !apiReady || !sketchReady) return;

    const current = String(api.getAppState().viewBackgroundColor || "").trim().toLowerCase();

    // Migrate legacy background defaults only when they weren't just explicitly
    // selected with the custom color picker in this session.
    const legacyDefaultBackgrounds = new Set([LIGHT_CANVAS_BACKGROUND, "#fff", "#dedede", "#dcdcdc", "#e0e0e0"]);
    const isLegacyDefault = canvasBackgroundMode === "custom"
      && legacyDefaultBackgrounds.has(current)
      && explicitCustomBackgroundRef.current !== current;
    if (isLegacyDefault) {
      setCanvasBackgroundMode("theme");
      try { localStorage.setItem(canvasBackgroundModeKey, "theme"); } catch {}
    }

    if (canvasBackgroundMode === "custom" && !isLegacyDefault) return;
    if (!isLegacyDefault && !["theme", "light", "dark"].includes(canvasBackgroundMode)) return;

    const nextBackground = canvasBackgroundMode === "light"
      ? LIGHT_CANVAS_BACKGROUND
      : canvasBackgroundMode === "dark"
        ? DARK_CANVAS_BACKGROUND
        : isDarkTheme ? DARK_CANVAS_BACKGROUND : LIGHT_CANVAS_BACKGROUND;
    if (current === nextBackground) return;

    // Update Excalidraw's real scene background without creating an undo entry.
    api.updateScene({ appState: { viewBackgroundColor: nextBackground }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef, apiReady, canvasBackgroundMode, canvasBackgroundModeKey, isDarkTheme, savedSketch, sketchReady]);

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
      if (key === "p" && selectedCount > 0) { event.preventDefault(); togglePanel("properties"); return; }
      if (key === "m") { event.preventDefault(); setMinimapOpen((open) => !open); return; }
      if (key === "f") { event.preventDefault(); fitDiagram(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, fitDiagram, openPanel, searchRef, selectedCount, setMinimapOpen, toggleGrid, togglePanel]);

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

  return { themeMode, setThemeMode, systemDark, isDarkTheme, fitDiagram, canvasBackgroundMode, canvasBackgroundPattern, setCanvasBackgroundPattern, applyCanvasBackgroundColor, setCanvasBackgroundModePreference, markCanvasBackgroundCustom, useThemeDefaultBackground };
}
