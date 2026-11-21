import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction, FONT_FAMILY } from "@excalidraw/excalidraw";
import { strokeWidthAppStatePatch } from "../../features/canvas/strokeWidthKey.js";

// Excalidraw reserves font-family ID 4 for host-provided custom fonts.
// Register Kalam on the shared enum so its renderer resolves ID 4 to Kalam.
if (FONT_FAMILY.Kalam === undefined) FONT_FAMILY.Kalam = 4;

const COLORS = ["#1e1e1e", "#7c828d", "#e05252", "#d9820b", "#3a9663", "#2b79c2", "#ffffff"];
const WIDTHS = [1, 2, 4, 6];
const LINE_STYLES = [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]];
const FILL_STYLES = [["solid", "Solid"], ["hachure", "Hachure"], ["cross-hatch", "Cross hatch"]];
const FONT_FAMILIES = [[3, "Cascadia"], [4, "Kalam"], [5, "Excalifont"], [7, "Lilita One"], [8, "Comic Shanns"]];
const LINE_GEOMETRIES = [
  ["straight", "Straight"],
  ["curved", "Curved"],
  ["elbow", "Elbow"],
  ["rounded-elbow", "Rounded elbow"],
];

function applyLineGeometryStyle(element, style) {
  if (!element || !["line", "arrow"].includes(element.type)) return element;
  const points = Array.isArray(element.points) && element.points.length >= 2
    ? element.points
    : [[0, 0], [Number(element.width) || 0, Number(element.height) || 0]];
  const start = points[0];
  const end = points[points.length - 1];
  let nextPoints = [start, end];
  let roundness = null;

  if (style === "curved") {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy) || 1;
    const offset = Math.max(24, length * 0.22);
    nextPoints = [start, [
      (start[0] + end[0]) / 2 - (dy / length) * offset,
      (start[1] + end[1]) / 2 + (dx / length) * offset,
    ], end];
    roundness = { type: 2 };
  } else if (style === "elbow" || style === "rounded-elbow") {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    nextPoints = [start, Math.abs(dx) >= Math.abs(dy) ? [end[0], start[1]] : [start[0], end[1]], end];
    if (style === "rounded-elbow") roundness = { type: 2 };
  }

  const compactPoints = nextPoints.filter((point, index) =>
    index === 0 || point[0] !== nextPoints[index - 1][0] || point[1] !== nextPoints[index - 1][1],
  );
  return {
    ...element,
    points: compactPoints,
    roundness,
    elbowed: element.type === "arrow" ? false : element.elbowed,
    customData: { ...(element.customData || {}), sketchiziLineGeometry: style },
    width: Math.max(Number(element.width) || 0, ...compactPoints.map((point) => Math.abs(point[0]))),
    height: Math.max(Number(element.height) || 0, ...compactPoints.map((point) => Math.abs(point[1]))),
    version: (Number(element.version) || 0) + 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now(),
  };
}

function getLineGeometryStyle(element) {
  const saved = element?.customData?.sketchiziLineGeometry;
  if (LINE_GEOMETRIES.some(([value]) => value === saved)) return saved;
  if (element?.points?.length > 2) return element.roundness ? "rounded-elbow" : "elbow";
  return "straight";
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

function DockOptionGlyph({ label, value, optionLabel }) {
  const name = String(label || "").toLowerCase();
  const option = String(optionLabel || value || "").toLowerCase();
  const svg = (children) => (
    <svg viewBox="0 0 32 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );

  if (name.includes("font")) {
    const families = {
      3: '"Cascadia Code", monospace',
      4: '"Kalam", cursive',
      5: '"Excalifont", cursive',
      7: '"Lilita One", cursive',
      8: '"Comic Shanns", cursive',
    };
    const weights = { 3: 500, 4: 400, 5: 400, 7: 700, 8: 600 };
    const styles = { 3: "normal", 4: "normal", 5: "italic", 7: "normal", 8: "oblique" };
    return <span className="sk-tool-option-font-glyph"
      style={{ fontFamily: families[Number(value)] || "sans-serif", fontWeight: weights[Number(value)] || 500, fontStyle: styles[Number(value)] || "normal" }}>Aa</span>;
  }
  if (name.includes("width")) {
    return svg(<path d="M3 12h26" style={{ strokeWidth: Math.max(1, Math.min(8, Number(value) || 2)) }} />);
  }
  if (name.includes("fill style")) {
    if (value === "solid") return svg(<><rect x="7" y="3" width="18" height="18" rx="2" fill="currentColor" /></>);
    if (value === "hachure") return svg(<><rect x="7" y="3" width="18" height="18" rx="2" /><path d="m8 17 12-12M12 21 25 8M7 11l8-8" /></>);
    return svg(<><rect x="7" y="3" width="18" height="18" rx="2" /><path d="m8 4 16 16M24 4 8 20M16 3v18M7 12h18" /></>);
  }
  if (name.includes("corner")) {
    return svg(value === "rounded"
      ? <path d="M7 21V10a7 7 0 0 1 7-7h11" />
      : <path d="M7 21V3h18" />);
  }
  if (name.includes("arrowhead")) {
    const atStart = name.includes("start");
    const tip = atStart ? 5 : 27;
    const arrow = atStart
      ? "M13 5 5 12l8 7"
      : "m19 5 8 7-8 7";
    return svg(<>
      <path d="M5 12h22" />
      {value === "arrow" && <path d={arrow} />}
      {value === "bar" && <path d={`M${tip} 4v16`} />}
      {value === "dot" && <circle cx={tip} cy="12" r="3" fill="currentColor" stroke="none" />}
    </>);
  }
  if (name.includes("pressure")) {
    return svg(value === "on"
      ? <><path d="M3 18c5 0 5-13 12-13 6 0 7 12 14 12" strokeWidth="3" /><path d="M3 21h26" opacity=".3" /></>
      : <><path d="M3 12h26" strokeWidth="1.5" /><path d="M3 18h26" opacity=".35" /></>);
  }

  // Keep future standard option menus identifiable instead of falling back
  // to the same generic circle for every option.
  const abbreviation = String(optionLabel || value || "?").trim().slice(0, 2).toUpperCase();
  return <span className="sk-tool-option-font-glyph" aria-hidden="true">{abbreviation}</span>;
}
function DockChoiceMenu({ label, value, onChange, icon, options, kind = "standard", preserveFocus = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const safeOptions = Array.isArray(options) ? options.filter((option) => option && option.value !== undefined) : [];
  const selected = safeOptions.find((option) => String(option.value) === String(value)) || safeOptions[0] || { value: "", label };

  useEffect(() => {
    if (open) {
      if (!preserveFocus) menuRef.current?.querySelector('[role="menuitemradio"]')?.focus();
    }
  }, [open, preserveFocus]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        if (!preserveFocus) triggerRef.current?.focus();
      } else if (event.type === "pointerdown"
        && !triggerRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      } else if (event.type === "resize" || event.type === "scroll") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    window.addEventListener("resize", close, true);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
      window.removeEventListener("resize", close, true);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, preserveFocus]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const columns = Math.min(4, Math.max(2, safeOptions.length));
    const estimatedHeight = Math.ceil(safeOptions.length / columns) * 66 + 16;
    const top = rect.bottom + estimatedHeight + 10 > window.innerHeight
      ? Math.max(8, rect.top - estimatedHeight - 8)
      : rect.bottom + 8;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - 150, window.innerWidth - 308));
    setPosition({ left, top });
    setOpen(true);
  };

  const renderGlyph = (option) => {
    if (kind === "line-style" || kind === "line-geometry" || kind === "roughness") return <OptionGlyph kind={kind} value={option.value} />;
    return <DockOptionGlyph label={label} value={option.value} optionLabel={option.label} />;
  };

  return (
    <div className="sk-tool-choice">
      <button ref={triggerRef} type="button" className={`sk-tool-choice-trigger${preserveFocus ? " properties-trigger" : ""}`}
        title={`${label}: ${selected.label || ""}`}
        aria-label={`${label}: ${selected.label || ""}`}
        aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <span className="sk-tool-choice-trigger-glyph" aria-hidden="true">{renderGlyph(selected)}</span>
        {String(label).toLowerCase().includes("width") && <span className="sk-tool-choice-value">{selected.value}px</span>}
        <svg className={`sk-tool-choice-chevron${open ? " is-open" : ""}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && position && createPortal(
        <div ref={menuRef} className="sk-tool-choice-menu" role="menu" aria-label={label}
          style={{ position: "fixed", left: position.left, top: position.top }}>
          {safeOptions.map((option) => {
            const active = String(option.value) === String(value);
            return <button key={String(option.value)} type="button" role="menuitemradio"
              aria-checked={active} aria-label={option.label} title={option.label}
              className={`sk-tool-choice-option${active ? " is-selected" : ""}${preserveFocus ? " properties-trigger" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(option.value);
                setOpen(false);
                if (!preserveFocus) triggerRef.current?.focus();
              }}>
              <span className="sk-tool-choice-option-glyph" aria-hidden="true">{renderGlyph(option)}</span>
              <span className="sk-tool-choice-option-label">{option.label}</span>
            </button>;
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

function DockSelect({ label, value, onChange, icon, children, preserveFocus = false }) {
  const options = Children.toArray(children)
    .filter((child) => isValidElement(child) && child.props?.value !== undefined)
    .map((child) => ({ value: child.props.value, label: String(child.props.children ?? child.props.value) }));
  return <DockChoiceMenu label={label} value={value} onChange={onChange} icon={icon} options={options} preserveFocus={preserveFocus} />;
}

function OptionGlyph({ kind, value }) {
  if (kind === "line-style") {
    return <svg viewBox="0 0 36 20" aria-hidden="true"><path d="M3 10h30" strokeDasharray={value === "dashed" ? "6 4" : value === "dotted" ? "1 4" : undefined} strokeLinecap="round" /></svg>;
  }
  if (kind === "line-geometry") {
    const paths = {
      straight: "M3 15h30",
      curved: "M3 15c8 0 8-11 15-11s7 11 13 11",
      elbow: "M3 4v11h30",
      "rounded-elbow": "M3 4v5q0 6 6 6h24",
    };
    return <svg viewBox="0 0 36 20" aria-hidden="true"><path d={paths[value] || paths.straight} /></svg>;
  }
  return <svg viewBox="0 0 36 20" aria-hidden="true"><path d={value === 0 ? "M3 10h30" : value === 1 ? "M3 10c4-8 7 8 11 0s7 8 11 0 5 4 8 0" : "M3 10 7 4l4 12 4-12 4 12 4-12 4 12 6-6"} /></svg>;
}

function VisualOptionSelect({ label, value, onChange, kind, options }) {
  return <DockChoiceMenu label={label} value={value} onChange={onChange} options={options} kind={kind} />;
}
export default function ToolOptionsDock({ apiRef, selectedElements = [], onClearSelection, canvasRevision, canEdit = true }) {
  useEffect(() => {
    // Warm the host-provided font so canvas text measurement uses Kalam immediately.
    document.fonts?.load('16px "Kalam"', "Kalam").catch(() => {});
  }, []);
  const [customTool, setCustomTool] = useState(null);
  const [dockOpen, setDockOpen] = useState(true);
  const collapseTimerRef = useRef(null);
  const pendingCollapseRef = useRef(false);
  const dockRef = useRef(null);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [layerMenuPosition, setLayerMenuPosition] = useState(null);
  const [opacityPopoverOpen, setOpacityPopoverOpen] = useState(false);
  const [opacityDragging, setOpacityDragging] = useState(false);
  const opacityPointerStartRef = useRef(null);
  const opacityRef = useRef(null);
  const [fontSizePopoverOpen, setFontSizePopoverOpen] = useState(false);
  const fontSizeInputRef = useRef(null);
  const layerTriggerRef = useRef(null);
  const cancelDockCollapse = () => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  };
  const expandDock = () => {
    cancelDockCollapse();
    setDockOpen(true);
  };
  const scheduleDockCollapse = () => {
    const active = document.activeElement;
    const isInputFocused = Boolean(active && dockRef.current?.contains(active) && active.matches("input, textarea, select"));
    const isPopoverOpen = opacityPopoverOpen || fontSizePopoverOpen || layerMenuOpen ||
      Boolean(dockRef.current?.querySelector('[aria-expanded="true"], [role="menu"], [role="dialog"]'));
    if (opacityDragging || isInputFocused || isPopoverOpen) {
      pendingCollapseRef.current = true;
      return;
    }
    pendingCollapseRef.current = false;
    cancelDockCollapse();
    collapseTimerRef.current = window.setTimeout(() => {
      setDockOpen(false);
      collapseTimerRef.current = null;
    }, 3000);
  };
  const collapseDockImmediately = () => {
    cancelDockCollapse();
    setDockOpen(false);
  };
  useEffect(() => () => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }, []);
  useEffect(() => {
    if (!pendingCollapseRef.current) return;
    const active = document.activeElement;
    const isInputFocused = Boolean(active && dockRef.current?.contains(active) && active.matches("input, textarea, select"));
    const isPopoverOpen = opacityPopoverOpen || fontSizePopoverOpen || layerMenuOpen ||
      Boolean(dockRef.current?.querySelector('[aria-expanded="true"], [role="menu"], [role="dialog"]'));
    if (!opacityDragging && !isInputFocused && !isPopoverOpen) scheduleDockCollapse();
  }, [opacityDragging, opacityPopoverOpen, fontSizePopoverOpen, layerMenuOpen]);
  const knownLineElementIdsRef = useRef(null);
  useEffect(() => {
    const handleCustomTool = (event) => {
      const tool = String(event.detail?.tool || "").toLowerCase();
      if (["bucketfill", "autoshape", "note", "sticky-note", "stickynote", "notes", "highlighter", "area-mask", "areamask"].includes(tool)) setCustomTool(tool);
    };
    const clearCustomTool = (event) => {
      if (event.target?.closest?.(".sketchizi-radial-wheel button, .App-toolbar button, .App-toolbar [role='button']")) setCustomTool(null);
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
      if (event.key !== "Escape") return;
      if (document.querySelector('.auth-account-trigger[aria-expanded="true"]')) return;
      const target = event.target;
      // Let Escape close an open dock menu first, and never steal it from
      // editable controls. The Primary Dock palette uses role="dialog", but
      // Escape there must still clear the element selection and restore the
      // full dock; treating every dialog as protected swallowed that action.
      if (target?.closest?.(
        "input, textarea, select, .sk-tool-choice-menu, .sk-tool-layer-menu, [role='menu']",
      )) return;

      // Capture Escape before Excalidraw consumes it so selection is cleared consistently.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setCustomTool(null);
      onClearSelection?.();
      apiRef?.current?.updateScene?.({
        appState: {
          activeTool: { type: "selection" },
          selectedElementIds: {},
          selectedGroupIds: {},
          selectedLinearElement: null,
        },
      });
    };
    window.addEventListener("keydown", handleEscapeToPrimaryDock, true);
    return () => window.removeEventListener("keydown", handleEscapeToPrimaryDock, true);
  }, [apiRef, onClearSelection]);

  const appState = apiRef?.current?.getAppState?.() || {};
  useEffect(() => {
    if (!layerMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!event.target?.closest?.(".sk-tool-layer-control, .sk-tool-layer-menu")) setLayerMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick, true);
    return () => window.removeEventListener("pointerdown", closeOnOutsideClick, true);
  }, [layerMenuOpen]);
  const selectedFromProps = selectedElements.filter((element) => element && !element.isDeleted && !element.deleted);
  const liveSelectedIds = Object.entries(appState.selectedElementIds || {})
    .filter(([, active]) => active)
    .map(([id]) => id);
  // Prefer the live Excalidraw selection when React's selectedElements prop
  // has not caught up yet (common immediately after clicking a text element).
  const liveSelected = (apiRef?.current?.getSceneElements?.() || []).filter((element) =>
    liveSelectedIds.includes(element.id) && !element.isDeleted && !element.deleted,
  );
  // Excalidraw's live selection is authoritative; React props can still refer
  // to the previous selection for one render after a click.
  const selected = liveSelected.length ? liveSelected : selectedFromProps;
  const selectionKey = selected.map((element) => element.id).sort().join("|");
  const previousSelectionKeyRef = useRef(selectionKey);
  const activeTool = String(appState.activeTool?.type || "selection").toLowerCase();
  useEffect(() => {
    if (previousSelectionKeyRef.current === selectionKey) return;
    previousSelectionKeyRef.current = selectionKey;
    collapseDockImmediately();
  }, [selectionKey]);
  useEffect(() => {
    const revealForCanvasHover = (event) => {
      if (selected.length && event.target?.closest?.(".excalidraw")) expandDock();
    };
    document.addEventListener("pointerover", revealForCanvasHover, true);
    return () => document.removeEventListener("pointerover", revealForCanvasHover, true);
  }, [selectionKey]);
  const editingTextElement = appState.editingTextElement?.type === "text" ? appState.editingTextElement : null;
  const selectionType = selected.length ? selected[0].type : editingTextElement?.type || null;
  const tool = customTool === "bucketfill" ? "bucket-fill"
    : customTool === "autoshape" ? "draw-to-shape"
      : ["note", "sticky-note", "stickynote", "notes"].includes(customTool) ? "text"
        : ["highlighter", "area-mask", "areamask"].includes(customTool) ? customTool
          : activeTool;
  const previousToolRef = useRef(tool);
  useEffect(() => {
    if (previousToolRef.current === tool) return;
    previousToolRef.current = tool;
    collapseDockImmediately();
  }, [tool]);
  const type = selectionType || tool;
  const isShape = ["rectangle", "diamond", "ellipse"].includes(type);
  const isLine = ["line", "arrow"].includes(type);
  const isDraw = ["freedraw", "draw"].includes(type);
  const isText = type === "text";
  const isFill = ["bucket-fill", "highlighter", "area-mask", "areamask"].includes(type);
  const isHighlighter = ["highlighter", "area-mask", "areamask"].includes(type);
  const isLaser = ["laser", "ephemeral", "ephemeral-stroke"].includes(type);
  const isAutoShape = type === "draw-to-shape";
  const supported = isShape || isLine || isDraw || isText || isFill || isAutoShape || isLaser;
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
  const preserveTextEditorFocus = isText && Boolean(appState.editingTextElement);
  const lineGeometry = isLine ? (isSelection ? getLineGeometryStyle(first) : (appState.currentItemLineGeometry || "straight")) : "straight";
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
        if (key === "strokeWidth") Object.assign(appStatePatch, strokeWidthAppStatePatch(value));
        else if (mapping[key]) appStatePatch[mapping[key]] = value;
      });
      if (Object.keys(appStatePatch).length) api.updateScene({ appState: appStatePatch });
      return;
    }
    // Read selection from Excalidraw at the moment of the click as well as
    // from React props. The props can lag one render behind a just-made text
    // selection, which otherwise makes a font choice silently update nothing.
    const liveAppState = api.getAppState?.() || {};
    const ids = new Set(selected.map((element) => element.id));
    Object.entries(liveAppState.selectedElementIds || {}).forEach(([id, active]) => {
      if (active) ids.add(id);
    });
    const activeEditingText = liveAppState.editingTextElement?.type === "text"
      ? liveAppState.editingTextElement
      : editingTextElement;
    if (isText && activeEditingText?.id) ids.add(activeEditingText.id);
    const now = Date.now();
    const elements = api.getSceneElements?.() || [];
    const next = elements.map((element) => ids.has(element.id)
      ? { ...element, ...patch, version: (Number(element.version) || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: now }
      : element);
    api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };


  const updateTextFontFamily = (value) => {
    const api = apiRef?.current;
    if (!api) return;
    const liveState = api.getAppState?.() || {};
    const liveIds = Object.entries(liveState.selectedElementIds || {})
      .filter(([, active]) => active)
      .map(([id]) => id);
    const propTextIds = selectedFromProps
      .filter((element) => element.type === "text")
      .map((element) => element.id);
    const editingId = liveState.editingTextElement?.type === "text"
      ? liveState.editingTextElement.id
      : editingTextElement?.id;
    const targetIds = new Set(liveIds.length ? liveIds : propTextIds);
    if (editingId) targetIds.add(editingId);

    const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
    const textTargets = elements.filter((element) =>
      targetIds.has(element.id) && element.type === "text" && !element.isDeleted && !element.deleted,
    );
    if (!textTargets.length) {
      // No selected text element: set the font for the next text object.
      api.updateScene({ appState: { currentItemFontFamily: Number(value) } });
      return;
    }
    const now = Date.now();
    api.updateScene({
      elements: elements.map((element) => textTargets.some((target) => target.id === element.id)
        ? { ...element, fontFamily: Number(value), version: (Number(element.version) || 0) + 1,
            versionNonce: Math.floor(Math.random() * 2147483647), updated: now }
        : element),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const updateLineGeometry = (value) => {
    const api = apiRef?.current;
    if (!api) return;
    if (!isSelection) {
      api.updateScene({ appState: { currentItemLineGeometry: value } });
      return;
    }
    const ids = new Set(selected.filter((element) => ["line", "arrow"].includes(element.type)).map((element) => element.id));
    if (!ids.size) return;
    const elements = api.getSceneElements?.() || [];
    api.updateScene({
      elements: elements.map((element) => ids.has(element.id) ? applyLineGeometryStyle(element, value) : element),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  useEffect(() => {
    const api = apiRef?.current;
    if (!api || !isLine || isSelection) return;
    const elements = api.getSceneElements?.() || [];
    if (!knownLineElementIdsRef.current) {
      knownLineElementIdsRef.current = new Set(elements.map((element) => element.id));
      return;
    }
    if (appState.draggingElement) return;
    const knownIds = knownLineElementIdsRef.current;
    const fresh = elements.filter((element) =>
      !knownIds.has(element.id) && element.type === tool && ["line", "arrow"].includes(element.type),
    );
    elements.forEach((element) => knownIds.add(element.id));
    if (!fresh.length) return;
    const style = appState.currentItemLineGeometry || "straight";
    if (style === "straight") return;
    const freshIds = new Set(fresh.map((element) => element.id));
    api.updateScene({
      elements: elements.map((element) => freshIds.has(element.id) ? applyLineGeometryStyle(element, style) : element),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [apiRef, canvasRevision, appState, isLine, isSelection, tool]);

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

  const setOpacityFromPointer = (event) => {
    const rect = opacityRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const step = event.shiftKey ? 5 : 1;
    const raw = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    update({ opacity: Math.max(0, Math.min(100, Math.round(raw / step) * step)) });
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

  const noLayerForTool = isDraw || isLaser || isFill;
  const showCornerRadius = type === "rectangle" || type === "diamond" || isHighlighter || isLaser;
  const showRoughness = isShape || isLine || isAutoShape || isLaser;
  const showStrokeStyle = isShape || isLine || isAutoShape || isLaser;
  const showStrokeWidth = !isText && !isFill;
  const activeRoundness = Boolean(current("roundness", "currentItemRoundness", null));
  const layerDisabled = !selected.length && !editingTextElement?.id && !Object.values(appState.selectedElementIds || {}).some(Boolean);
  const opacityValue = Math.max(0, Math.min(100, Number.isFinite(opacity) ? opacity : 100));

  const layerOrderControl = !noLayerForTool ? (
    <div className="sk-tool-layer-control">
      <button type="button" className={`sk-tool-layer-trigger${layerMenuOpen ? " is-active" : ""}`} aria-label="Layer order" aria-haspopup="menu" aria-expanded={layerMenuOpen}
        disabled={layerDisabled} title={layerDisabled ? "Select an element to change layer order" : "Layer order"} ref={layerTriggerRef}
        onClick={() => {
          if (layerMenuOpen) { setLayerMenuOpen(false); return; }
          const rect = layerTriggerRef.current?.getBoundingClientRect();
          if (rect) setLayerMenuPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), bottom: Math.max(8, window.innerHeight - rect.top + 9) });
          setLayerMenuOpen(true);
        }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></svg>
      </button>
      {layerMenuOpen && layerMenuPosition && createPortal(
        <div className="sk-tool-layer-menu" role="menu" aria-label="Layer order" style={{ position: "fixed", left: layerMenuPosition.left, bottom: layerMenuPosition.bottom }}>
          <button type="button" role="menuitem" onClick={() => moveLayers("front")}><span className="sk-tool-layer-action-icon">⇧</span><span className="sk-tool-layer-action-label">Bring to front</span></button>
          <button type="button" role="menuitem" onClick={() => moveLayers("forward")}><span className="sk-tool-layer-action-icon">↑</span><span className="sk-tool-layer-action-label">Bring forward</span></button>
          <button type="button" role="menuitem" onClick={() => moveLayers("backward")}><span className="sk-tool-layer-action-icon">↓</span><span className="sk-tool-layer-action-label">Send backward</span></button>
          <button type="button" role="menuitem" onClick={() => moveLayers("back")}><span className="sk-tool-layer-action-icon">⇩</span><span className="sk-tool-layer-action-label">Send to back</span></button>
        </div>, document.querySelector(".app") || document.body)}
    </div>
  ) : null;

  return (
    <div
      ref={dockRef}
      className={`sketchizi-tool-options-dock${dockOpen ? " is-open" : " is-collapsed"}`}
      role="toolbar"
      aria-label={`${title} options`}
      data-tool={type}
      aria-hidden={!dockOpen}
      onMouseEnter={expandDock}
      onMouseLeave={scheduleDockCollapse}
      onFocusCapture={expandDock}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleDockCollapse();
      }}
      onClickCapture={(event) => {
        const button = event.target?.closest?.("button");
        if (button && !button.matches('[aria-haspopup="menu"], [aria-haspopup="dialog"]') &&
          !button.closest(".sk-tool-opacity-scrubber")) {
          collapseDockImmediately();
        }
      }}
      onChangeCapture={(event) => {
        if (event.target?.matches?.("select")) collapseDockImmediately();
      }}
    >
      {<DockGroup label={isHighlighter ? "Fill style" : isText ? "Text color" : isShape || isLaser ? "Color & fill" : "Stroke color"}>
        {!isFill && COLORS.map((color) => <button key={color} type="button" className={`sk-tool-color-dot${strokeColor === color ? " is-active" : ""}`} style={{ "--tool-color": color }} aria-label={`Stroke ${color}`} title={`Stroke ${color}`} onClick={() => update({ strokeColor: color })} />)}
        {!isFill && <ColorPicker label="Custom color" value={strokeColor} onChange={(value) => update({ strokeColor: value })} />}
        {(isShape || isLaser || isHighlighter) && <>
          <ToolButton active={fillColor === "transparent"} title="Transparent / no fill" onClick={() => update({ backgroundColor: "transparent" })}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m5 19 14-14" /></svg>
          </ToolButton>
          <ToolButton active={fillColor !== "transparent"} title="Solid / hachure fill" onClick={() => update({ backgroundColor: fillColor === "transparent" ? "#ffffff" : fillColor })}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          </ToolButton>
        </>}
        {isFill && !isHighlighter && <ColorPicker label="Fill color" value={fillColor === "transparent" ? "#ffffff" : fillColor} onChange={(value) => update({ backgroundColor: value })} />}
      </DockGroup>}

      {(showStrokeWidth || showStrokeStyle || isLine || type === "arrow") && <DockGroup label="Stroke & connector">
        {showStrokeWidth && <DockSelect label={isDraw ? "Stroke width / thinning preset" : "Stroke width"} value={strokeWidth} onChange={(value) => update({ strokeWidth: Number(value) })}>
          {!WIDTHS.includes(strokeWidth) && <option value={strokeWidth}>{strokeWidth}px</option>}
          {WIDTHS.map((width) => <option key={width} value={width}>{width}px</option>)}
        </DockSelect>}
        {isLine && <VisualOptionSelect label="Line routing" value={lineGeometry} onChange={updateLineGeometry} kind="line-geometry" options={LINE_GEOMETRIES.map(([value, label]) => ({ value, label }))} />}
        {showStrokeStyle && <VisualOptionSelect label="Stroke style" value={strokeStyle} onChange={(value) => update({ strokeStyle: value })} kind="line-style" options={LINE_STYLES.map(([value, label]) => ({ value, label }))} />}
        {isDraw && <DockSelect label="Pen pressure" value={pressure ? "on" : "off"} onChange={(value) => update({ pressure: value === "on" })}>
          <option value="on">Pressure enabled</option><option value="off">Pressure disabled</option>
        </DockSelect>}
        {type === "arrow" && <div role="group" aria-label="Arrowheads" className="sk-tool-arrowhead-pair">
          <DockSelect label="Start arrowhead" value={current("startArrowhead", "currentItemStartArrowhead", null) || "none"} onChange={(value) => update({ startArrowhead: value === "none" ? null : value })}>
            <option value="none">Start: None</option><option value="arrow">Start: Arrow</option><option value="bar">Start: Bar</option><option value="dot">Start: Dot</option>
          </DockSelect>
          <DockSelect label="End arrowhead" value={current("endArrowhead", "currentItemEndArrowhead", "arrow") || "none"} onChange={(value) => update({ endArrowhead: value === "none" ? null : value })}>
            <option value="none">End: None</option><option value="arrow">End: Arrow</option><option value="bar">End: Bar</option><option value="dot">End: Dot</option>
          </DockSelect>
        </div>}
      </DockGroup>}

      {isText && <DockGroup label="Typography">
        <DockSelect label="Font family" value={fontFamily} onChange={updateTextFontFamily} preserveFocus>
          {FONT_FAMILIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </DockSelect>
        <div className="sk-tool-text-size" role="group" aria-label="Font size">
          <button type="button" className="sk-tool-text-size-step" onPointerDown={preserveTextEditorFocus ? (event) => event.preventDefault() : undefined} aria-label="Decrease font size" disabled={fontSize <= 8} onClick={() => update({ fontSize: Math.max(8, fontSize - 1) })}>−</button>
          <div className="sk-tool-text-size-input-wrap">
            <label className="sk-tool-text-size-input">
              <input ref={fontSizeInputRef} type="text" inputMode="numeric" aria-label="Font size in pixels"
                value={fontSizeDraft} onFocus={(event) => { event.target.select(); setFontSizePopoverOpen(true); }}
                onClick={(event) => { event.target.select(); setFontSizePopoverOpen(true); }}
                onChange={(event) => setFontSizeDraft(event.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                  else if (event.key === "Escape") { event.preventDefault(); setFontSizeDraft(String(fontSize)); setFontSizePopoverOpen(false); event.currentTarget.blur(); }
                  else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    const step = event.shiftKey ? 10 : 1;
                    const nextSize = Math.max(8, Math.min(200, fontSize + (event.key === "ArrowUp" ? step : -step)));
                    setFontSizeDraft(String(nextSize)); update({ fontSize: nextSize });
                  }
                }}
                onKeyUp={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onBlur={() => {
                  const parsed = Number(fontSizeDraft);
                  const nextSize = Number.isFinite(parsed) && fontSizeDraft.trim() !== "" ? Math.max(8, Math.min(200, parsed)) : fontSize;
                  setFontSizeDraft(String(nextSize)); setFontSizePopoverOpen(false);
                  if (nextSize !== fontSize) update({ fontSize: nextSize });
                }} />
              <span>px</span>
            </label>
            {fontSizePopoverOpen && <div className="sk-tool-font-size-presets" role="listbox" aria-label="Font size presets">
              {[12, 16, 20, 28, 36, 48, 64].map((size) => <button key={size} type="button" role="option"
                aria-selected={fontSize === size} onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setFontSizeDraft(String(size)); update({ fontSize: size }); setFontSizePopoverOpen(false); fontSizeInputRef.current?.focus(); }}>
                {size}
              </button>)}
            </div>}
          </div>
          <button type="button" className="sk-tool-text-size-step" onPointerDown={preserveTextEditorFocus ? (event) => event.preventDefault() : undefined} aria-label="Increase font size" disabled={fontSize >= 200} onClick={() => update({ fontSize: Math.min(200, fontSize + 1) })}>+</button>
        </div>
        {layerOrderControl}
      </DockGroup>}

      {((showCornerRadius || showRoughness || (!noLayerForTool && !isText)) && <DockGroup label="Shape modifiers & layers">
        {showCornerRadius && <DockSelect label="Corner radius" value={activeRoundness ? "rounded" : "sharp"} onChange={(value) => update({ roundness: value === "rounded" ? { type: 3 } : null })}>
          <option value="sharp">Sharp corners</option><option value="rounded">Rounded corners</option>
        </DockSelect>}
        {showRoughness && <VisualOptionSelect label="Roughness" value={roughness} onChange={(value) => update({ roughness: Number(value) })} kind="roughness" options={[{ value: 0, label: "Architect" }, { value: 1, label: "Artist" }, { value: 2, label: "Cartoonist" }]} />}
        {!isText && layerOrderControl}
      </DockGroup>)}

      <DockGroup label="Opacity">
        <div ref={opacityRef} className={`sk-tool-opacity-scrubber${opacityDragging ? " is-dragging" : ""}${opacityPopoverOpen ? " is-open" : ""}`} role="slider" tabIndex={0} aria-label="Opacity — drag to adjust or click for presets" aria-valuemin={0} aria-valuemax={100} aria-valuenow={opacityValue} aria-haspopup="dialog" aria-expanded={opacityPopoverOpen} data-tooltip="Drag to adjust · Click for presets"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            opacityPointerStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setOpacityDragging(false);
          }}
          onPointerMove={(event) => {
            const start = opacityPointerStartRef.current;
            if (!start || start.pointerId !== event.pointerId) return;
            if (!opacityDragging && Math.abs(event.clientX - start.x) < 3) return;
            if (!opacityDragging) setOpacityDragging(true);
            setOpacityFromPointer(event);
          }}
          onPointerUp={(event) => {
            const start = opacityPointerStartRef.current;
            if (start && start.pointerId === event.pointerId && !opacityDragging && Math.abs(event.clientX - start.x) < 3) {
              setOpacityPopoverOpen((open) => !open);
            }
            opacityPointerStartRef.current = null;
            setOpacityDragging(false);
          }}
          onPointerCancel={() => { opacityPointerStartRef.current = null; setOpacityDragging(false); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpacityPopoverOpen((open) => !open); }
            if (event.key === "Escape" && opacityPopoverOpen) { event.preventDefault(); setOpacityPopoverOpen(false); }
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); update({ opacity: Math.max(0, opacityValue - (event.shiftKey ? 5 : 1)) }); }
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); update({ opacity: Math.min(100, opacityValue + (event.shiftKey ? 5 : 1)) }); }
          }}>
          <svg className="sk-tool-opacity-ring" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle className="sk-tool-opacity-ring-track" cx="12" cy="12" r="8" fill="none" strokeWidth="2" />
            <circle className="sk-tool-opacity-ring-progress" cx="12" cy="12" r="8" fill="none" strokeWidth="2" strokeLinecap="round"
              strokeDasharray="50.265" strokeDashoffset={50.265 * (1 - opacityValue / 100)} transform="rotate(-90 12 12)" />
            <path className="sk-tool-opacity-ring-drop" d="M12 4.5c-2.7 3.6-5.2 6.4-5.2 9a5.2 5.2 0 0 0 10.4 0c0-2.6-2.5-5.4-5.2-9Z" />
          </svg>
          <span className="sk-tool-dock-opacity-value">{opacityValue}%</span>
          <span className="sk-tool-opacity-chevron" aria-hidden="true">⌃</span>
        </div>
        {opacityPopoverOpen && <div className="sk-tool-opacity-popover" role="dialog" aria-label="Precise opacity">
          <input type="range" aria-label="Precise opacity" min="0" max="100" step="1" value={opacityValue} onChange={(event) => update({ opacity: Number(event.target.value) })} />
          <span>{opacityValue}%</span>
          <div className="sk-tool-opacity-presets">{[25, 50, 75, 100].map((value) => <button key={value} type="button" aria-pressed={opacityValue === value} onClick={() => update({ opacity: value })}>{value}%</button>)}</div>
        </div>}
      </DockGroup>
    </div>
  );
}
