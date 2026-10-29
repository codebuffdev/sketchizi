import { useMemo } from "react";
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
  const panelWidth = Math.min(224, rootWidth - 16);
  const selectionLeft = (sceneBounds.left + (Number(appState.scrollX) || 0)) * zoom + viewportWidth / 2;
  const selectionRight = (sceneBounds.right + (Number(appState.scrollX) || 0)) * zoom + viewportWidth / 2;
  const rightCandidate = selectionRight + 12;
  const leftCandidate = selectionLeft - panelWidth - 12;
  const left = rightCandidate + panelWidth <= rootWidth - 8
    ? rightCandidate
    : leftCandidate >= 8
      ? leftCandidate
      : Math.max(8, Math.min(rootWidth - panelWidth - 8, centerX - panelWidth / 2));
  const panelHeight = Math.min(360, rootHeight - 16);
  const top = Math.max(8, Math.min(rootHeight - panelHeight - 8, topY - 8));
  return { left: `${left}px`, top: `${top}px` };
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
  const liveSelection = selectedElements.filter((element) => element && !element.isDeleted);
  const first = liveSelection[0];
  const elementTypes = liveSelection.map((element) => element.type);
  const hasText = elementTypes.includes("text");
  const hasShape = elementTypes.some((type) => SHAPE_TYPES.has(type));
  const hasLine = elementTypes.some((type) => LINE_TYPES.has(type) || type === "freedraw");
  const hasImageSelection = liveSelection.some((element) => element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon));
  const onlyTextSelection = liveSelection.every((element) => element.type === "text");
  const position = useMemo(
    () => getSelectionPosition(apiRef?.current, liveSelection, canvasRootRef?.current),
    // canvasRevision refreshes placement as Excalidraw pans/zooms without changing selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiRef, canvasRootRef, canvasRevision, selectedElements],
  );
  if (!canEdit || liveSelection.length === 0 || !position) return null;

  const currentStroke = (first?.customData?.iconColor || first?.strokeColor)?.toLowerCase();
  const currentFill = first?.backgroundColor?.toLowerCase() || "transparent";
  const currentStrokeWidth = Number(first?.strokeWidth) || 1;
  const currentFontSize = Number(first?.fontSize) || 20;
  const currentFontFamily = Number(first?.fontFamily) || DEFAULT_FONT_FAMILY_ID;
  const currentTextAlign = first?.textAlign || "left";
  const currentOpacity = Number(first?.opacity ?? 100);
  const visibleGroups = GROUPS.filter((group) => {
    if (group.id === "fontFamily" || group.id === "fontSize" || group.id === "textAlign") return hasText;
    return true;
  });
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
          <div className="format-option-row">
            {STROKE_COLORS.map(([color, label]) => <Swatch key={color} color={color} label={label} selected={currentStroke === color} onClick={() => applyToSelected({ strokeColor: color })} />)}
            <label className="format-custom-color" title="Choose custom color">
              <input type="color" aria-label="Choose custom color" value={/^#[0-9a-f]{6}$/i.test(currentStroke || "") ? currentStroke : "#7c3aed"} onChange={(event) => applyToSelected({ strokeColor: event.target.value })} />
            </label>
          </div>
        </div>
        {!onlyTextSelection && !hasImageSelection && hasShape && (
          <div className="format-option-section">
            <div className="format-option-label">Background</div>
            <div className="format-option-row">
              {FILL_COLORS.map(([color, label]) => <Swatch key={color} color={color} label={label} selected={currentFill === color} fill onClick={() => applyToSelected({ backgroundColor: color })} />)}
            </div>
          </div>
        )}
        {!onlyTextSelection && !hasImageSelection && hasLine && (
          <div className="format-option-section">
            <div className="format-option-label">Stroke width</div>
            <div className="format-option-row">
              {[1, 2, 4].map((width) => <button key={width} type="button" className={`format-option-button${currentStrokeWidth === width ? " is-selected" : ""}`} aria-pressed={currentStrokeWidth === width} onClick={() => applyToSelected({ strokeWidth: width })}>{width}</button>)}
            </div>
            {hasShape && <>
              <div className="format-option-label format-sub-label">Fill style</div>
              <div className="format-option-row">{FILL_STYLES.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${first?.fillStyle === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={first?.fillStyle === value} onClick={() => applyToSelected({ fillStyle: value })}>{glyph}</button>)}</div>
            </>}
            <div className="format-option-label format-sub-label">Line style</div>
            <div className="format-option-row">{STROKE_STYLES.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${first?.strokeStyle === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={first?.strokeStyle === value} onClick={() => applyToSelected({ strokeStyle: value })}>{glyph}</button>)}</div>
            <div className="format-option-label format-sub-label">Roughness</div>
            <div className="format-option-row">{ROUGHNESS.map(([value, label]) => <button key={value} type="button" className={`format-option-button${Number(first?.roughness ?? 1) === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={Number(first?.roughness ?? 1) === value} onClick={() => applyToSelected({ roughness: value })}>{label}</button>)}</div>
          </div>
        )}
      </>
    );
    if (groupId === "fontFamily") return (
      <div className="format-option-section">
        <div className="format-option-row format-font-families">
          {FONT_FAMILIES.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${currentFontFamily === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentFontFamily === value} title={label} onClick={() => applyToSelected({ fontFamily: value })}>{glyph}</button>)}
        </div>
      </div>
    );
    if (groupId === "fontSize") return (
      <div className="format-option-section">
        <div className="format-option-row">
          {FONT_SIZES.map(([value, label]) => <button key={value} type="button" className={`format-option-button format-size-button${currentFontSize === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentFontSize === value} onClick={() => applyToSelected({ fontSize: value })}>{label}</button>)}
        </div>
        <div className="format-option-row format-custom-size">
          <button type="button" className="format-option-button" aria-label="Decrease text size" onClick={() => applyToSelected({ fontSize: Math.max(8, currentFontSize - 2) })}>A−</button>
          <span>{currentFontSize}</span>
          <button type="button" className="format-option-button" aria-label="Increase text size" onClick={() => applyToSelected({ fontSize: Math.min(96, currentFontSize + 2) })}>A+</button>
        </div>
      </div>
    );
    if (groupId === "textAlign") return (
      <div className="format-option-section">
        <div className="format-option-row">
          {TEXT_ALIGNMENTS.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${currentTextAlign === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentTextAlign === value} onClick={() => applyToSelected({ textAlign: value })}>{glyph}</button>)}
        </div>
      </div>
    );
    if (groupId === "opacity") return (
      <div className="format-option-section">
        <div className="format-opacity-control">
          <input type="range" aria-label="Opacity" min="0" max="100" step="1" value={currentOpacity} onChange={(event) => applyToSelected({ opacity: Number(event.target.value) })} />
          <span>{currentOpacity}</span>
        </div>
      </div>
    );
    if (groupId === "layers") return (
      <div className="format-option-section">
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
      className="contextual-formatting-toolbar formatting-panel"
      role="toolbar"
      aria-label="Selected object formatting"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="formatting-panel-content">
        {visibleGroups.map((group) => (
          <section className={`formatting-panel-group group-${group.id}`} key={group.id} aria-label={group.label}>
            <div className="formatting-panel-group-title">{group.label}</div>
            {renderGroupContent(group.id)}
          </section>
        ))}
      </div>
    </div>
  );
}
