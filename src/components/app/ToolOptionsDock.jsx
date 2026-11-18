import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function DockOptionGlyph({ label, value }) {
  const name = String(label || "").toLowerCase();
  if (name.includes("font")) {
    const family = ({2:"Arial, sans-serif",3:"monospace",5:"cursive",6:"Nunito, sans-serif",7:"cursive",8:"monospace"})[Number(value)] || "sans-serif";
    return <span className="sk-tool-option-font-glyph" style={{fontFamily:family}}>Aa</span>;
  }
  if (name.includes("width")) return <svg viewBox="0 0 32 24" aria-hidden="true"><path d="M3 12h26" style={{ strokeWidth: Math.max(1, Math.min(7, Number(value) || 2)) }} /></svg>;
  if (name.includes("fill style")) return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" style={{ fill: value==="solid" ? "currentColor" : "none" }} /><path d={value==="hachure"?"m5 17 12-12M9 20 20 9M4 12l8-8":value==="cross-hatch"?"m4 4 16 16M20 4 4 20M12 4v16M4 12h16":"M4 4h16v16H4z"} /></svg>;
  if (name.includes("corner")) return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx={value==="rounded"?6:0.5} /></svg>;
  if (name.includes("arrowhead")) return <svg viewBox="0 0 32 24" aria-hidden="true"><path d="M4 12h24" />{value==="arrow"&&<path d={name.includes("start")?"m11 5-7 7 7 7":"m21 5 7 7-7 7"} />}{value==="bar"&&<path d={name.includes("start")?"M4 5v14":"M28 5v14"} />}{value==="dot"&&<circle cx={name.includes("start")?4:28} cy="12" r="3" fill="currentColor" />}</svg>;
  if (name.includes("pressure")) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={value==="on"?"M3 17c4 0 4-10 9-10s5 10 9 10":"M3 12h18"} style={{ strokeWidth: value==="on" ? 2.8 : 1.4 }} /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /></svg>;
}

function DockSelect({ label, value, onChange, icon, children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const options = Children.toArray(children)
    .filter((child) => isValidElement(child) && child.props?.value !== undefined)
    .map((child) => ({
      value: child.props.value,
      label: String(child.props.children ?? child.props.value),
    }));
  const selected = options.find((option) => String(option.value) === String(value))
    || options[0]
    || { value: "", label };
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") setOpen(false);
      if (event.type === "pointerdown" && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [open]);
  return (
    <div className="sk-tool-icon-select-wrap" ref={rootRef}>
      <button type="button" className="sk-tool-icon-select" title={`${label}: ${selected?.label || ""}`} aria-label={`${label}: ${selected?.label || ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="sk-tool-icon-select-preview" aria-hidden="true">{icon}</span>
        <svg className={`sk-tool-icon-select-chevron${open ? " is-open" : ""}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && <div className="sk-tool-icon-select-menu" role="listbox" aria-label={label}>
        {options.map((option) => <button key={String(option.value)} type="button" role="option" aria-selected={String(option.value) === String(value)} aria-label={option.label} title={option.label} className={`sk-tool-icon-select-option${String(option.value) === String(value) ? " is-selected" : ""}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onChange(option.value); setOpen(false); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onChange(option.value); setOpen(false); } }}>
          <DockOptionGlyph label={label} value={option.value} />
        </button>)}
      </div>}
    </div>
  );
}

function OptionGlyph({ kind, value }) {
  if (kind === "line-style") {
    return <svg viewBox="0 0 36 20" aria-hidden="true"><path d="M3 10h30" strokeDasharray={value === "dashed" ? "6 4" : value === "dotted" ? "1 4" : undefined} strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 36 20" aria-hidden="true"><path d={value === 0 ? "M3 10h30" : value === 1 ? "M3 10c4-8 7 8 11 0s7 8 11 0 5 4 8 0" : "M3 10 7 4l4 12 4-12 4 12 4-12 4 12 6-6"} /></svg>;
}

function VisualOptionSelect({ label, value, onChange, kind, options }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const safeOptions = Array.isArray(options) ? options.filter((option) => option && option.value !== undefined) : [];
  const selected = safeOptions.find((option) => option.value === value) || safeOptions[0] || { value: 0, label };
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") setOpen(false);
      if (event.type === "pointerdown" && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [open]);
  return (
    <div className="sk-tool-visual-select" ref={rootRef}>
      <button type="button" className="sk-tool-icon-select" title={`${label}: ${selected.label}`} aria-label={`${label}: ${selected.label}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="sk-tool-icon-select-preview" aria-hidden="true"><OptionGlyph kind={kind} value={selected.value} /></span>
        <svg className="sk-tool-icon-select-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && <div className="sk-tool-visual-select-menu" role="listbox" aria-label={label}>
        {safeOptions.map((option) => <button key={String(option.value)} type="button" role="option" aria-selected={option.value === value} aria-label={option.label} title={option.label} className={`sk-tool-visual-select-option${option.value === value ? " is-selected" : ""}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onChange(option.value); setOpen(false); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onChange(option.value); setOpen(false); } }}>
          <OptionGlyph kind={kind} value={option.value} />
        </button>)}
      </div>}
    </div>
  );
}

export default function ToolOptionsDock({ apiRef, selectedElements = [], canvasRevision, canEdit = true }) {
  const [customTool, setCustomTool] = useState(null);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [layerMenuPosition, setLayerMenuPosition] = useState(null);
  const layerTriggerRef = useRef(null);
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
  useEffect(() => {
    if (!layerMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!event.target?.closest?.(".sk-tool-layer-control, .sk-tool-layer-menu")) setLayerMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick, true);
    return () => window.removeEventListener("pointerdown", closeOnOutsideClick, true);
  }, [layerMenuOpen]);
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
        roughness: "currentItemRoughness",
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

  const moveLayers = (direction) => {
    const api = apiRef?.current;
    if (!api) return;
    const elements = api.getSceneElements?.() || [];
    const selectedIds = new Set(
      Object.entries(api.getAppState?.()?.selectedElementIds || {})
        .filter(([, isSelected]) => isSelected)
        .map(([id]) => id),
    );
    selected.forEach((element) => selectedIds.add(element.id));
    if (editingTextElement?.id) selectedIds.add(editingTextElement.id);
    if (!selectedIds.size) return;

    // Excalidraw determines stacking order from each element's fractional
    // `index`, not from its position in the elements array. Reorder the
    // elements, then redistribute the existing ordered index values.
    const orderedElements = [...elements].sort((a, b) =>
      (a.index ?? "") < (b.index ?? "") ? -1 : (a.index ?? "") > (b.index ?? "") ? 1 : 0,
    );
    const selectedLayerElements = orderedElements.filter((element) => selectedIds.has(element.id));
    const otherLayerElements = orderedElements.filter((element) => !selectedIds.has(element.id));
    let reordered = orderedElements;
    if (direction === "front") reordered = [...otherLayerElements, ...selectedLayerElements];
    if (direction === "back") reordered = [...selectedLayerElements, ...otherLayerElements];
    if (direction === "forward") {
      reordered = [...orderedElements];
      for (let index = reordered.length - 2; index >= 0; index -= 1) {
        if (selectedIds.has(reordered[index].id) && !selectedIds.has(reordered[index + 1].id)) {
          [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
        }
      }
    }
    if (direction === "backward") {
      reordered = [...orderedElements];
      for (let index = 1; index < reordered.length; index += 1) {
        if (selectedIds.has(reordered[index].id) && !selectedIds.has(reordered[index - 1].id)) {
          [reordered[index], reordered[index - 1]] = [reordered[index - 1], reordered[index]];
        }
      }
    }

    const indexSlots = orderedElements.map((element) => element.index);
    const changed = reordered.some((element, index) => element.id !== orderedElements[index]?.id);
    if (changed) {
      const now = Date.now();
      const nextElements = reordered.map((element, index) => ({
        ...element,
        index: indexSlots[index],
        version: (Number(element.version) || 0) + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: now,
      }));
      api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    }
    setLayerMenuOpen(false);
  };

  const title = useMemo(() => {
    if (isSelection) return selected.length > 1 ? `${selected.length} selected` : (first?.type || "Object");
    return ({ rectangle: "Rectangle", diamond: "Diamond", ellipse: "Ellipse", line: "Line", arrow: "Arrow", freedraw: "Pen", text: "Text", "bucket-fill": "Bucket fill", "draw-to-shape": "Draw to shape" })[tool] || "";
  }, [isSelection, selected.length, first?.type, tool]);

  const layerControl = (
          <div className="sk-tool-layer-control">
            <button
              type="button"
              className={`sk-tool-layer-trigger${layerMenuOpen ? " is-active" : ""}`}
              aria-label="Layer order"
              aria-haspopup="menu"
              aria-expanded={layerMenuOpen}
              disabled={!selected.length && !editingTextElement?.id && !Object.values(appState.selectedElementIds || {}).some(Boolean)}
              title={selected.length || editingTextElement?.id || Object.values(appState.selectedElementIds || {}).some(Boolean) ? "Layer order" : "Select an element to change layer order"}
              ref={layerTriggerRef}
              onClick={() => {
                if (layerMenuOpen) {
                  setLayerMenuOpen(false);
                  return;
                }
                const rect = layerTriggerRef.current?.getBoundingClientRect();
                if (rect) {
                  setLayerMenuPosition({
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
                    bottom: Math.max(8, window.innerHeight - rect.top + 9),
                  });
                }
                setLayerMenuOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 3 8 4-8 4-8-4 8-4Z" />
                <path d="m4 12 8 4 8-4M4 17l8 4 8-4" />
              </svg>
            </button>
            {layerMenuOpen && layerMenuPosition && createPortal(
              <div className="sk-tool-layer-menu" role="menu" aria-label="Layer order" style={{ position: "fixed", left: layerMenuPosition.left, bottom: layerMenuPosition.bottom }}>
                <button type="button" role="menuitem" onClick={() => moveLayers("front")}>
                  <span className="sk-tool-layer-action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16M7 6l5-4 5 4M4 15h16M4 20h16" /></svg></span>
                  <span className="sk-tool-layer-action-label">Bring to front</span>
                  <kbd><span>Ctrl</span><i>+</i><span>Shift</span><i>+</i><span>]</span></kbd>
                </button>
                <button type="button" role="menuitem" onClick={() => moveLayers("forward")}>
                  <span className="sk-tool-layer-action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6M4 5h16M4 19h16" /></svg></span>
                  <span className="sk-tool-layer-action-label">Bring forward</span>
                  <kbd><span>Ctrl</span><i>+</i><span>]</span></kbd>
                </button>
                <button type="button" role="menuitem" onClick={() => moveLayers("backward")}>
                  <span className="sk-tool-layer-action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M10 6l-6 6 6 6M4 5h16M4 19h16" /></svg></span>
                  <span className="sk-tool-layer-action-label">Send backward</span>
                  <kbd><span>Ctrl</span><i>+</i><span>[</span></kbd>
                </button>
                <button type="button" role="menuitem" onClick={() => moveLayers("back")}>
                  <span className="sk-tool-layer-action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h16M7 18l5 4 5-4M4 4h16M4 9h16" /></svg></span>
                  <span className="sk-tool-layer-action-label">Send to back</span>
                  <kbd><span>Ctrl</span><i>+</i><span>Shift</span><i>+</i><span>[</span></kbd>
                </button>
              </div>,
              document.querySelector(".app") || document.body,
            )}
          </div>
  );

  if (!isVisible) return null;

  return (
    <div className="sketchizi-tool-options-dock" role="toolbar" aria-label={`${title} options`} data-tool={type}>
      <span className="sk-tool-dock-context" aria-label={title} title={title}><ContextShapeIcon type={type} title={title} multiple={selected.length > 1} /></span>
      <DockGroup label="Stroke color">
        {!isFill && <>{COLORS.map((color) => <button key={color} type="button" className={`sk-tool-color-dot${strokeColor === color ? " is-active" : ""}`} style={{ "--tool-color": color }} aria-label={`Stroke ${color}`} title={`Stroke ${color}`} onClick={() => update({ strokeColor: color })} />)}
        <ColorPicker label="Custom stroke color" value={strokeColor} onChange={(value) => update({ strokeColor: value })} /></>}
      </DockGroup>
      {(isShape || isFill || isAutoShape) && <DockGroup label="Fill">
        <ToolButton active={fillColor === "transparent"} title="No fill" onClick={() => update({ backgroundColor: "transparent" })}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m5 19 14-14" /></svg></ToolButton>
        <ColorPicker label="Fill color" value={fillColor === "transparent" ? "#ffffff" : fillColor} onChange={(value) => update({ backgroundColor: value })} />
      </DockGroup>}
      {!isText && !isFill && <DockGroup label="Stroke width">
        <DockSelect label="Stroke width" value={strokeWidth} onChange={(value) => update({ strokeWidth: Number(value) })} icon={<svg viewBox="0 0 24 24"><path d="M3 12h18" strokeWidth={Math.min(6, Math.max(1.5, strokeWidth))} /></svg>}>
          {!WIDTHS.includes(strokeWidth) && <option value={strokeWidth}>{strokeWidth} px</option>}
          {WIDTHS.map((width) => <option key={width} value={width}>{width} px</option>)}
        </DockSelect>
      </DockGroup>}
      {(isShape || isLine || isDraw || isAutoShape) && <DockGroup label="Stroke style">
        <VisualOptionSelect label="Stroke style" value={strokeStyle} onChange={(value) => update({ strokeStyle: value })} kind="line-style" options={LINE_STYLES.map(([value, label]) => ({ value, label }))} />
      </DockGroup>}
      {(isShape || isAutoShape || isFill) && <DockGroup label="Fill style">
        <DockSelect label="Fill style" value={fillStyle} onChange={(value) => update({ fillStyle: value })} icon={<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d={fillStyle === "solid" ? "M4 4h16v16H4z" : fillStyle === "hachure" ? "m5 17 12-12M9 20 20 9M4 12l8-8" : "m4 4 16 16M20 4 4 20M12 4v16M4 12h16"} fill={fillStyle === "solid" ? "currentColor" : "none"} /></svg>}>
          {FILL_STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </DockSelect>
      </DockGroup>}
      {(isShape || isLine) && <DockGroup label="Layers">{layerControl}</DockGroup>}
      {isShape && <DockGroup label="Corners">
        <DockSelect label="Corners" value={current("roundness", "currentItemRoundness", null) ? "rounded" : "square"} onChange={(value) => update({ roundness: value === "rounded" ? { type: 3 } : null })} icon={<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx={current("roundness", "currentItemRoundness", null) ? 5 : 1} /></svg>}>
          <option value="square">Square corners</option>
          <option value="rounded">Rounded corners</option>
        </DockSelect>
      </DockGroup>}
      {type === "arrow" && <DockGroup label="Arrowheads">
        <DockSelect label="Start arrowhead" value={current("startArrowhead", "currentItemStartArrowhead", null) || "none"} onChange={(value) => update({ startArrowhead: value === "none" ? null : value })} icon={<svg viewBox="0 0 24 24"><path d="M4 12h16" /><path d="M10 6 4 12l6 6" opacity={(current("startArrowhead", "currentItemStartArrowhead", null) || "none") === "arrow" ? 1 : 0} /><path d="M4 5v14" opacity={current("startArrowhead", "currentItemStartArrowhead", null) === "bar" ? 1 : 0} /><circle cx="4" cy="12" r="2" fill={current("startArrowhead", "currentItemStartArrowhead", null) === "dot" ? "currentColor" : "none"} /></svg>}>
          <option value="none">No start arrowhead</option><option value="arrow">Arrow</option><option value="bar">Bar</option><option value="dot">Dot</option>
        </DockSelect>
        <DockSelect label="End arrowhead" value={current("endArrowhead", "currentItemEndArrowhead", "arrow") || "none"} onChange={(value) => update({ endArrowhead: value === "none" ? null : value })} icon={<svg viewBox="0 0 24 24"><path d="M4 12h16" /><path d="m14 6 6 6-6 6" opacity={(current("endArrowhead", "currentItemEndArrowhead", "arrow") || "none") === "arrow" ? 1 : 0} /><path d="M20 5v14" opacity={current("endArrowhead", "currentItemEndArrowhead", "arrow") === "bar" ? 1 : 0} /><circle cx="20" cy="12" r="2" fill={current("endArrowhead", "currentItemEndArrowhead", "arrow") === "dot" ? "currentColor" : "none"} /></svg>}>
          <option value="none">No end arrowhead</option><option value="arrow">Arrow</option><option value="bar">Bar</option><option value="dot">Dot</option>
        </DockSelect>
      </DockGroup>}
      {isText && <DockGroup label="Text options">
        {layerControl}
        <DockSelect label="Font family" value={fontFamily} onChange={(value) => update({ fontFamily: Number(value) })} icon={<svg viewBox="0 0 24 24"><path d="m4 19 6-14h4l6 14M7 13h10" /></svg>}>
          {FONT_FAMILIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </DockSelect>
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
      {(isShape || isLine || isAutoShape) && <DockGroup label="Sloppiness">
        <VisualOptionSelect label="Sloppiness" value={roughness} onChange={(value) => update({ roughness: Number(value) })} kind="roughness" options={[{ value: 0, label: "Architect" }, { value: 1, label: "Artist" }, { value: 2, label: "Cartoonist" }]} />
      </DockGroup>}
      {isDraw && <DockGroup label="Pen pressure">
        <DockSelect label="Pen pressure" value={pressure ? "on" : "off"} onChange={(value) => update({ pressure: value === "on" })} icon={<svg viewBox="0 0 24 24"><path d="M4 18c3-1 4-2 6-5s3-7 5-7 3 4 5 5" strokeWidth={pressure ? 2.2 : 1.2} /><path d="M4 20h16" opacity=".45" /></svg>}>
          <option value="on">On</option>
          <option value="off">Off</option>
        </DockSelect>
      </DockGroup>}
      <DockGroup label="Opacity">
        <svg className="sk-tool-opacity-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c-3 4-7 8-7 12a7 7 0 0 0 14 0c0-4-4-8-7-12Z" /><path d="M8 16a4 4 0 0 0 4 3" /></svg>
        <span className="sk-tool-dock-opacity-value">{opacity}%</span>
        <input aria-label="Opacity" type="range" min="0" max="100" step="5" value={opacity} onChange={(event) => update({ opacity: Number(event.target.value) })} />
      </DockGroup>
    </div>
  );
}
