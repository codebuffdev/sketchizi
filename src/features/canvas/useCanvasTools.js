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
    const recoloredFileIds = new Map();
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
          const viewBox = (svg.getAttribute("viewBox") || "")
            .trim()
            .split(/[\s,]+/)
            .map(Number);
          const [viewX, viewY, viewWidth, viewHeight] = viewBox;
          const isCanvasBackground = (node) => {
            if (node.tagName.toLowerCase() !== "rect") return false;
            const x = Number(node.getAttribute("x") || 0);
            const y = Number(node.getAttribute("y") || 0);
            const width = Number(node.getAttribute("width"));
            const height = Number(node.getAttribute("height"));
            return Number.isFinite(viewWidth) && Number.isFinite(viewHeight) &&
              width >= viewWidth * 0.95 && height >= viewHeight * 0.95 &&
              x <= viewX + viewWidth * 0.05 && y <= viewY + viewHeight * 0.05;
          };
          // Full-canvas rectangles are often intentional icon backgrounds.
          // Recoloring them hides the actual glyph and creates a solid block.
          const backgroundNodes = new Set(nodes.filter(isCanvasBackground));
          let changedPaint = false;
          const shouldReplacePaint = (value) =>
            Boolean(value) &&
            !/^(none|transparent|inherit|initial|unset)$/i.test(value.trim()) &&
            !/^url\(/i.test(value.trim());

          // Recolor explicit SVG presentation attributes without turning filled
          // artwork into outlines. Preserve none/transparent and gradient refs.
          for (const node of nodes) {
            if (backgroundNodes.has(node)) continue;
            for (const attribute of ["fill", "stroke", "stop-color", "flood-color", "color"]) {
              const value = node.getAttribute(attribute);
              if (shouldReplacePaint(value) || /^currentColor$/i.test(value || "")) {
                node.setAttribute(attribute, patch.strokeColor);
                changedPaint = true;
              }
            }

            const style = node.getAttribute("style");
            if (style) {
              const recoloredStyle = style.replace(
                /(^|;\s*)(fill|stroke|stop-color|flood-color|color)\s*:\s*([^;]+)/gi,
                (match, prefix, property, value) => {
                  if (!shouldReplacePaint(value) && !/^currentColor$/i.test(value.trim())) return match;
                  changedPaint = true;
                  return `${prefix}${property}:${patch.strokeColor}`;
                },
              );
              if (recoloredStyle !== style) node.setAttribute("style", recoloredStyle);
            }
          }

          // SVG libraries often define their colors in embedded CSS classes.
          // Rewrite those declarations too, while retaining fills, strokes,
          // masks, gradients, and the original icon geometry.
          for (const styleNode of svg.querySelectorAll("style")) {
            // Styles can target the full-canvas background rectangle too. If
            // present, avoid broad stylesheet rewriting and only recolor
            // explicit paint attributes on non-background artwork.
            if (backgroundNodes.size) continue;
            const css = styleNode.textContent || "";
            const recoloredCss = css.replace(
              /(fill|stroke|stop-color|flood-color|color)\s*:\s*([^;}]+)/gi,
              (match, property, value) => {
                if (!shouldReplacePaint(value) && !/^currentColor$/i.test(value.trim())) return match;
                changedPaint = true;
                return `${property}:${patch.strokeColor}`;
              },
            );
            if (recoloredCss !== css) styleNode.textContent = recoloredCss;
          }

          // If the SVG uses an unsupported paint mechanism, leave its artwork
          // intact rather than producing a solid block or a broken outline.
          if (!changedPaint) continue;
          const recolored = new XMLSerializer().serializeToString(svg);
          const recoloredFileId = `icon-recolored-${element.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          recoloredFileIds.set(element.id, recoloredFileId);
          recoloredFiles.push({
            ...file,
            id: recoloredFileId,
            dataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolored)}`,
            mimeType: "image/svg+xml",
            lastRetrieved: Date.now(),
          });
        } catch {
          // Unsupported or malformed SVGs retain their original artwork.
        }
      }
    }
    const updatedElements = sceneElements.map((element) => {
      if (!ids.has(element.id)) return element;
      const recoloredFileId = recoloredFileIds.get(element.id);
      return {
        ...element,
        ...patch,
        ...(recoloredFileId ? { fileId: recoloredFileId } : {}),
        version: element.version + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: now,
      };
    });
    // Excalidraw caches image assets by file ID. Use a fresh ID for recolored
    // artwork so the renderer cannot keep displaying the original cached SVG.
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
