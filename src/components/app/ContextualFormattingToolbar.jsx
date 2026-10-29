import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FONT_FAMILY_ID } from "../../features/canvas/fontFamilyDefaults.js";

const STROKE_COLORS = [
  ["#2f2f33", "Ink"],
  ["#d25555", "Red"],
  ["#3f9b57", "Green"],
  ["#3d79b9", "Blue"],
  ["#d98a27", "Orange"],
  ["#7c3aed", "Violet"],
];
const FILL_COLORS = [
  ["transparent", "No fill"],
  ["#e7bfc1", "Rose fill"],
  ["#b9dfc0", "Mint fill"],
  ["#a8c7e5", "Blue fill"],
  ["#e2d8b9", "Sand fill"],
];
const SHAPE_TYPES = new Set(["rectangle", "diamond", "ellipse"]);
const LINE_TYPES = new Set(["line", "arrow", "rectangle", "diamond", "ellipse"]);
const FILL_STYLES = [["hachure", "Hachure", "///"], ["cross-hatch", "Cross hatch", "###"], ["solid", "Solid", "■"]];
const STROKE_STYLES = [["solid", "Solid", "━━"], ["dashed", "Dashed", "— —"], ["dotted", "Dotted", "· · ·"]];
const ROUGHNESS = [[0, "Architect"], [1, "Artist"], [2, "Cartoonist"]];
const FONT_FAMILIES = [[1, "Hand-drawn", "✎"], [2, "Sans", "A"], [3, "Code", "</>"], [5, "Excalifont", "E"], [6, "Nunito", "N"], [7, "Lilita", "L"], [8, "Comic", "C"], [9, "Liberation", "L"]];
const FONT_SIZES = [[12, "XS"], [16, "S"], [20, "M"], [28, "L"], [36, "XL"]];
const TEXT_ALIGNMENTS = [["left", "Left", "≡"], ["center", "Center", "☰"], ["right", "Right", "≡"]];
const GROUPS = [
  { id: "stroke", label: "Stroke", icon: "◒" },
  { id: "fontFamily", label: "Font family", icon: "A" },
  { id: "fontSize", label: "Font size", icon: "T" },
  { id: "textAlign", label: "Text align", icon: "≡" },
  { id: "opacity", label: "Opacity", icon: "◐" },
  { id: "layers", label: "Layers", icon: "▤" },
];

function getSelectionPosition(api, elements, root, isPopoverOpen = false) {
  if (!api || !root) return null;
  const appState = api.getAppState?.();
  if (!appState) return null;
  // Drawing-tool controls have no selected element to anchor to. Keep their
  // rail in a stable, reachable position inside the canvas viewport instead.
  if (!elements.length) {
    return {
      left: "16px",
      top: "64px",
      "--format-popover-side": root.clientWidth > 390 ? "right" : "left",
    };
  }

  const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
  const sceneBounds = elements.reduce((bounds, element) => {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;
    bounds.left = Math.min(bounds.left, x, x + width);
    bounds.top = Math.min(bounds.top, y, y + height);
    bounds.right = Math.max(bounds.right, x, x + width);
    bounds.bottom = Math.max(bounds.bottom, y, y + height);
    return bounds;
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  if (!Number.isFinite(sceneBounds.left) || !Number.isFinite(sceneBounds.top)) return null;

  const rootWidth = root.clientWidth || Number(appState.width) || 1;
  const rootHeight = root.clientHeight || Number(appState.height) || 1;
  // Use the actual overlay dimensions for placement. Excalidraw app-state
  // dimensions can differ from the root when side panels or browser zoom alter
  // the canvas viewport, so scale scene coordinates into the overlay's space.
  const appWidth = Number(appState.width) || rootWidth;
  const appHeight = Number(appState.height) || rootHeight;
  const scaleX = (rootWidth / appWidth) * zoom;
  const scaleY = (rootHeight / appHeight) * zoom;
  const scrollX = Number(appState.scrollX) || 0;
  const scrollY = Number(appState.scrollY) || 0;
  // Scene coordinates map into the canvas viewport from its top-left origin.
  // Do not add half the viewport size: that incorrectly shifts the rail toward
  // the far edge and can push it off-screen for selections near the opposite side.
  const selectionLeft = (sceneBounds.left + scrollX) * scaleX;
  const selectionRight = (sceneBounds.right + scrollX) * scaleX;
  const selectionTop = (sceneBounds.top + scrollY) * scaleY;
  const selectionBottom = (sceneBounds.bottom + scrollY) * scaleY;

  const railWidth = 44;
  const railHeight = Math.min(300, elements.length ? 6 * 38 + 12 : 12);
  const gap = 10;
  const edge = 8;

  // Keep the rail beside the selected object instead of centering it in the
  // canvas. Prefer its right edge, then left edge, and only use a clamped
  // centered fallback when the selection is too close to both viewport edges.
  const rightCandidate = selectionRight + gap;
  const leftCandidate = selectionLeft - railWidth - gap;
  const left = rightCandidate + railWidth <= rootWidth - edge
    ? rightCandidate
    : leftCandidate >= edge
      ? leftCandidate
      : Math.max(edge, Math.min(rootWidth - railWidth - edge, selectionRight - railWidth / 2));

  const popoverHeight = Math.min(520, Math.max(180, rootHeight - 24));
  const selectionCenterY = (selectionTop + selectionBottom) / 2;
  const preferredTop = isPopoverOpen
    ? selectionCenterY - Math.min(popoverHeight, 300) / 2
    : selectionCenterY - railHeight / 2;
  const maxTop = Math.max(edge, rootHeight - (isPopoverOpen ? Math.min(popoverHeight, rootHeight - 16) : railHeight) - edge);
  const top = Math.max(edge, Math.min(maxTop, preferredTop));
  const popoverSide = left + railWidth + 320 + 16 <= rootWidth ? "right" : "left";

  return {
    left: `${left}px`,
    top: `${top}px`,
    "--format-popover-side": popoverSide,
  };
}

function straightArrowPatch(element) {
  const sourcePoints = Array.isArray(element?.points) && element.points.length >= 2
    ? element.points
    : [[0, 0], [Number(element?.width) || 0, Number(element?.height) || 0]];
  const start = sourcePoints[0];
  const end = sourcePoints[sourcePoints.length - 1];
  const minX = Math.min(start[0], end[0]);
  const minY = Math.min(start[1], end[1]);
  const maxX = Math.max(start[0], end[0]);
  const maxY = Math.max(start[1], end[1]);
  return {
    x: element.x + minX,
    y: element.y + minY,
    width: maxX - minX,
    height: maxY - minY,
    points: [[start[0] - minX, start[1] - minY], [end[0] - minX, end[1] - minY]],
    elbowed: false,
    roundness: null,
  };
}

function curvedArrowPatch(element) {
  const sourcePoints = Array.isArray(element?.points) && element.points.length >= 2
    ? element.points
    : [[0, 0], [Number(element?.width) || 0, Number(element?.height) || 0]];
  const start = sourcePoints[0];
  const end = sourcePoints[sourcePoints.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  // Add a perpendicular midpoint so the arrow has a visible curved/bent path.
  const bend = Math.max(24, Math.min(72, length * 0.18));
  const middle = [
    (start[0] + end[0]) / 2 - (dy / length) * bend,
    (start[1] + end[1]) / 2 + (dx / length) * bend,
  ];
  const points = [start, middle, end];
  const minX = Math.min(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const maxY = Math.max(...points.map((point) => point[1]));
  return {
    x: element.x + minX,
    y: element.y + minY,
    width: maxX - minX,
    height: maxY - minY,
    points: points.map(([x, y]) => [x - minX, y - minY]),
    elbowed: false,
    roundness: { type: 2 },
  };
}

function Swatch({ color, label, selected, onClick, fill = false }) {
  return (
    <button
      type="button"
      key={color}
      className={`format-option-swatch${selected ? " is-selected" : ""}${fill ? " is-fill-swatch" : ""}${color === "transparent" ? " is-transparent" : ""}`}
      style={color === "transparent" ? undefined : { "--swatch-color": color }}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
    >{color === "transparent" ? "×" : null}</button>
  );
}

export default function ContextualFormattingToolbar({
  apiRef,
  canvasRootRef,
  canvasRevision,
  selectedElements = [],
  applyToSelected,
  onOpenProperties,
  propertiesOpen = false,
  canEdit = true,
}) {
  const [openGroup, setOpenGroup] = useState(null);
  const [customToolMode, setCustomToolMode] = useState(null);
  const toolbarRef = useRef(null);
  const wasToolModeRef = useRef(false);
  useEffect(() => {
    const onCustomTool = (event) => {
      const tool = event.detail?.tool;
      if (tool === "bucketfill") {
        setCustomToolMode("fill");
        setOpenGroup("stroke");
      } else if (tool === "autoshape") {
        setCustomToolMode("shape");
        setOpenGroup("stroke");
      }
    };
    const onNativeTool = (event) => {
      const button = event.target?.closest?.(".App-toolbar button, .App-toolbar [role='button']");
      if (button && !button.closest(".sketchizi-dock-quick-tools")) setCustomToolMode(null);
    };
    window.addEventListener("sketchizi:activate-tool", onCustomTool);
    window.addEventListener("click", onNativeTool, true);
    return () => {
      window.removeEventListener("sketchizi:activate-tool", onCustomTool);
      window.removeEventListener("click", onNativeTool, true);
    };
  }, []);
  useEffect(() => {
    if (!openGroup) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpenGroup(null);
    };
    const onPointerDown = (event) => {
      if (!toolbarRef.current?.contains(event.target)) setOpenGroup(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openGroup]);
  const liveSelection = selectedElements.filter((element) => element && !element.isDeleted);
  const first = liveSelection[0];
  const appState = apiRef?.current?.getAppState?.() || {};
  const activeToolType = String(appState.activeTool?.type || "").toLowerCase();
  const drawingTool = activeToolType === "freedraw";
  const bucketFillTool = customToolMode === "fill" || ["bucket-fill", "bucketfill", "fill"].includes(activeToolType);
  const drawToShapeTool = customToolMode === "shape" || ["draw-to-shape", "drawtoshape"].includes(activeToolType);
  const toolMode = liveSelection.length === 0 && (drawingTool || bucketFillTool || drawToShapeTool);
  const activeToolMode = drawingTool ? "draw" : bucketFillTool ? "fill" : drawToShapeTool ? "shape" : null;
  const elementTypes = liveSelection.map((element) => element.type);
  const hasShape = elementTypes.some((type) => SHAPE_TYPES.has(type));
  const hasLine = elementTypes.some((type) => LINE_TYPES.has(type) || type === "freedraw");
  const hasImageSelection = liveSelection.some((element) => element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon));
  const onlyTextSelection = liveSelection.length > 0 && liveSelection.every((element) => element.type === "text");
  const position = useMemo(
    () => getSelectionPosition(apiRef?.current, liveSelection, canvasRootRef?.current, Boolean(openGroup)),
    // canvasRevision refreshes placement as Excalidraw pans/zooms without changing selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiRef, canvasRootRef, canvasRevision, selectedElements, openGroup],
  );
  useEffect(() => {
    if (toolMode && !wasToolModeRef.current) setOpenGroup("stroke");
    wasToolModeRef.current = toolMode;
    if (!toolMode && customToolMode) setCustomToolMode(null);
  }, [toolMode, customToolMode]);
  if (!canEdit || (!liveSelection.length && !toolMode) || !position) return null;

  const currentStroke = (first?.customData?.iconColor || first?.strokeColor || appState.currentItemStrokeColor || "#2f2f33").toLowerCase();
  const currentFill = (first?.backgroundColor || appState.currentItemBackgroundColor || "transparent").toLowerCase();
  const currentStrokeWidth = Number(first?.strokeWidth ?? appState.currentItemStrokeWidth) || 1;
  const currentFontSize = Number(first?.fontSize ?? appState.currentItemFontSize) || 20;
  const currentFontFamily = Number(first?.fontFamily ?? appState.currentItemFontFamily) || DEFAULT_FONT_FAMILY_ID;
  const currentTextAlign = first?.textAlign || appState.currentItemTextAlign || "left";
  const currentOpacity = Number(first?.opacity ?? appState.currentItemOpacity ?? 100);
  // Mirror the default Properties panel: text-only controls are shown only
  // when the active selection consists entirely of text. Shape, connector,
  // image, and mixed selections keep the shared appearance/layer controls, with
  // shape- and line-specific options rendered inside the Stroke popover.
  const visibleGroups = toolMode
    ? GROUPS.filter((group) => group.id === "stroke" || group.id === "opacity")
    : GROUPS.filter((group) => {
      if (group.id === "fontFamily" || group.id === "fontSize" || group.id === "textAlign") {
        return onlyTextSelection;
      }
      return true;
    });
  const applyFormatting = (patch) => {
    if (!toolMode) {
      applyToSelected(patch);
      return;
    }
    const api = apiRef?.current;
    if (!api) return;
    const appStatePatch = {};
    if ("strokeColor" in patch) appStatePatch.currentItemStrokeColor = patch.strokeColor;
    if ("backgroundColor" in patch) appStatePatch.currentItemBackgroundColor = patch.backgroundColor === "transparent" ? "transparent" : patch.backgroundColor;
    if ("strokeWidth" in patch) appStatePatch.currentItemStrokeWidth = patch.strokeWidth;
    if ("fillStyle" in patch) appStatePatch.currentItemFillStyle = patch.fillStyle;
    if ("strokeStyle" in patch) appStatePatch.currentItemStrokeStyle = patch.strokeStyle;
    if ("roughness" in patch) appStatePatch.currentItemRoughness = patch.roughness;
    if ("opacity" in patch) appStatePatch.currentItemOpacity = patch.opacity;
    if ("fontFamily" in patch) appStatePatch.currentItemFontFamily = patch.fontFamily;
    if ("fontSize" in patch) appStatePatch.currentItemFontSize = patch.fontSize;
    if ("textAlign" in patch) appStatePatch.currentItemTextAlign = patch.textAlign;
    if ("roundness" in patch) appStatePatch.currentItemRoundness = patch.roundness;
    if ("startArrowhead" in patch) appStatePatch.currentItemStartArrowhead = patch.startArrowhead;
    if ("endArrowhead" in patch) appStatePatch.currentItemEndArrowhead = patch.endArrowhead;
    if ("pressure" in patch) appStatePatch.currentItemPressure = patch.pressure;
    api.updateScene({ appState: appStatePatch });
  };
  const activeGroup = visibleGroups.some((group) => group.id === openGroup) ? openGroup : null;
  const reorderSelection = (direction) => {
    const api = apiRef?.current;
    if (!api || liveSelection.length === 0) return;
    const scene = api.getSceneElements?.() || [];
    const selectedIds = new Set(liveSelection.map((element) => element.id));
    const isSelectedLive = (element) => element && !element.isDeleted && !element.deleted && selectedIds.has(element.id);
    const moving = scene.filter(isSelectedLive);
    if (!moving.length) return;
    const remaining = scene.filter((element) => !isSelectedLive(element));
    api.updateScene({ elements: direction === "back" ? [...moving, ...remaining] : [...remaining, ...moving] });
  };

  const renderGroupContent = (groupId) => {
    if (groupId === "stroke") return (
      <>
        <div className="format-option-section">
          <div className="format-option-label">{onlyTextSelection ? "Text color" : "Stroke color"}</div>
          <div className="format-option-row">
            {STROKE_COLORS.map(([color, label]) => <Swatch key={color} color={color} label={label} selected={currentStroke === color} onClick={() => applyFormatting({ strokeColor: color })} />)}
            <label
              className="format-custom-color"
              title="Choose custom color"
              aria-label="Choose custom color"
              style={{ "--custom-color-value": /^#[0-9a-f]{6}$/i.test(currentStroke || "") ? currentStroke : "#7c3aed" }}
            >
              <span className="format-custom-color-icon" aria-hidden="true">✎</span>
              <input type="color" aria-label="Choose custom color" value={/^#[0-9a-f]{6}$/i.test(currentStroke || "") ? currentStroke : "#7c3aed"} onChange={(event) => applyFormatting({ strokeColor: event.target.value })} />
            </label>
          </div>
        </div>
        {!onlyTextSelection && !hasImageSelection && (
          <div className="format-option-section">
            <div className="format-option-label">Background</div>
            <div className="format-option-row">
              {FILL_COLORS.map(([color, label]) => <Swatch key={color} color={color} label={label} selected={currentFill === color} fill onClick={() => applyFormatting({ backgroundColor: color })} />)}
              <label
                className="format-custom-color format-custom-fill-color"
                title="Choose custom background color"
                aria-label="Choose custom background color"
                style={{ "--custom-color-value": /^#[0-9a-f]{6}$/i.test(currentFill || "") ? currentFill : "#e7bfc1" }}
              >
                <span className="format-custom-color-icon" aria-hidden="true">✎</span>
                <input
                  type="color"
                  aria-label="Choose custom background color"
                  value={/^#[0-9a-f]{6}$/i.test(currentFill || "") ? currentFill : "#e7bfc1"}
                  onChange={(event) => applyFormatting({ backgroundColor: event.target.value })}
                />
              </label>
            </div>
          </div>
        )}
        {!onlyTextSelection && !hasImageSelection && (first?.type === "rectangle" || first?.type === "diamond" || first?.type === "line") && (
          <div className="format-option-section">
            <div className="format-option-label">Edges</div>
            <div className="format-option-row">
              <button
                type="button"
                className={`format-option-button format-edge-button${!first?.roundness ? " is-selected" : ""}`}
                aria-label="Square edges"
                aria-pressed={!first?.roundness}
                title="Square edges"
                onClick={() => applyFormatting({ roundness: null })}
              ><span className="format-edge-square" aria-hidden="true" /></button>
              <button
                type="button"
                className={`format-option-button format-edge-button${first?.roundness ? " is-selected" : ""}`}
                aria-label="Rounded edges"
                aria-pressed={Boolean(first?.roundness)}
                title="Rounded edges"
                onClick={() => applyFormatting({ roundness: { type: 3 } })}
              ><span className="format-edge-rounded" aria-hidden="true" /></button>
            </div>
          </div>
        )}
        {(toolMode || (!onlyTextSelection && !hasImageSelection && (hasLine || hasShape))) && (
          <div className="format-option-section">
            <div className="format-option-label">Stroke width</div>
            <div className="format-option-row">
              {[1, 2, 4].map((width) => <button key={width} type="button" className={`format-option-button${currentStrokeWidth === width ? " is-selected" : ""}`} aria-pressed={currentStrokeWidth === width} onClick={() => applyFormatting({ strokeWidth: width })}>{width}</button>)}
            </div>
            {(hasShape || activeToolMode === "shape") && <>
              <div className="format-option-label format-sub-label">Fill style</div>
              <div className="format-option-row">{FILL_STYLES.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${first?.fillStyle === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={first?.fillStyle === value} onClick={() => applyFormatting({ fillStyle: value })}>{glyph}</button>)}</div>
            </>}
            {!toolMode && <>
            <div className="format-option-label format-sub-label">Line style</div>
            <div className="format-option-row">{STROKE_STYLES.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${first?.strokeStyle === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={first?.strokeStyle === value} onClick={() => applyFormatting({ strokeStyle: value })}>{glyph}</button>)}</div>
            <div className="format-option-label format-sub-label">Roughness</div>
            <div className="format-option-row">{ROUGHNESS.map(([value, label]) => <button key={value} type="button" className={`format-option-button${Number(first?.roughness ?? 1) === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={Number(first?.roughness ?? 1) === value} onClick={() => applyFormatting({ roughness: value })}>{label}</button>)}</div>
            {first?.type === "arrow" && (
              <>
                <div className="format-option-label format-sub-label">Arrow type</div>
                <div className="format-option-row">
                  <button type="button" className={`format-option-button${!first?.elbowed && (first?.points?.length || 0) <= 2 ? " is-selected" : ""}`} aria-label="Straight arrow" aria-pressed={!first?.elbowed && (first?.points?.length || 0) <= 2} title="Straight arrow" onClick={() => applyFormatting(straightArrowPatch(first))}>↗</button>
                  <button type="button" className={`format-option-button${!first?.elbowed && (first?.points?.length || 0) > 2 ? " is-selected" : ""}`} aria-label="Curved arrow" aria-pressed={!first?.elbowed && (first?.points?.length || 0) > 2} title="Curved arrow" onClick={() => applyFormatting(curvedArrowPatch(first))}>⌒</button>
                  <button type="button" className={`format-option-button${first?.elbowed ? " is-selected" : ""}`} aria-label="Elbow arrow" aria-pressed={Boolean(first?.elbowed)} title="Elbow arrow" onClick={() => applyFormatting({ elbowed: true })}>⌞</button>
                </div>
                <div className="format-option-label format-sub-label">Arrowheads</div>
                <div className="format-option-row format-arrowhead-row">
                  <label className="format-arrowhead-control">
                    <span>Start</span>
                    <select aria-label="Start arrowhead" value={first?.startArrowhead || "none"} onChange={(event) => applyFormatting({ startArrowhead: event.target.value === "none" ? null : event.target.value })}>
                      <option value="none">None</option>
                      <option value="arrow">Arrow</option>
                      <option value="bar">Bar</option>
                      <option value="dot">Dot</option>
                    </select>
                  </label>
                  <label className="format-arrowhead-control">
                    <span>End</span>
                    <select aria-label="End arrowhead" value={first?.endArrowhead || "none"} onChange={(event) => applyFormatting({ endArrowhead: event.target.value === "none" ? null : event.target.value })}>
                      <option value="none">None</option>
                      <option value="arrow">Arrow</option>
                      <option value="bar">Bar</option>
                      <option value="dot">Dot</option>
                    </select>
                  </label>
                </div>
              </>
            )}
            </>}
          </div>
        )}
        {drawingTool && <div className="format-option-section">
          <div className="format-option-label">Pressure</div>
          <div className="format-option-row">
            <button type="button" className={`format-option-button${appState.currentItemPressure !== false ? " is-selected" : ""}`} aria-label="Pressure enabled" aria-pressed={appState.currentItemPressure !== false} title="Use pressure-sensitive stroke" onClick={() => applyFormatting({ pressure: true })}>〰</button>
            <button type="button" className={`format-option-button${appState.currentItemPressure === false ? " is-selected" : ""}`} aria-label="Pressure disabled" aria-pressed={appState.currentItemPressure === false} title="Use consistent stroke width" onClick={() => applyFormatting({ pressure: false })}>〰</button>
          </div>
        </div>}
      </>
    );
    if (groupId === "fontFamily") return (
      <div className="format-option-section">
        <div className="format-option-label">Font family</div>
        <div className="format-option-row format-font-families">
          {FONT_FAMILIES.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${currentFontFamily === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentFontFamily === value} title={label} onClick={() => applyFormatting({ fontFamily: value })}>{glyph}</button>)}
        </div>
      </div>
    );
    if (groupId === "fontSize") return (
      <div className="format-option-section">
        <div className="format-option-label">Font size</div>
        <div className="format-option-row">
          {FONT_SIZES.map(([value, label]) => <button key={value} type="button" className={`format-option-button format-size-button${currentFontSize === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentFontSize === value} onClick={() => applyFormatting({ fontSize: value })}>{label}</button>)}
        </div>
        <div className="format-option-row format-custom-size">
          <button type="button" className="format-option-button" aria-label="Decrease text size" onClick={() => applyFormatting({ fontSize: Math.max(8, currentFontSize - 2) })}>A−</button>
          <span>{currentFontSize}</span>
          <button type="button" className="format-option-button" aria-label="Increase text size" onClick={() => applyFormatting({ fontSize: Math.min(96, currentFontSize + 2) })}>A+</button>
        </div>
      </div>
    );
    if (groupId === "textAlign") return (
      <div className="format-option-section">
        <div className="format-option-label">Text alignment</div>
        <div className="format-option-row">
          {TEXT_ALIGNMENTS.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${currentTextAlign === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentTextAlign === value} onClick={() => applyFormatting({ textAlign: value })}>{glyph}</button>)}
        </div>
      </div>
    );
    if (groupId === "opacity") return (
      <div className="format-option-section">
        <div className="format-option-label">Opacity</div>
        <div className="format-opacity-control">
          <input type="range" aria-label="Opacity" min="0" max="100" step="1" value={currentOpacity} onChange={(event) => applyFormatting({ opacity: Number(event.target.value) })} />
          <span>{currentOpacity}</span>
        </div>
      </div>
    );
    if (groupId === "layers") return (
      <div className="format-option-section">
        <div className="format-option-label">Layer order</div>
        <div className="format-option-row">
          <button type="button" className="format-option-button" aria-label="Send selection to back" title="Send to back" onClick={() => reorderSelection("back")}>⇊</button>
          <button type="button" className="format-option-button" aria-label="Send selection backward" title="Send backward" onClick={() => reorderSelection("back")}>↓</button>
          <button type="button" className="format-option-button" aria-label="Bring selection forward" title="Bring forward" onClick={() => reorderSelection("front")}>↑</button>
          <button type="button" className="format-option-button" aria-label="Bring selection to front" title="Bring to front" onClick={() => reorderSelection("front")}>⇈</button>
        </div>
        <button type="button" className="format-more-properties" onClick={onOpenProperties}>Open Properties panel</button>
      </div>
    );
    return null;
  };

  return (
    <div
      ref={toolbarRef}
      className={`contextual-formatting-toolbar${toolMode ? " is-tool-mode" : ""}`}
      role="toolbar"
      aria-label={toolMode ? "Drawing tool formatting" : "Selected object formatting"}
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="format-icon-rail" role="group" aria-label="Formatting options">
        {visibleGroups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`format-icon-button${activeGroup === group.id ? " is-active" : ""}`}
            aria-label={group.label}
            aria-expanded={activeGroup === group.id}
            aria-pressed={activeGroup === group.id}
            title={group.label}
            onClick={() => setOpenGroup((current) => current === group.id ? null : group.id)}
          >{group.icon}</button>
        ))}
      </div>
      {activeGroup && (
        <div className={`format-options-popover side-${position["--format-popover-side"]}`} role="dialog" aria-label={`${visibleGroups.find((group) => group.id === activeGroup)?.label} options`}>
          <div className="format-popover-header">
            <strong>{visibleGroups.find((group) => group.id === activeGroup)?.label}</strong>
            <button type="button" className="format-popover-close" aria-label="Close formatting options" onClick={() => setOpenGroup(null)}>×</button>
          </div>
          {activeGroup === "stroke" && bucketFillTool
            ? <div className="format-option-section">
                <div className="format-option-label">Background</div>
                <div className="format-option-row">
                  {FILL_COLORS.map(([color, label]) => <Swatch key={color} color={color} label={label} selected={currentFill === color} fill onClick={() => applyFormatting({ backgroundColor: color })} />)}
                  <label className="format-custom-color format-custom-fill-color" title="Choose custom background color" aria-label="Choose custom background color">
                    <span className="format-custom-color-icon" aria-hidden="true">✎</span>
                    <input type="color" aria-label="Choose custom background color" value={/^#[0-9a-f]{6}$/i.test(currentFill) ? currentFill : "#e7bfc1"} onChange={(event) => applyFormatting({ backgroundColor: event.target.value })} />
                  </label>
                </div>
              </div>
            : renderGroupContent(activeGroup)}
        </div>
      )}
    </div>
  );
}
