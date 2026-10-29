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
  const selectionLeft = (sceneBounds.left + scrollX) * scaleX + rootWidth / 2;
  const selectionRight = (sceneBounds.right + scrollX) * scaleX + rootWidth / 2;
  const selectionTop = (sceneBounds.top + scrollY) * scaleY + rootHeight / 2;
  const selectionBottom = (sceneBounds.bottom + scrollY) * scaleY + rootHeight / 2;

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
  const toolbarRef = useRef(null);
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
  const elementTypes = liveSelection.map((element) => element.type);
  const hasShape = elementTypes.some((type) => SHAPE_TYPES.has(type));
  const hasLine = elementTypes.some((type) => LINE_TYPES.has(type) || type === "freedraw");
  const hasImageSelection = liveSelection.some((element) => element.type === "image" && (element.customData?.iconId || element.customData?.diagramIcon));
  const onlyTextSelection = liveSelection.every((element) => element.type === "text");
  const position = useMemo(
    () => getSelectionPosition(apiRef?.current, liveSelection, canvasRootRef?.current, Boolean(openGroup)),
    // canvasRevision refreshes placement as Excalidraw pans/zooms without changing selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiRef, canvasRootRef, canvasRevision, selectedElements, openGroup],
  );
  if (!canEdit || liveSelection.length === 0 || !position) return null;

  const currentStroke = (first?.customData?.iconColor || first?.strokeColor)?.toLowerCase();
  const currentFill = first?.backgroundColor?.toLowerCase() || "transparent";
  const currentStrokeWidth = Number(first?.strokeWidth) || 1;
  const currentFontSize = Number(first?.fontSize) || 20;
  const currentFontFamily = Number(first?.fontFamily) || DEFAULT_FONT_FAMILY_ID;
  const currentTextAlign = first?.textAlign || "left";
  const currentOpacity = Number(first?.opacity ?? 100);
  // Keep every formatting category available for every selected element type.
  // Some categories (font controls in particular) are most useful for text, but
  // their popovers should still open consistently rather than disappearing when
  // a shape, connector, image, or mixed selection is active.
  const visibleGroups = GROUPS;
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
            {STROKE_COLORS.map(([color, label]) => <Swatch key={color} color={color} label={label} selected={currentStroke === color} onClick={() => applyToSelected({ strokeColor: color })} />)}
            <label
              className="format-custom-color"
              title="Choose custom color"
              aria-label="Choose custom color"
              style={{ "--custom-color-value": /^#[0-9a-f]{6}$/i.test(currentStroke || "") ? currentStroke : "#7c3aed" }}
            >
              <span className="format-custom-color-icon" aria-hidden="true">✎</span>
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
        <div className="format-option-label">Font family</div>
        <div className="format-option-row format-font-families">
          {FONT_FAMILIES.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${currentFontFamily === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentFontFamily === value} title={label} onClick={() => applyToSelected({ fontFamily: value })}>{glyph}</button>)}
        </div>
      </div>
    );
    if (groupId === "fontSize") return (
      <div className="format-option-section">
        <div className="format-option-label">Font size</div>
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
        <div className="format-option-label">Text alignment</div>
        <div className="format-option-row">
          {TEXT_ALIGNMENTS.map(([value, label, glyph]) => <button key={value} type="button" className={`format-option-button${currentTextAlign === value ? " is-selected" : ""}`} aria-label={label} aria-pressed={currentTextAlign === value} onClick={() => applyToSelected({ textAlign: value })}>{glyph}</button>)}
        </div>
      </div>
    );
    if (groupId === "opacity") return (
      <div className="format-option-section">
        <div className="format-option-label">Opacity</div>
        <div className="format-opacity-control">
          <input type="range" aria-label="Opacity" min="0" max="100" step="1" value={currentOpacity} onChange={(event) => applyToSelected({ opacity: Number(event.target.value) })} />
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
      className="contextual-formatting-toolbar"
      role="toolbar"
      aria-label="Selected object formatting"
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
          {renderGroupContent(activeGroup)}
        </div>
      )}
    </div>
  );
}
