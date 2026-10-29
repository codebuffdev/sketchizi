import { useMemo } from "react";

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
const FONT_FAMILIES = [[1, "Hand-drawn"], [2, "Sans"], [3, "Code"], [5, "Excalifont"], [6, "Nunito"], [7, "Lilita"], [8, "Comic"], [9, "Liberation"]];
const FONT_SIZES = [[12, "XS"], [16, "S"], [20, "M"], [28, "L"], [36, "XL"]];
const TEXT_ALIGNMENTS = [["left", "Left"], ["center", "Center"], ["right", "Right"]];

function getSelectionPosition(api, elements, root) {
  if (!api || !root || !elements.length) return null;
  const appState = api.getAppState?.();
  if (!appState) return null;
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
  const viewportWidth = Number(appState.width) || root.clientWidth;
  const viewportHeight = Number(appState.height) || root.clientHeight;
  const centerX = ((sceneBounds.left + sceneBounds.right) / 2 + (Number(appState.scrollX) || 0)) * zoom + viewportWidth / 2;
  const topY = (sceneBounds.top + (Number(appState.scrollY) || 0)) * zoom + viewportHeight / 2;
  const bottomY = (sceneBounds.bottom + (Number(appState.scrollY) || 0)) * zoom + viewportHeight / 2;
  const rootWidth = root.clientWidth || viewportWidth;
  const rootHeight = root.clientHeight || viewportHeight;
  const preferredWidth = Math.max(1, Math.min(520, rootWidth - 16));
  const left = Math.max(8, Math.min(rootWidth - preferredWidth - 8, centerX - preferredWidth / 2));
  // Reserve space for Excalidraw's bottom controls and the compact dock.
  // Prefer below the selection, but flip above it before the toolbar reaches
  // the dock/scroll-back area. Clamp the final position to the usable canvas.
  const toolbarHeight = 42;
  const bottomDockClearance = 88;
  const usableBottom = Math.max(8, rootHeight - bottomDockClearance);
  const belowTop = bottomY + 10;
  const aboveTop = topY - toolbarHeight - 10;
  const top = belowTop + toolbarHeight <= usableBottom
    ? belowTop
    : Math.max(8, aboveTop);
  return {
    left: `${left}px`,
    top: `${Math.max(8, Math.min(usableBottom - toolbarHeight, top))}px`,
  };
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
  const liveSelection = selectedElements.filter((element) => element && !element.isDeleted);
  const first = liveSelection[0];
  const elementTypes = liveSelection.map((element) => element.type);
  const showFill = elementTypes.some((type) => SHAPE_TYPES.has(type));
  const showStrokeWidth = elementTypes.some((type) => LINE_TYPES.has(type));
  const showTextSize = elementTypes.includes("text");
  const position = useMemo(
    () => getSelectionPosition(apiRef?.current, liveSelection, canvasRootRef?.current),
    // canvasRevision refreshes placement as Excalidraw pans/zooms without changing selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiRef, canvasRootRef, canvasRevision, selectedElements],
  );

  // Keep the primary contextual toolbar visible; More opens the secondary Properties panel.
  if (!canEdit || liveSelection.length === 0 || !position) return null;

  const hasImageSelection = liveSelection.some((element) => element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon));
  const onlyTextSelection = liveSelection.every((element) => element.type === "text");
  const currentStroke = (first?.customData?.iconColor || first?.strokeColor)?.toLowerCase();
  const currentFill = first?.backgroundColor?.toLowerCase() || "transparent";
  const currentStrokeWidth = Number(first?.strokeWidth) || 1;
  const currentFontSize = Number(first?.fontSize) || 20;
  const currentFontFamily = Number(first?.fontFamily) || 5;
  const currentTextAlign = first?.textAlign || "left";
  const currentOpacity = Number(first?.opacity ?? 100);
  const reorderSelection = (direction) => {
    const api = apiRef?.current;
    if (!api || liveSelection.length === 0) return;
    const scene = api.getSceneElements?.() || [];
    const selectedIds = new Set(liveSelection.map((element) => element.id));
    const isSelectedLive = (element) => element && !element.isDeleted && !element.deleted && selectedIds.has(element.id);
    const moving = scene.filter(isSelectedLive);
    if (!moving.length) return;
    const remaining = scene.filter((element) => !isSelectedLive(element));
    const nextElements = direction === "back" ? [...moving, ...remaining] : [...remaining, ...moving];
    api.updateScene({ elements: nextElements });
  };
  const showShapeStyle = liveSelection.some((element) => SHAPE_TYPES.has(element.type) || element.type === "line" || element.type === "arrow" || element.type === "freedraw");

  return (
    <div
      className="contextual-formatting-toolbar"
      role="toolbar"
      aria-label="Selected object formatting"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {onlyTextSelection && <div className="contextual-formatting-group" role="group" aria-label="Text color">
        {STROKE_COLORS.map(([color, label]) => (
          <button
            key={color}
            type="button"
            className={`contextual-color-swatch${currentStroke === color ? " is-selected" : ""}`}
            style={{ "--swatch-color": color }}
            aria-label={`Text color ${label}`}
            aria-pressed={currentStroke === color}
            title={`Text color: ${label}`}
            onClick={() => applyToSelected({ strokeColor: color })}
          />
        ))}
      </div>}



      {!hasImageSelection && !onlyTextSelection && <div className="contextual-formatting-group" role="group" aria-label="Stroke color">
        {STROKE_COLORS.map(([color, label]) => (
          <button
            key={color}
            type="button"
            className={`contextual-color-swatch${currentStroke === color ? " is-selected" : ""}`}
            style={{ "--swatch-color": color }}
            aria-label={`Stroke ${label}`}
            aria-pressed={currentStroke === color}
            title={`Stroke: ${label}`}
            onClick={() => applyToSelected({ strokeColor: color })}
          />
        ))}
      </div>}

      <div className="contextual-formatting-group contextual-custom-color-group" role="group" aria-label="Custom color">
        <label className="contextual-custom-color" title="Choose custom color">
          <span aria-hidden="true">+</span>
          <input
            type="color"
            aria-label="Choose custom color"
            value={/^#[0-9a-f]{6}$/i.test(currentStroke || "") ? currentStroke : "#7c3aed"}
            onChange={(event) => applyToSelected({ strokeColor: event.target.value })}
          />
        </label>
      </div>

      {showFill && !hasImageSelection && (
        <div className="contextual-formatting-group" role="group" aria-label="Fill color">
          {FILL_COLORS.map(([color, label]) => (
            <button
              key={color}
              type="button"
              className={`contextual-color-swatch contextual-fill-swatch${currentFill === color ? " is-selected" : ""}${color === "transparent" ? " is-transparent" : ""}`}
              style={color === "transparent" ? undefined : { "--swatch-color": color }}
              aria-label={label}
              aria-pressed={currentFill === color}
              title={label}
              onClick={() => applyToSelected({ backgroundColor: color })}
            >
              {color === "transparent" ? <span aria-hidden="true">×</span> : null}
            </button>
          ))}
        </div>
      )}

      {showStrokeWidth && !hasImageSelection && (
        <div className="contextual-formatting-group contextual-line-width" role="group" aria-label="Stroke width">
          {[1, 2, 4].map((width) => (
            <button
              key={width}
              type="button"
              className={`contextual-width-button${currentStrokeWidth === width ? " is-selected" : ""}`}
              aria-label={`Stroke width ${width}`}
              aria-pressed={currentStrokeWidth === width}
              title={`Stroke width: ${width}`}
              onClick={() => applyToSelected({ strokeWidth: width })}
            ><span style={{ height: `${Math.min(width + 1, 5)}px` }} /></button>
          ))}
        </div>
      )}

      {showTextSize && (
        <div className="contextual-formatting-group contextual-font-family" role="group" aria-label="Font family">
          {FONT_FAMILIES.map(([value, label]) => (
            <button key={value} type="button" className={currentFontFamily === value ? "is-selected" : ""} aria-label={label} aria-pressed={currentFontFamily === value} title={label} onClick={() => applyToSelected({ fontFamily: value })}>{label === "Hand-drawn" ? "✎" : label === "Code" ? "</>" : label.slice(0, 1)}</button>
          ))}
        </div>
      )}

      {showTextSize && (
        <div className="contextual-formatting-group contextual-font-presets" role="group" aria-label="Font size">
          {FONT_SIZES.map(([value, label]) => (
            <button key={value} type="button" className={currentFontSize === value ? "is-selected" : ""} aria-label={label} aria-pressed={currentFontSize === value} title={label} onClick={() => applyToSelected({ fontSize: value })}>{label}</button>
          ))}
        </div>
      )}

      {showTextSize && (
        <div className="contextual-formatting-group contextual-text-align" role="group" aria-label="Text align">
          {TEXT_ALIGNMENTS.map(([value, label]) => (
            <button key={value} type="button" className={currentTextAlign === value ? "is-selected" : ""} aria-label={label} aria-pressed={currentTextAlign === value} title={label} onClick={() => applyToSelected({ textAlign: value })}>{value === "left" ? "≡" : value === "center" ? "☰" : "≡"}</button>
          ))}
        </div>
      )}

      {showTextSize && (
        <div className="contextual-formatting-group contextual-text-size" role="group" aria-label="Text size">
          <button type="button" aria-label="Decrease text size" title="Decrease text size" onClick={() => applyToSelected({ fontSize: Math.max(8, currentFontSize - 2) })}>A−</button>
          <span aria-label={`Font size ${currentFontSize}`}>{currentFontSize}</span>
          <button type="button" aria-label="Increase text size" title="Increase text size" onClick={() => applyToSelected({ fontSize: Math.min(96, currentFontSize + 2) })}>A+</button>
        </div>
      )}

      {!hasImageSelection && (
        <div className="contextual-formatting-group contextual-opacity" role="group" aria-label="Opacity">
          <label title="Opacity"><span>Opacity</span><input aria-label="Opacity" type="range" min="0" max="100" step="1" value={currentOpacity} onChange={(event) => applyToSelected({ opacity: Number(event.target.value) })}/><span>{currentOpacity}</span></label>
        </div>
      )}

      {showShapeStyle && !hasImageSelection && (
        <>
          {showFill && <div className="contextual-formatting-group" role="group" aria-label="Fill style">
            {FILL_STYLES.map(([value, label, glyph]) => <button key={value} type="button" className={first?.fillStyle === value ? "is-selected" : ""} aria-label={label} aria-pressed={first?.fillStyle === value} title={label} onClick={() => applyToSelected({ fillStyle: value })}>{glyph}</button>)}
          </div>}
          <div className="contextual-formatting-group" role="group" aria-label="Line style">
            {STROKE_STYLES.map(([value, label, glyph]) => <button key={value} type="button" className={first?.strokeStyle === value ? "is-selected" : ""} aria-label={label} aria-pressed={first?.strokeStyle === value} title={label} onClick={() => applyToSelected({ strokeStyle: value })}>{glyph}</button>)}
          </div>
          <div className="contextual-formatting-group" role="group" aria-label="Roughness">
            {ROUGHNESS.map(([value, label]) => <button key={value} type="button" className={Number(first?.roughness ?? 1) === value ? "is-selected" : ""} aria-label={label} aria-pressed={Number(first?.roughness ?? 1) === value} title={label} onClick={() => applyToSelected({ roughness: value })}>{label.slice(0, 1)}</button>)}
          </div>
          <div className="contextual-formatting-group contextual-opacity" role="group" aria-label="Opacity">
            <label title="Opacity"><span>O</span><input aria-label="Opacity" type="range" min="0" max="100" step="1" value={currentOpacity} onChange={(event) => applyToSelected({ opacity: Number(event.target.value) })}/><span>{currentOpacity}</span></label>
          </div>
        </>
      )}

      <div className="contextual-formatting-group contextual-layer-actions" role="group" aria-label="Layer order">
        <button type="button" aria-label="Send selection to back" title="Send to back" onClick={() => reorderSelection("back")}>⇊</button>
        <button type="button" aria-label="Send selection backward" title="Send backward" onClick={() => reorderSelection("back")}>↓</button>
        <button type="button" aria-label="Bring selection forward" title="Bring forward" onClick={() => reorderSelection("front")}>↑</button>
        <button type="button" aria-label="Bring selection to front" title="Bring to front" onClick={() => reorderSelection("front")}>⇈</button>
      </div>

      <div className="contextual-formatting-group contextual-properties-action">
        <button type="button" className="contextual-properties-button" onClick={onOpenProperties} title="More formatting options" aria-label="More formatting options">
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 5h14M3 10h14M3 15h14" />
            <circle cx="7" cy="5" r="2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="10" r="2" fill="currentColor" stroke="none" />
            <circle cx="8" cy="15" r="2" fill="currentColor" stroke="none" />
          </svg>
          <span>More</span>
        </button>
      </div>
    </div>
  );
}
