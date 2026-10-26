import { useCallback } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
function recolorSvgDataUrl(dataURL, color) {
  if (!/^#[0-9a-f]{6}$/i.test(String(color || "")) || !String(dataURL || "").startsWith("data:image/svg+xml;base64,")) return null;
  try {
    const svg = decodeURIComponent(escape(atob(dataURL.slice(dataURL.indexOf(",") + 1))));
    const recolored = svg
      .replace(/\b(fill|stroke)\s*=\s*(["\x27])(?!none\2|transparent\2)[^"\x27]+\2/gi, (_, property, quote) => property + "=" + quote + color + quote)
      .replace(/\b(fill|stroke)\s*:\s*(?!none\b|transparent\b)[^;"}]+/gi, (_, property) => property + ":" + color);
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(recolored)));
  } catch { return null; }
}


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
    api.updateScene({ appState: { gridModeEnabled: false, gridSize: safeSize, gridStep: safeSize }, captureUpdate: CaptureUpdateAction.NEVER });
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
    const api = apiRef.current;
    if (!api) return;
    const selected = getSelectedElements();
    if (!selected.length) return;

    const selectedIds = new Set(selected.map((element) => element.id));
    const now = Date.now();
    const files = api.getFiles?.() || {};
    const recoloredFiles = [];
    const updatedElements = api.getSceneElements().map((element) => {
      if (!selectedIds.has(element.id)) return element;
      if (patch.tintColor && element.type === "image" && element.customData?.iconId && !["AWS Architecture", "Kubernetes", "Networking"].includes(element.customData?.iconCategory)) {
        const file = files[element.fileId];
        const dataURL = recolorSvgDataUrl(file?.dataURL, patch.tintColor);
        if (dataURL) recoloredFiles.push({ id: element.fileId, dataURL, mimeType: "image/svg+xml", created: file.created || now, lastRetrieved: now });
        return { ...element, customData: { ...(element.customData || {}), tintColor: patch.tintColor }, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now };
      }
      if (element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon)) return element;
      return { ...element, ...patch, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now };
    });
    if (recoloredFiles.length) api.addFiles(recoloredFiles);

    api.updateScene({
      elements: updatedElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
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
