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
    const api = apiRef.current; if (!api) return;
    const selected = getSelectedElements(); if (!selected.length) return;
    const ids = new Set(selected.map((element) => element.id)); const now = Date.now();
    const sceneElements = api.getSceneElements();
    const iconImages = selected.filter((element) => element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon));
    let files;
    if (patch.strokeColor && iconImages.length) {
      const currentFiles = api.getFiles?.() || {};
      files = { ...currentFiles };
      for (const element of iconImages) {
        const file = files[element.fileId];
        if (!file?.dataURL || !/^data:image\/svg\+xml/i.test(file.dataURL)) continue;
        try {
          const comma = file.dataURL.indexOf(",");
          const svgText = decodeURIComponent(file.dataURL.slice(comma + 1));
          const parser = new DOMParser();
          const document = parser.parseFromString(svgText, "image/svg+xml");
          if (document.querySelector("parsererror")) continue;
          const svg = document.documentElement;
          const nodes = [svg, ...svg.querySelectorAll("*")];
          for (const node of nodes) {
            const fill = node.getAttribute("fill");
            const stroke = node.getAttribute("stroke");
            if (fill && fill.toLowerCase() !== "none" && fill.toLowerCase() !== "transparent" && !fill.startsWith("url(")) node.setAttribute("fill", patch.strokeColor);
            if (stroke && stroke.toLowerCase() !== "none" && stroke.toLowerCase() !== "transparent" && !stroke.startsWith("url(")) node.setAttribute("stroke", patch.strokeColor);
            const style = node.getAttribute("style");
            if (style) node.setAttribute("style", style.replace(/(fill|stroke)\s*:\s*(?!none\b|transparent\b)[^;]+/gi, (_match, property) => `${property}:${patch.strokeColor}`));
          }
          const recolored = new XMLSerializer().serializeToString(svg);
          files[element.fileId] = { ...file, dataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolored)}` };
        } catch {
          // Unsupported or malformed SVGs retain their original artwork.
        }
      }
    }
    const updatedElements = sceneElements.map((element) => ids.has(element.id) ? { ...element, ...patch, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now } : element);
    api.updateScene({ elements: updatedElements, ...(files ? { files } : {}), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
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
