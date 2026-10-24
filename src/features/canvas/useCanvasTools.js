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
    const recoloredFiles = [];
    if (patch.strokeColor && iconImages.length) {
      const currentFiles = api.getFiles?.() || {};
      for (const element of iconImages) {
        const file = currentFiles[element.fileId];
        if (!file?.dataURL || !/^data:image\/svg\+xml/i.test(file.dataURL)) continue;
        try {
          const comma = file.dataURL.indexOf(",");
          if (comma < 0) continue;
          const metadata = file.dataURL.slice(0, comma);
          const payload = file.dataURL.slice(comma + 1);
          const svgText = /;base64/i.test(metadata)
            ? decodeURIComponent(escape(atob(payload)))
            : decodeURIComponent(payload);
          const parser = new DOMParser();
          const document = parser.parseFromString(svgText, "image/svg+xml");
          if (document.querySelector("parsererror")) continue;
          const svg = document.documentElement;
          const nodes = [svg, ...svg.querySelectorAll("*")];
          let changedPaint = false;
          const replacePaint = (value) => {
            if (!value || /^(none|transparent|inherit)$/i.test(value.trim()) || /^url\(/i.test(value.trim())) return value;
            return patch.strokeColor;
          };
          for (const node of nodes) {
            for (const attribute of ["fill", "stroke"]) {
              const value = node.getAttribute(attribute);
              if (value && replacePaint(value) !== value) {
                node.setAttribute(attribute, patch.strokeColor);
                changedPaint = true;
              } else if (/^currentColor$/i.test(value || "")) {
                node.setAttribute(attribute, patch.strokeColor);
                changedPaint = true;
              }
            }
            const style = node.getAttribute("style");
            if (style) {
              const recoloredStyle = style.replace(/(fill|stroke)\s*:\s*([^;]+)/gi, (match, property, value) => {
                if (/^(none|transparent|inherit)$/i.test(value.trim()) || /^url\(/i.test(value.trim())) return match;
                changedPaint = true;
                return `${property}:${patch.strokeColor}`;
              });
              if (recoloredStyle !== style) node.setAttribute("style", recoloredStyle);
            }
          }
          // Some icon sets rely on inherited paint or currentColor rather than
          // explicit fill/stroke attributes on every path.
          if (!changedPaint) {
            for (const node of nodes) {
              if (node.tagName.toLowerCase() === "svg" || ["path", "circle", "ellipse", "rect", "polygon", "polyline", "line"].includes(node.tagName.toLowerCase())) {
                node.setAttribute("fill", "none");
                node.setAttribute("stroke", patch.strokeColor);
              }
            }
          }
          const recolored = new XMLSerializer().serializeToString(svg);
          recoloredFiles.push({
            ...file,
            id: element.fileId,
            dataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolored)}`,
            mimeType: "image/svg+xml",
            lastRetrieved: Date.now(),
          });
        } catch {
          // Unsupported or malformed SVGs retain their original artwork.
        }
      }
    }
    const updatedElements = sceneElements.map((element) => ids.has(element.id) ? { ...element, ...patch, version: element.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now } : element);
    // Excalidraw's updateScene does not reliably replace cached image files.
    // Update the image cache through addFiles before refreshing the selected
    // elements, keeping each existing file ID so the image elements resolve
    // to the recolored SVG rather than the original cached artwork.
    if (recoloredFiles.length) api.addFiles(recoloredFiles);
    api.updateScene({ elements: updatedElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
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
