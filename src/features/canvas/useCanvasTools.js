import { useCallback } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

export function useCanvasTools({ apiRef, gridEnabled, setGridEnabled, gridSize, setGridSize, connectionMode, setConnectionMode, selectedConnector, setSelectedConnector, selectedElements, canEdit = true }) {
  const getSelectedElements = useCallback(() => {
    const api = apiRef.current;
    if (!api) return [];
    const selectedIds = Object.keys(api.getAppState().selectedElementIds || {});
    return api.getSceneElements().filter((element) => selectedIds.includes(element.id) && !element.isDeleted);
  }, [apiRef]);


  const setGrid = useCallback((enabled, size = gridSize) => {
    const api = apiRef.current;
    if (!api || !canEdit) return;
    const safeSize = Math.max(5, Math.min(100, Number(size) || 20));
    setGridSize(safeSize); setGridEnabled(enabled);
    api.updateScene({ appState: { ...api.getAppState(), gridModeEnabled: enabled, gridSize: safeSize, gridStep: safeSize }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef, canEdit, gridSize, setGridEnabled, setGridSize]);
  const toggleGrid = useCallback(() => setGrid(!gridEnabled, gridSize), [gridEnabled, gridSize, setGrid]);
  const activateArrowTool = useCallback(() => { if (!apiRef.current || !canEdit) return; apiRef.current.setActiveTool({ type: "arrow" }); setConnectionMode(true); }, [apiRef, setConnectionMode]);
  const activateSelectionTool = useCallback(() => { if (!apiRef.current) return; apiRef.current.setActiveTool({ type: "selection" }); setConnectionMode(false); }, [apiRef, setConnectionMode]);

  const updateSelectedConnector = useCallback((patch) => {
    if (!canEdit) return;
    const api = apiRef.current;
    if (!api || !selectedConnector) return;
    const selected = api.getSceneElements().find((element) => element.id === selectedConnector.id);
    if (!selected || selected.type !== "arrow") return;
    const updated = { ...selected, ...patch, version: selected.version + 1 };
    api.updateScene({ elements: api.getSceneElements().map((element) => element.id === selected.id ? updated : element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSelectedConnector(updated);
  }, [apiRef, canEdit, selectedConnector, setSelectedConnector]);
  const connectorPreset = useCallback((name) => {
    if (name === "straight") updateSelectedConnector({ elbowed: false, startArrowhead: null, endArrowhead: "arrow" });
    if (name === "elbow") updateSelectedConnector({ elbowed: true, startArrowhead: null, endArrowhead: "arrow" });
    if (name === "bidirectional") updateSelectedConnector({ elbowed: false, startArrowhead: "arrow", endArrowhead: "arrow" });
  }, [updateSelectedConnector]);

  const applyToSelected = useCallback((patch) => {
    if (!canEdit) return;
    const api = apiRef.current; if (!api) return;
    const selected = getSelectedElements(); if (!selected.length) return;
    const ids = new Set(selected.map((element) => element.id)); const now = Date.now();
    api.updateScene({ elements: api.getSceneElements().map((element) => ids.has(element.id) ? { ...element, ...patch, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now } : element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [apiRef, canEdit, getSelectedElements]);
  const applyToSelectedArrow = useCallback((patch) => {
    if (!canEdit) return;
    const api = apiRef.current; if (!api) return;
    const selected = getSelectedElements().filter((element) => element.type === "arrow"); if (!selected.length) return;
    const ids = new Set(selected.map((element) => element.id)); const now = Date.now();
    api.updateScene({ elements: api.getSceneElements().map((element) => ids.has(element.id) ? { ...element, ...patch, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now } : element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [apiRef, canEdit, getSelectedElements]);
  const updateSingleSelected = useCallback((patch) => { if (selectedElements.length === 1) applyToSelected(patch); }, [selectedElements.length, applyToSelected]);

  return { getSelectedElements, toggleGrid, activateArrowTool, activateSelectionTool, updateSelectedConnector, connectorPreset, applyToSelected, applyToSelectedArrow, updateSingleSelected, firstSelected: selectedElements[0] || null, hasTextSelection: selectedElements.some((e) => e.type === "text"), hasArrowSelection: selectedElements.some((e) => e.type === "arrow"), hasShapeSelection: selectedElements.some((e) => ["rectangle", "diamond", "ellipse", "line", "arrow"].includes(e.type)) };
}
