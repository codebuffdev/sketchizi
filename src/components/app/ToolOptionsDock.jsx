import { useEffect, useMemo, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

const COLORS = ["#1e1e1e", "#6b7280", "#d94848", "#d97706", "#2f855a", "#2875b8", "#ffffff"];
const WIDTHS = [1, 2, 4, 6];
const LINE_STYLES = [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]];
const FILL_STYLES = [["solid", "Solid"], ["hachure", "Hachure"], ["cross-hatch", "Cross hatch"]];
const FONT_FAMILIES = [[2, "Helvetica"], [3, "Cascadia"], [5, "Excalifont"], [6, "Nunito"], [7, "Lilita One"], [8, "Comic Shanns"]];

function ContextShapeIcon({ type, title, multiple = false }) {
  let shape;
  if (multiple) {
    shape = <><rect x="4" y="5" width="12" height="12" rx="1" /><rect x="8" y="8" width="12" height="12" rx="1" /></>;
  } else {
    switch (type) {
      case "rectangle": shape = <rect x="4" y="5" width="16" height="14" rx="1" />; break;
      case "diamond": shape = <path d="M12 3 21 12 12 21 3 12Z" />; break;
      case "ellipse": shape = <ellipse cx="12" cy="12" rx="9" ry="7" />; break;
      case "line": shape = <path d="M4 19 20 5" />; break;
      case "arrow": shape = <path d="M4 19 20 5m-7 0h7v7" />; break;
      case "freedraw":
      case "draw": shape = <path d="M4 17c3-9 5 5 8-3s5-7 8-7" />; break;
      case "text": shape = <><path d="M5 5.5h14M12 5.5v13" /><path d="M9 18.5h6" /></>; break;
      case "bucket-fill": shape = <><path d="m7 4 9 9-5 5-9-9Z" /><path d="m13 10 5-5 3 3-5 5M15 19h6" /></>; break;
      case "draw-to-shape": shape = <><path d="M4 5h15v14H4z" strokeDasharray="2 2" /><path d="M7 16 11 8l5 7" /></>; break;
      default: shape = <><path d="M4 12h16" /><circle cx="12" cy="12" r="8" /></>;
    }
  }
  return <svg className="sk-tool-dock-shape-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={title} title={title}>{shape}</svg>;
}

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

  useEffect(() => {
    const handleEscapeToPrimaryDock = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      setCustomTool(null);
      apiRef?.current?.updateScene?.({
        appState: {
          activeTool: { type: "selection" },
          selectedElementIds: {},
          selectedGroupIds: {},
        },
      });
    };
    window.addEventListener("keydown", handleEscapeToPrimaryDock);
    return () => window.removeEventListener("keydown", handleEscapeToPrimaryDock);
  }, [apiRef]);

  const appState = apiRef?.current?.getAppState?.() || {};
  const selected = selectedElements.filter((element) => element && !element.isDeleted && !element.deleted);
  const activeTool = String(appState.activeTool?.type || "selection").toLowerCase();
  const editingTextElement = appState.editingTextElement?.type === "text" ? appState.editingTextElement : null;
  const selectionType = selected.length ? selected[0].type : editingTextElement?.type || null;
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
  const isSelection = selected.length > 0 || Boolean(isText && editingTextElement?.id);
  const isVisible = canEdit && (isSelection ? supported || selected.length > 1 : supported);
  const first = selected[0] || editingTextElement;

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
  const rawFontFamily = Number(current("fontFamily", "currentItemFontFamily", 5));
  const fontFamily = FONT_FAMILIES.some(([value]) => value === rawFontFamily) ? rawFontFamily : 2;
  const pressure = current("pressure", "currentItemPressure", true) !== false;
  const roughness = Number(current("roughness", "currentItemRoughness", 1));
  const [fontSizeDraft, setFontSizeDraft] = useState(String(fontSize));
  useEffect(() => setFontSizeDraft(String(fontSize)), [fontSize]);

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
    if (isText && editingTextElement?.id) ids.add(editingTextElement.id);
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
      <span className="sk-tool-dock-context" aria-label={title} title={title}><ContextShapeIcon type={type} title={title} multiple={selected.length > 1} /></span>
      <DockGroup label="Stroke color">
        {!isFill && <>{COLORS.map((color) => <button key={color} type="button" className={`sk-tool-color-dot${strokeColor === color ? " is-active" : ""}`} style={{ "--tool-color": color }} aria-label={`Stroke ${color}`} title={`Stroke ${color}`} onClick={() => update({ strokeColor: color })} />)}
        <ColorPicker label="Custom stroke color" value={strokeColor} onChange={(value) => update({ strokeColor: value })} /></>}
      </DockGroup>
      {(isShape || isFill || isAutoShape) && <DockGroup label="Fill">
        <ToolButton active={fillColor === "transparent"} title="No fill" onClick={() => update({ backgroundColor: "transparent" })}>∅</ToolButton>
        <ColorPicker label="Fill color" value={fillColor === "transparent" ? "#ffffff" : fillColor} onChange={(value) => update({ backgroundColor: value })} />
      </DockGroup>}
      {!isText && !isFill && <DockGroup label="Stroke width">
        {WIDTHS.map((width) => <ToolButton key={width} active={strokeWidth === width} title={`Stroke width ${width}`} onClick={() => update({ strokeWidth: width })}><svg className="sk-tool-stroke-width-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth={width === 1 ? 1.5 : width === 2 ? 2.5 : width === 4 ? 4 : 5.5} strokeLinecap="round" /></svg></ToolButton>)}
      </DockGroup>}
      {(isShape || isLine || isDraw || isAutoShape) && <DockGroup label="Stroke style">
        {LINE_STYLES.map(([value, label]) => <ToolButton key={value} active={strokeStyle === value} title={label} onClick={() => update({ strokeStyle: value })}>{value === "solid" ? "—" : value === "dashed" ? "┄" : "···"}</ToolButton>)}
      </DockGroup>}
      {(isShape || isAutoShape || isFill) && <DockGroup label="Fill style">
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
        <label className="sk-tool-font-family" title="Font family">
          <span className="sk-tool-font-family-preview" aria-hidden="true">Aa</span>
          <select className="sk-tool-font-family-select" aria-label="Font family" value={fontFamily} onChange={(event) => update({ fontFamily: Number(event.target.value) })}>
          {FONT_FAMILIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="sk-tool-text-size" role="group" aria-label="Font size">
          <button type="button" className="sk-tool-text-size-step" aria-label="Decrease font size" title="Decrease font size" disabled={fontSize <= 1} onClick={() => update({ fontSize: Math.max(1, fontSize - 1) })}>−</button>
          <label className="sk-tool-text-size-input">
            <input
              type="number"
              aria-label="Font size in pixels"
              min="1"
              max="999"
              step="1"
              value={fontSizeDraft}
              onChange={(event) => setFontSizeDraft(event.target.value)}
              onKeyDown={(event) => {
                // Prevent Excalidraw from interpreting typed digits as canvas shortcuts.
                event.stopPropagation();
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onKeyUp={(event) => event.stopPropagation()}
              onKeyPress={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onBlur={() => {
                const parsed = Number(fontSizeDraft);
                const nextSize = Number.isFinite(parsed) && fontSizeDraft.trim() !== ""
                  ? Math.max(1, Math.min(999, parsed))
                  : fontSize;
                setFontSizeDraft(String(nextSize));
                if (nextSize !== fontSize) update({ fontSize: nextSize });
              }}
            />
            <span>px</span>
          </label>
          <button type="button" className="sk-tool-text-size-step" aria-label="Increase font size" title="Increase font size" disabled={fontSize >= 999} onClick={() => update({ fontSize: Math.min(999, fontSize + 1) })}>+</button>
        </div>
      </DockGroup>}
      {isAutoShape && <DockGroup label="Roughness">
        {[0, 1, 2].map((value) => <ToolButton key={value} active={roughness === value} title={["Architect", "Artist", "Cartoonist"][value]} onClick={() => update({ roughness: value })}>{["A", "B", "C"][value]}</ToolButton>)}
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
