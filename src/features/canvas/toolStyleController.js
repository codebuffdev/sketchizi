import {
  appStatePatchMatches,
  createToolStylePresetStore,
  normalizeToolKey,
  stylePatchToAppState,
} from "./toolStylePresets.js";

/**
 * Framework-free controller behind useToolStylePresets. It has no React or
 * Excalidraw imports (the "never record in undo history" constant is injected)
 * so its behaviour can be tested in plain Node with a fake Excalidraw API.
 */
function toKeyList(targets) {
  const list = Array.isArray(targets) ? targets : [targets];
  return [...new Set(list.map(normalizeToolKey).filter(Boolean))];
}

export function createToolStyleController({ apiRef, activeCanvasIdRef, captureNever }) {
  const store = createToolStylePresetStore();
  const state = {
    lastCanvasId: null,
    previousTool: "selection",
    // Highlighter is a freedraw mode with its own colour/opacity/width. It must
    // neither receive the pen preset nor write its look into it.
    highlighterActive: false,
  };
  // Set when a preset (or the dock) picks a text font, so the font reconciliation
  // in useExcalidrawScene adopts it instead of resetting it to the old default.
  const presetFontOverrideRef = { current: null };

  const currentCanvasId = () => activeCanvasIdRef?.current || "canvas-1";

  /** Push style fields into Excalidraw's currentItem* defaults (no undo entry). */
  const syncAppState = (stylePatch) => {
    const api = apiRef?.current;
    if (!api?.updateScene) return false;
    const appStatePatch = stylePatchToAppState(stylePatch);
    if (!Object.keys(appStatePatch).length) return false;
    if (appStatePatchMatches(api.getAppState?.(), appStatePatch)) return true;
    api.updateScene({ appState: appStatePatch, captureUpdate: captureNever });
    return true;
  };

  const noteFont = (stylePatch) => {
    if (stylePatch && stylePatch.fontFamily !== undefined) presetFontOverrideRef.current = stylePatch.fontFamily;
  };

  /**
   * Restore the remembered style (or the defaults) for `toolType` into
   * Excalidraw's currentItem* state. Call before the user starts drawing.
   */
  const applyToolPreset = (toolType) => {
    const key = normalizeToolKey(toolType);
    if (!key || !apiRef?.current) return false;
    const preset = store.resolve(currentCanvasId(), key);
    if (!preset) return false;
    noteFont(preset);
    return syncAppState(preset);
  };

  /**
   * Remember style changes for one or more tool types on the active canvas.
   * `targets` is a tool key or list of keys (selected element types included).
   */
  const recordToolStyle = (targets, patch, options = {}) => {
    const canvasId = currentCanvasId();
    let recordedAny = false;
    for (const key of toKeyList(targets)) {
      if (state.highlighterActive && key === "freedraw") continue;
      const recorded = store.record(canvasId, key, patch);
      if (!recorded) continue;
      recordedAny = true;
      noteFont(recorded);
      if (options.syncAppState) syncAppState(recorded);
    }
    return recordedAny;
  };

  /** Convenience for selected elements: one preset update per distinct element type. */
  const recordElementsStyle = (elements, patch, options = {}) =>
    recordToolStyle((elements || []).map((element) => element?.type), patch, options);

  /**
   * Called from Excalidraw's onChange. Detects tool activation however it
   * happened (dock, radial wheel, keyboard shortcut, API) and restores the preset
   * before the first pointer-down.
   */
  const handleSceneChange = (appState, { canEdit = true } = {}) => {
    const canvasId = currentCanvasId();
    const type = String(appState?.activeTool?.type || "selection").toLowerCase();

    if (state.lastCanvasId !== canvasId) {
      // A freshly mounted canvas starts on its own tool; never "activate" it.
      state.lastCanvasId = canvasId;
      state.previousTool = type;
      store.ensureBaseRoughness(canvasId, appState?.currentItemRoughness);
      return;
    }
    if (type === state.previousTool) return;

    state.previousTool = type;
    if (state.highlighterActive && type !== "freedraw") state.highlighterActive = false;
    if (!canEdit) return;
    const key = normalizeToolKey(type);
    if (!key) return; // selection, eraser, hand, ...: never touch stored presets.

    // Deferred so a custom tool that announces itself right after switching
    // (highlighter) can claim the freedraw state first, and to avoid re-entering
    // Excalidraw's update cycle from inside onChange.
    queueMicrotask(() => {
      if (state.previousTool !== type) return;
      if (state.highlighterActive && key === "freedraw") return;
      applyToolPreset(key);
    });
  };

  return {
    // Stable API used by App, useCanvasTools, useExcalidrawScene and the docks.
    applyToolPreset,
    recordToolStyle,
    recordElementsStyle,
    handleSceneChange,
    getPreset: (toolType, canvasId = currentCanvasId()) => store.get(canvasId, toolType),
    exportCanvas: (canvasId = currentCanvasId()) => store.export(canvasId),
    hydrateCanvas: (canvasId, raw) => store.hydrate(canvasId, raw),
    forgetCanvas: (canvasId) => store.remove(canvasId),
    applyCanvasRoughness: (roughness, canvasId = currentCanvasId()) => store.setCanvasRoughness(canvasId, roughness),
    /** Returns a pending font choice once, so the scene hook can adopt it. */
    consumeFontOverride() {
      const value = presetFontOverrideRef.current;
      presetFontOverrideRef.current = null;
      return value;
    },
    attach() {
      const onCustomTool = (event) => {
        if (String(event.detail?.tool || "").toLowerCase() === "highlighter") state.highlighterActive = true;
      };
      const onClearCustomTool = () => { state.highlighterActive = false; };
      window.addEventListener("sketchizi:activate-tool", onCustomTool);
      window.addEventListener("sketchizi:clear-custom-tool", onClearCustomTool);
      return () => {
        window.removeEventListener("sketchizi:activate-tool", onCustomTool);
        window.removeEventListener("sketchizi:clear-custom-tool", onClearCustomTool);
      };
    },
  };
}
