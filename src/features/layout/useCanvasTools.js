import { useCallback } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

export function useCanvasTools({ apiRef, gridEnabled, setGridEnabled, gridSize, setGridSize, connectionMode, setConnectionMode, selectedConnector, setSelectedConnector, selectedElements, canEdit = true }) {
  const getSelectedElements = useCallback(() => {
    const api = apiRef.current;
    if (!api) return [];
    const selectedIds = Object.keys(api.getAppState().selectedElementIds || {});
    return api.getSceneElements().filter((element) => selectedIds.includes(element.id) && !element.isDeleted);
  }, [apiRef]);

  const applyLayout = useCallback((operation) => {
    const api = apiRef.current;
    if (!api || !canEdit) return;
    const selected = getSelectedElements();
    if (selected.length < 2) return;
    const bounds = selected.map((element) => ({ element, left: element.x, right: element.x + element.width, top: element.y, bottom: element.y + element.height, centerX: element.x + element.width / 2, centerY: element.y + element.height / 2 }));
    const next = new Map();
    const setXY = (element, x, y) => next.set(element.id, { ...element, x, y, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() });
    if (operation === "left") { const x = Math.min(...bounds.map((b) => b.left)); bounds.forEach((b) => setXY(b.element, x, b.element.y)); }
    else if (operation === "center") { const left = Math.min(...bounds.map((b) => b.left)); const right = Math.max(...bounds.map((b) => b.right)); const center = (left + right) / 2; bounds.forEach((b) => setXY(b.element, center - b.element.width / 2, b.element.y)); }
    else if (operation === "right") { const right = Math.max(...bounds.map((b) => b.right)); bounds.forEach((b) => setXY(b.element, right - b.element.width, b.element.y)); }
    else if (operation === "top") { const y = Math.min(...bounds.map((b) => b.top)); bounds.forEach((b) => setXY(b.element, b.element.x, y)); }
    else if (operation === "middle") { const top = Math.min(...bounds.map((b) => b.top)); const bottom = Math.max(...bounds.map((b) => b.bottom)); const center = (top + bottom) / 2; bounds.forEach((b) => setXY(b.element, b.element.x, center - b.element.height / 2)); }
    else if (operation === "bottom") { const bottom = Math.max(...bounds.map((b) => b.bottom)); bounds.forEach((b) => setXY(b.element, b.element.x, bottom - b.element.height)); }
    else if (operation === "distribute-horizontal" && selected.length >= 3) {
      const sorted = [...bounds].sort((a, b) => a.centerX - b.centerX); const first = sorted[0]; const last = sorted[sorted.length - 1];
      const totalWidth = sorted.reduce((sum, b) => sum + b.element.width, 0); const gap = (last.right - first.left - totalWidth) / (sorted.length - 1); let x = first.left;
      sorted.forEach((b, index) => { if (index === 0) x = first.left; else x += sorted[index - 1].element.width + gap; setXY(b.element, x, b.element.y); });
    } else if (operation === "distribute-vertical" && selected.length >= 3) {
      const sorted = [...bounds].sort((a, b) => a.centerY - b.centerY); const first = sorted[0]; const last = sorted[sorted.length - 1];
      const totalHeight = sorted.reduce((sum, b) => sum + b.element.height, 0); const gap = (last.bottom - first.top - totalHeight) / (sorted.length - 1); let y = first.top;
      sorted.forEach((b, index) => { if (index === 0) y = first.top; else y += sorted[index - 1].element.height + gap; setXY(b.element, b.element.x, y); });
    }
    if (!next.size) return;
    api.updateScene({ elements: api.getSceneElements().map((element) => next.get(element.id) || element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [apiRef, getSelectedElements]);

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

  return { getSelectedElements, applyLayout, setGrid, toggleGrid, activateArrowTool, activateSelectionTool, updateSelectedConnector, connectorPreset, applyToSelected, applyToSelectedArrow, updateSingleSelected, firstSelected: selectedElements[0] || null, hasTextSelection: selectedElements.some((e) => e.type === "text"), hasArrowSelection: selectedElements.some((e) => e.type === "arrow"), hasShapeSelection: selectedElements.some((e) => ["rectangle", "diamond", "ellipse", "line", "arrow"].includes(e.type)) };
}
