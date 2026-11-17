import { useEffect, useMemo, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

const COLORS = ["#1e1e1e", "#6b7280", "#d94848", "#d97706", "#2f855a", "#2875b8", "#ffffff"];
const WIDTHS = [1, 2, 4, 6];
const LINE_STYLES = [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]];
const FILL_STYLES = [["solid", "Solid"], ["hachure", "Hachure"], ["cross-hatch", "Cross hatch"]];
const FONT_FAMILIES = [[1, "Hand"], [2, "Sans"], [3, "Code"], [9, "Serif"]];

function ToolButton({ active, title, onClick, children }) {
  return <button type="button" className={`sk-tool-option-button${active ? " is-active" : ""}`} title={title} aria-label={title} aria-pressed={Boolean(active)} onClick={onClick}>{children}</button>;
}

function ColorPicker({ label, value, onChange, transparent = false }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#ffffff";
  return (
    <label className="sk-tool-color-control" title={label}>
      <span className="sk-tool-color-swatch" style={{ background: transparent ? "transparent" : safeValue }} aria-hidden="true">{transparent ? "∅" : null}</span>
      <input type="color" aria-label={label} value={safeValue} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DockGroup({ label, children }) {
  return <div className="sk-tool-dock-group" role="group" aria-label={label}>{children}</div>;
}

export default function ToolOptionsDock({ apiRef, selectedElements = [], canvasRevision, canEdit = true }) {
  const [customTool, setCustomTool] = useState(null);
  useEffect(() => {
    const handleCustomTool = (event) => {
      const tool = String(event.detail?.tool || "").toLowerCase();
      if (["bucketfill", "autoshape", "note", "sticky-note", "stickynote", "notes"].includes(tool)) setCustomTool(tool);
    };
    const clearCustomTool = (event) => {
      if (event.target?.closest?.(".App-toolbar button, .App-toolbar [role='button']")) setCustomTool(null);
    };
    window.addEventListener("sketchizi:activate-tool", handleCustomTool);
    window.addEventListener("click", clearCustomTool, true);
    return () => {
      window.removeEventListener("sketchizi:activate-tool", handleCustomTool);
      window.removeEventListener("click", clearCustomTool, true);
    };
  }, []);

  const appState = apiRef?.current?.getAppState?.() || {};
  const selected = selectedElements.filter((element) => element && !element.isDeleted && !element.deleted);
  const activeTool = String(appState.activeTool?.type || "selection").toLowerCase();
  const selectionType = selected.length ? selected[0].type : null;
  const tool = customTool === "bucketfill" ? "bucket-fill"
    : customTool === "autoshape" ? "draw-to-shape"
      : ["note", "sticky-note", "stickynote", "notes"].includes(customTool) ? "text"
        : activeTool;
  const type = selectionType || tool;
  const isShape = ["rectangle", "diamond", "ellipse"].includes(type);
  const isLine = ["line", "arrow"].includes(type);
  const isDraw = ["freedraw", "draw"].includes(type);
  const isText = type === "text";
  const isFill = type === "bucket-fill";
  const isAutoShape = type === "draw-to-shape";
  const supported = isShape || isLine || isDraw || isText || isFill || isAutoShape;
  const isSelection = selected.length > 0;
  const isVisible = canEdit && (isSelection ? supported || selected.length > 1 : supported);
  const first = selected[0];

  const current = (elementKey, appKey, fallback) => isSelection
    ? (first?.[elementKey] ?? fallback)
    : (appState[appKey] ?? fallback);
  const strokeColor = String(current("strokeColor", "currentItemStrokeColor", "#1e1e1e")).toLowerCase();
  const fillColor = String(current("backgroundColor", "currentItemBackgroundColor", "transparent")).toLowerCase();
  const strokeWidth = Number(current("strokeWidth", "currentItemStrokeWidth", 2)) || 1;
  const strokeStyle = current("strokeStyle", "currentItemStrokeStyle", "solid");
  const fillStyle = current("fillStyle", "currentItemFillStyle", "solid");
  const opacity = Number(current("opacity", "currentItemOpacity", 100));
  const fontSize = Number(current("fontSize", "currentItemFontSize", 20));
  const fontFamily = Number(current("fontFamily", "currentItemFontFamily", 1));
  const pressure = current("pressure", "currentItemPressure", true) !== false;

  const update = (patch) => {
    const api = apiRef?.current;
    if (!api) return;
    if (!isSelection) {
      const appStatePatch = {};
      const mapping = {
        strokeColor: "currentItemStrokeColor",
        backgroundColor: "currentItemBackgroundColor",
        strokeWidth: "currentItemStrokeWidth",
        strokeStyle: "currentItemStrokeStyle",
        fillStyle: "currentItemFillStyle",
        opacity: "currentItemOpacity",
        fontSize: "currentItemFontSize",
        fontFamily: "currentItemFontFamily",
        textAlign: "currentItemTextAlign",
        pressure: "currentItemPressure",
        startArrowhead: "currentItemStartArrowhead",
        endArrowhead: "currentItemEndArrowhead",
        roundness: "currentItemRoundness",
      };
      Object.entries(patch).forEach(([key, value]) => {
        if (mapping[key]) appStatePatch[mapping[key]] = value;
      });
      if (Object.keys(appStatePatch).length) api.updateScene({ appState: appStatePatch });
      return;
    }
    const ids = new Set(selected.map((element) => element.id));
    const now = Date.now();
    const elements = api.getSceneElements?.() || [];
    const next = elements.map((element) => ids.has(element.id)
      ? { ...element, ...patch, version: (Number(element.version) || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now }
      : element);
    api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const title = useMemo(() => {
    if (isSelection) return selected.length > 1 ? `${selected.length} selected` : (first?.type || "Object");
    return ({ rectangle: "Rectangle", diamond: "Diamond", ellipse: "Ellipse", line: "Line", arrow: "Arrow", freedraw: "Pen", text: "Text", "bucket-fill": "Bucket fill", "draw-to-shape": "Draw to shape" })[tool] || "";
  }, [isSelection, selected.length, first?.type, tool]);

  if (!isVisible) return null;

  return (
    <div className="sketchizi-tool-options-dock" role="toolbar" aria-label={`${title} options`} data-tool={type}>
      <span className="sk-tool-dock-context">{title}</span>
      <DockGroup label="Stroke color">
        {COLORS.map((color) => <button key={color} type="button" className={`sk-tool-color-dot${strokeColor === color ? " is-active" : ""}`} style={{ "--tool-color": color }} aria-label={`Stroke ${color}`} title={`Stroke ${color}`} onClick={() => update({ strokeColor: color })} />)}
        <ColorPicker label="Custom stroke color" value={strokeColor} onChange={(value) => update({ strokeColor: value })} />
      </DockGroup>
      {(isShape || isFill) && <DockGroup label="Fill">
        <ToolButton active={fillColor === "transparent"} title="No fill" onClick={() => update({ backgroundColor: "transparent" })}>∅</ToolButton>
        <ColorPicker label="Fill color" value={fillColor === "transparent" ? "#ffffff" : fillColor} onChange={(value) => update({ backgroundColor: value })} />
      </DockGroup>}
      {!isText && <DockGroup label="Stroke width">
        {WIDTHS.map((width) => <ToolButton key={width} active={strokeWidth === width} title={`Stroke width ${width}`} onClick={() => update({ strokeWidth: width })}>{width}</ToolButton>)}
      </DockGroup>}
      {(isShape || isLine || isDraw || isAutoShape) && <DockGroup label="Stroke style">
        {LINE_STYLES.map(([value, label]) => <ToolButton key={value} active={strokeStyle === value} title={label} onClick={() => update({ strokeStyle: value })}>{value === "solid" ? "—" : value === "dashed" ? "┄" : "···"}</ToolButton>)}
      </DockGroup>}
      {isShape && <DockGroup label="Fill style">
        {FILL_STYLES.map(([value, label]) => <ToolButton key={value} active={fillStyle === value} title={label} onClick={() => update({ fillStyle: value })}>{value === "solid" ? "■" : value === "hachure" ? "▨" : "▦"}</ToolButton>)}
      </DockGroup>}
      {isShape && <DockGroup label="Corners">
        <ToolButton active={!current("roundness", "currentItemRoundness", null)} title="Square corners" onClick={() => update({ roundness: null })}>□</ToolButton>
        <ToolButton active={Boolean(current("roundness", "currentItemRoundness", null))} title="Rounded corners" onClick={() => update({ roundness: { type: 3 } })}>▢</ToolButton>
      </DockGroup>}
      {type === "arrow" && <DockGroup label="Arrowheads">
        <select aria-label="Start arrowhead" value={current("startArrowhead", "currentItemStartArrowhead", null) || "none"} onChange={(event) => update({ startArrowhead: event.target.value === "none" ? null : event.target.value })}>
          <option value="none">Start: none</option><option value="arrow">Start: arrow</option><option value="bar">Start: bar</option><option value="dot">Start: dot</option>
        </select>
        <select aria-label="End arrowhead" value={current("endArrowhead", "currentItemEndArrowhead", "arrow") || "none"} onChange={(event) => update({ endArrowhead: event.target.value === "none" ? null : event.target.value })}>
          <option value="none">End: none</option><option value="arrow">End: arrow</option><option value="bar">End: bar</option><option value="dot">End: dot</option>
        </select>
      </DockGroup>}
      {isText && <DockGroup label="Text options">
        <select aria-label="Font family" value={fontFamily} onChange={(event) => update({ fontFamily: Number(event.target.value) })}>
          {FONT_FAMILIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Font size" value={fontSize} onChange={(event) => update({ fontSize: Number(event.target.value) })}>
          {[12, 16, 20, 24, 28, 36, 48].map((size) => <option key={size} value={size}>{size}px</option>)}
        </select>
      </DockGroup>}
      {isDraw && <DockGroup label="Pen pressure">
        <ToolButton active={pressure} title="Pressure sensitivity on" onClick={() => update({ pressure: true })}>P</ToolButton>
        <ToolButton active={!pressure} title="Pressure sensitivity off" onClick={() => update({ pressure: false })}>—</ToolButton>
      </DockGroup>}
      <DockGroup label="Opacity">
        <span className="sk-tool-dock-opacity-value">{opacity}%</span>
        <input aria-label="Opacity" type="range" min="0" max="100" step="5" value={opacity} onChange={(event) => update({ opacity: Number(event.target.value) })} />
      </DockGroup>
    </div>
  );
}
