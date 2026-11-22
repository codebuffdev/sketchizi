import { useCallback } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { getActiveSelectedElementIds } from "./selectedElementIds.js";
import { normalizeArrowheadPatch } from "./arrowheads.js";
import { getRoutingPatch } from "./arrowRouting.js";

// Mirrors an arrowhead change onto appState so the next arrow inherits it.
function arrowheadAppStatePatch(patch) {
  const out = {};
  if ("startArrowhead" in patch) out.currentItemStartArrowhead = patch.startArrowhead;
  if ("endArrowhead" in patch) out.currentItemEndArrowhead = patch.endArrowhead;
  return out;
}

export function useCanvasTools({ apiRef, gridEnabled, setGridEnabled, gridSize, setGridSize, connectionMode, setConnectionMode, selectedConnector, setSelectedConnector, selectedElements, canEdit = true, toolStylePresets = null }) {
  const getSelectedElements = useCallback(() => {
    const api = apiRef.current;
    if (!api) return [];
    const selectedIds = getActiveSelectedElementIds(api.getAppState().selectedElementIds);
    return api.getSceneElements().filter((element) => selectedIds.includes(element.id) && !element.isDeleted);
  }, [apiRef]);


  const setGrid = useCallback((enabled, size = gridSize) => {
    const api = apiRef.current;
    if (!api) return;
    const safeSize = Math.max(5, Math.min(100, Number(size) || 20));
    setGridSize(safeSize); setGridEnabled(enabled);
    // gridEnabled controls only Sketchizi's custom Canvas Style overlay.
    // Excalidraw's native grid mode doubles as "Snap to Grid" and is owned by
    // the header settings popover, so preserve whatever it is set to.
    api.updateScene({ appState: { gridModeEnabled: Boolean(api.getAppState?.()?.gridModeEnabled), gridSize: safeSize, gridStep: safeSize }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef, canEdit, gridSize, setGridEnabled, setGridSize]);
  const toggleGrid = useCallback(() => setGrid(!gridEnabled, gridSize), [gridEnabled, gridSize, setGrid]);
  // Activate a drawing tool and restore its remembered style (per canvas) first, so
  // the contextual dock and the very first pointer-down already use it. Keyboard
  // shortcuts, the radial wheel and the native toolbar reach the same restore
  // through useExcalidrawScene's tool-change detection.
  const activateDrawingTool = useCallback((toolType) => {
    const api = apiRef.current;
    if (!api || !canEdit || !toolType) return false;
    toolStylePresets?.applyToolPreset?.(toolType);
    api.setActiveTool({ type: toolType });
    return true;
  }, [apiRef, canEdit, toolStylePresets]);
  const activateArrowTool = useCallback(() => { if (!activateDrawingTool("arrow")) return; setConnectionMode(true); }, [activateDrawingTool, setConnectionMode]);
  const activateSelectionTool = useCallback(() => { if (!apiRef.current) return; apiRef.current.setActiveTool({ type: "selection" }); setConnectionMode(false); }, [apiRef, setConnectionMode]);

  const updateSelectedConnector = useCallback((rawPatch) => {
    if (!canEdit) return;
    const patch = normalizeArrowheadPatch(rawPatch);
    const api = apiRef.current;
    if (!api || !selectedConnector) return;
    const selected = api.getSceneElements().find((element) => element.id === selectedConnector.id);
    if (!selected || selected.type !== "arrow") return;
    const updated = { ...selected, ...patch, version: selected.version + 1 };
    api.updateScene({ elements: api.getSceneElements().map((element) => element.id === selected.id ? updated : element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSelectedConnector(updated);
  }, [apiRef, canEdit, selectedConnector, setSelectedConnector]);
  const connectorPreset = useCallback((name) => {
    // Routing patches keep the waypoints the user placed (free polyline) or
    // normalise them to orthogonal segments (elbow).
    const routed = (mode) => {
      const element = apiRef.current?.getSceneElements?.().find((candidate) => candidate.id === selectedConnector?.id);
      return element ? getRoutingPatch(element, mode) : { elbowed: mode === "elbow" };
    };
    if (name === "straight") updateSelectedConnector({ ...routed("polyline"), startArrowhead: null, endArrowhead: "arrow" });
    if (name === "elbow") updateSelectedConnector({ ...routed("elbow"), startArrowhead: null, endArrowhead: "arrow" });
    if (name === "bidirectional") updateSelectedConnector({ ...routed("polyline"), startArrowhead: "arrow", endArrowhead: "arrow" });
  }, [apiRef, selectedConnector, updateSelectedConnector]);

  const applyToSelected = useCallback((rawPatch) => {
    if (!canEdit) return;
    const patch = normalizeArrowheadPatch(rawPatch);
    const api = apiRef.current;
    if (!api) return;
    const selected = getSelectedElements();
    if (!selected.length) return;

    const selectedIds = new Set(selected.map((element) => element.id));
    const now = Date.now();
    const updatedElements = api.getSceneElements().map((element) => {
      if (!selectedIds.has(element.id)) return element;
      // Keep library image assets untouched until recoloring can preserve Excalidraw file references safely.
      if (element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon)) return element;
      return { ...element, ...patch, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now };
    });

    const arrowheadState = arrowheadAppStatePatch(patch);
    api.updateScene({
      elements: updatedElements,
      ...(Object.keys(arrowheadState).length ? { appState: arrowheadState } : {}),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [apiRef, canEdit, getSelectedElements]);

  const applyToSelectedArrow = useCallback((rawPatch) => {
    if (!canEdit) return;
    const patch = normalizeArrowheadPatch(rawPatch);
    const api = apiRef.current; if (!api) return;
    const selected = getSelectedElements().filter((element) => element.type === "arrow"); if (!selected.length) return;
    const ids = new Set(selected.map((element) => element.id)); const now = Date.now();
    const arrowheadState = arrowheadAppStatePatch(patch);
    api.updateScene({ elements: api.getSceneElements().map((element) => ids.has(element.id) ? { ...element, ...patch, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now } : element), ...(Object.keys(arrowheadState).length ? { appState: arrowheadState } : {}), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [apiRef, canEdit, getSelectedElements]);
  const updateSingleSelected = useCallback((patch) => { if (selectedElements.length === 1) applyToSelected(patch); }, [selectedElements.length, applyToSelected]);

  return { getSelectedElements, toggleGrid, activateDrawingTool, activateArrowTool, activateSelectionTool, updateSelectedConnector, connectorPreset, applyToSelected, applyToSelectedArrow, updateSingleSelected, firstSelected: selectedElements[0] || null, hasTextSelection: selectedElements.some((e) => e.type === "text"), hasArrowSelection: selectedElements.some((e) => e.type === "arrow"), hasShapeSelection: selectedElements.some((e) => ["rectangle", "diamond", "ellipse", "line", "arrow"].includes(e.type)) };
}
