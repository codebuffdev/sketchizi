import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { getCanvasBackground } from "./features/navigation/canvasTheme.js";
import "./styles/appearance-picker.css";
import { canvasColorForDisplay, canvasColorForScene, normalizeCanvasHex } from "./features/navigation/canvasColors.js";

// Swatches use Excalidraw's scene colors and the same dark canvas filter.
const PRESETS = [["#ffffff", "White / Near black"], ["#f3faff", "Paper / Charcoal"], ["#e9eef5", "Pale blue / Slate"], ["#faf5df", "Cream / Deep olive"], ["#f4ece6", "Warm paper / Warm gray"], ["#e9f3e9", "Soft green / Forest"]];

function AppearanceIcon({ mode }) {
  return <svg className="appearance-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {mode === "light" ? <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </> : mode === "system" ? <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </> : <path d="M20.9 13.1A8.5 8.5 0 0 1 10.9 3.1a8.5 8.5 0 1 0 10 10Z" />}
  </svg>;
}

export default function ThemeControl({ setThemeMode, themeMode, isDarkTheme, api, canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState(getCanvasBackground(isDarkTheme));
  const [hexDraft, setHexDraft] = useState(null);
  const [hexError, setHexError] = useState(false);
  const [position, setPosition] = useState({ top: 60, right: 12 });
  const trigger = useRef(null);
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    };
    update();
    setBackground(api?.getAppState?.().viewBackgroundColor || getCanvasBackground(isDarkTheme));
    setHexDraft(null);
    setHexError(false);
    panel.current?.focus({ preventScroll: true });
    const dismiss = (event) => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const keydown = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.key === "Tab") {
        const controls = [...panel.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", update);
    };
  }, [open, api, isDarkTheme]);
  const chooseBackground = (color) => {
    if (!canEdit || !api) return;
    setHexDraft(null);
    setHexError(false);
    setBackground(color);
    if (api.getAppState?.().viewBackgroundColor === color) return;
    api.updateScene({ appState: { viewBackgroundColor: color }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };
  const applyHex = () => {
    if (hexDraft === null) return;
    const color = normalizeCanvasHex(hexDraft);
    if (!color) { setHexError(true); return; }
    chooseBackground(canvasColorForScene(color, isDarkTheme));
  };
  return <>
    <button ref={trigger} type="button" className={`theme-toggle desktop-app-theme-toggle appearance-trigger ${isDarkTheme ? "dark" : "light"}`} aria-label="Appearance and canvas background" title="Appearance and canvas background" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "sketchizi-appearance" : undefined} onClick={() => setOpen(value => !value)}>
      <AppearanceIcon mode={themeMode === "system" ? "system" : isDarkTheme ? "dark" : "light"} />
    </button>
    {open && createPortal(<div ref={panel} id="sketchizi-appearance" className="sketchizi-appearance" tabIndex={-1} data-dark={isDarkTheme} role="dialog" aria-label="Appearance and canvas background" style={position} onKeyDown={event => { if (event.key !== "Escape") event.stopPropagation(); }}>
      <div className="appearance-heading appearance-title"><span>Appearance</span><button className="appearance-close" type="button" aria-label="Close appearance settings" onClick={() => { setOpen(false); trigger.current?.focus(); }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <div className="appearance-modes" role="group" aria-label="Theme">
        {[["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(([mode, label]) => <button key={mode} type="button" aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}><AppearanceIcon mode={mode} />{label}</button>)}
      </div>
      <div className="appearance-heading appearance-background-heading"><span>Canvas background</span><button className="appearance-reset" type="button" title="Use theme default" disabled={!canEdit || !api} onClick={() => chooseBackground(getCanvasBackground(isDarkTheme))}>Reset</button></div>
      <div className="appearance-swatches" role="group" aria-label="Canvas background presets">
        {PRESETS.map(([color, label]) => <button type="button" key={color} disabled={!canEdit || !api} aria-label={label} title={label} aria-pressed={background.toLowerCase() === color} onClick={() => chooseBackground(color)}><span className="appearance-swatch-color" style={{ background: color }} /><svg className="appearance-swatch-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></button>)}
      </div>
      <div className="appearance-custom"><span>Custom color</span><span className="appearance-color-value"><input className="appearance-hex-input" type="text" aria-label="Canvas background hex color" aria-invalid={hexError} aria-describedby={hexError ? "appearance-hex-error" : undefined} disabled={!canEdit || !api} value={hexDraft ?? canvasColorForDisplay(background, isDarkTheme).toUpperCase()} spellCheck={false} autoComplete="off" placeholder="#12181C" onChange={event => { setHexDraft(event.target.value); setHexError(false); }} onBlur={applyHex} onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); applyHex(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setHexDraft(null); setHexError(false); }
      }} /><input type="color" aria-label="Custom canvas background color" disabled={!canEdit || !api} value={canvasColorForDisplay(background, isDarkTheme)} onInput={event => chooseBackground(canvasColorForScene(event.currentTarget.value, isDarkTheme))} onChange={event => chooseBackground(canvasColorForScene(event.currentTarget.value, isDarkTheme))} /></span></div>
      {hexError && <p id="appearance-hex-error" className="appearance-hex-error" role="alert">Enter 3 or 6 hex digits, such as #12181C.</p>}
      <p className="appearance-footer"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>Saved with this drawing</p>
    </div>, document.body)}
  </>;
}
