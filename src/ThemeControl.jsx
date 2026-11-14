import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { getCanvasBackground } from "./features/navigation/canvasTheme.js";
import "./styles/appearance-picker.css";
import { canvasColorForDisplay, canvasColorForScene } from "./features/navigation/canvasColors.js";

// Swatches use Excalidraw's scene colors and the same dark canvas filter.
const PRESETS = [["#ffffff", "White / Near black"], ["#f3faff", "Paper / Charcoal"], ["#e9eef5", "Pale blue / Slate"], ["#faf5df", "Cream / Deep olive"], ["#f4ece6", "Warm paper / Warm gray"], ["#e9f3e9", "Soft green / Forest"]];

export default function ThemeControl({ setThemeMode, themeMode, isDarkTheme, api, canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState(getCanvasBackground(isDarkTheme));
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
    panel.current?.querySelector("button")?.focus();
    const dismiss = (event) => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const keydown = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.key === "Tab") {
        const controls = [...panel.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
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
    if (api.getAppState?.().viewBackgroundColor === color) return;
    api.updateScene({ appState: { viewBackgroundColor: color }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setBackground(color);
  };
  return <>
    <button ref={trigger} type="button" className={`theme-toggle desktop-app-theme-toggle ${isDarkTheme ? "dark" : "light"}`} aria-label="Appearance and canvas background" title="Appearance and canvas background" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "sketchizi-appearance" : undefined} onClick={() => setOpen(value => !value)}>
      <span className="theme-toggle-icon" aria-hidden="true">{isDarkTheme ? "☾" : "☀"}</span>
    </button>
    {open && createPortal(<div ref={panel} id="sketchizi-appearance" className="sketchizi-appearance" data-dark={isDarkTheme} role="dialog" aria-label="Appearance and canvas background" style={position} onKeyDown={event => { if (event.key !== "Escape") event.stopPropagation(); }}>
      <div className="appearance-heading">Appearance<button type="button" aria-label="Close appearance settings" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></div>
      <div className="appearance-modes" role="group" aria-label="Theme">
        {[["light", "☀", "Light"], ["dark", "☾", "Dark"], ["system", "▣", "System"]].map(([mode, icon, label]) => <button key={mode} type="button" aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}><span aria-hidden="true">{icon}</span>{label}</button>)}
      </div>
      <div className="appearance-heading">Canvas background</div>
      <div className="appearance-swatches" role="group" aria-label="Canvas background presets">
        {PRESETS.map(([color, label]) => <button type="button" key={color} disabled={!canEdit || !api} aria-label={label} title={label} aria-pressed={background.toLowerCase() === color} onClick={() => chooseBackground(color)}><span style={{ background: color }} /></button>)}
      </div>
      <label className="appearance-custom">Custom color<input type="color" aria-label="Custom canvas background color" disabled={!canEdit || !api} value={canvasColorForDisplay(background, isDarkTheme)} onInput={event => chooseBackground(canvasColorForScene(event.currentTarget.value, isDarkTheme))} onChange={event => chooseBackground(canvasColorForScene(event.currentTarget.value, isDarkTheme))} /></label>
      <button className="appearance-reset" type="button" disabled={!canEdit || !api} onClick={() => chooseBackground(getCanvasBackground(isDarkTheme))}>Use theme default</button>
      <p>Background is saved with this drawing.</p>
    </div>, document.body)}
  </>;
}
