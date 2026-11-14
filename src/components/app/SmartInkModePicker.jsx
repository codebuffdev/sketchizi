import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./SmartInkModePicker.css";
import { recognizeInk, beautifyInk } from "../../features/canvas/smartInkRecognition.js";

const DRAW_TOOL_LABEL = /^(draw|freedraw|freehand)(?:\s|$)/i;

export function isNativeDrawButton(button) {
  if (!button || button.closest(".sketchizi-smart-ink-menu")) return false;
  const name = [button.getAttribute("aria-label"), button.getAttribute("data-testid"), button.getAttribute("title")]
    .filter(Boolean).join(" ").trim();
  return DRAW_TOOL_LABEL.test(name);
}

/**
 * Phase 1: both modes preserve native Excalidraw freehand strokes.
 * Write is a distinct, persistent interaction mode; recognition and
 * conversion to editable handwriting are delivered in later phases.
 */
export default function SmartInkModePicker({ canvasRootRef, apiRef, canEdit, viewModeEnabled }) {
  const [menu, setMenu] = useState(null);
  const [mode, setMode] = useState("draw");
  const [preview, setPreview] = useState(null);
  const [recognizedText, setRecognizedText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const openPreview = useCallback(async (automaticStrokes = null) => {
    const api = apiRef?.current;
    const ids = api?.getAppState?.()?.selectedElementIds || {};
    const selected = Array.isArray(automaticStrokes) ? automaticStrokes : (api?.getSceneElements?.() || []).filter((el) => el.type === "freedraw" && !el.isDeleted && ids[el.id]);
    if (!selected.length) {
      setMessage("Select handwritten strokes with the selection tool first.");
      return;
    }
    if (requestRef.current) return;
    requestRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await recognizeInk(selected);
      setRecognizedText(result.text);
      setPreview(selected);
      if (!result.available) setMessage("Browser recognition unavailable. Enter the words manually.");
      else if (!result.text) setMessage("No words detected. Correct the text before applying.");
    } catch {
      setPreview(selected);
      setRecognizedText("");
      setMessage("Recognition failed. Enter the words manually; ink is unchanged.");
    } finally {
      requestRef.current = false;
      setBusy(false);
    }
  }, [apiRef]);
  const sessionRef = useRef({ baseline: new Set(), fingerprint: "", changedAt: 0, offered: false });
  const stateRef = useRef({ busy: false, preview: false });
  const requestRef = useRef(false);
  useEffect(() => { stateRef.current = { busy, preview: Boolean(preview) }; }, [busy, preview]);
  useEffect(() => {
    if (mode !== "write" || !canEdit || viewModeEnabled) return undefined;
    const poll = () => {
      if (stateRef.current.busy || stateRef.current.preview) return;
      const session = sessionRef.current;
      const strokes = (apiRef?.current?.getSceneElements?.() || []).filter((el) =>
        el.type === "freedraw" && !el.isDeleted && !session.baseline.has(el.id));
      if (!strokes.length) return;
      const fingerprint = strokes.map((el) => [el.id, el.version, el.points?.length].join(":")).join("|");
      if (fingerprint !== session.fingerprint) {
        session.fingerprint = fingerprint;
        session.changedAt = Date.now();
        session.offered = false;
      } else if (!session.offered && Date.now() - session.changedAt > 1400) {
        session.offered = true;
        strokes.forEach((el) => session.baseline.add(el.id));
        void openPreview(strokes);
      }
    };
    const interval = window.setInterval(poll, 300);
    return () => window.clearInterval(interval);
  }, [mode, canEdit, viewModeEnabled, apiRef, openPreview]);
  const applyPreview = useCallback(() => {
    const api = apiRef?.current;
    const current = api?.getSceneElements?.() || [];
    if (!preview?.length || !preview.every((el) => current.some((item) => item.id === el.id && !item.isDeleted))) {
      setMessage("Original ink changed. Select it again.");
      return;
    }
    if (beautifyInk(api, preview, recognizedText)) {
      setPreview(null);
      setRecognizedText("");
      setMessage("");
    }
  }, [apiRef, preview, recognizedText]);

  const chooseMode = useCallback((nextMode) => {
    if (nextMode === "write") sessionRef.current = { baseline: new Set((apiRef?.current?.getSceneElements?.() || []).map((el) => el.id)), fingerprint: "", changedAt: 0, offered: false };
    setMode(nextMode);
    setMenu(null);
    apiRef?.current?.setActiveTool?.({ type: "freedraw" });
  }, [apiRef]);

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !canEdit || viewModeEnabled) {
      setMenu(null);
      return undefined;
    }
    const onDrawClick = (event) => {
      const button = event.target instanceof Element ? event.target.closest("button, [role='button']") : null;
      if (!isNativeDrawButton(button) || !button.closest(".App-toolbar")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const rect = button.getBoundingClientRect();
      setMenu((current) => current ? null : {
        left: Math.min(Math.max(8, rect.left + rect.width / 2 - 107), Math.max(8, window.innerWidth - 222)),
        ...(rect.top >= 190
          ? { bottom: window.innerHeight - rect.top + 12 }
          : { top: rect.bottom + 12 }),
      });
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenu(null);
    };
    const onOutsideClick = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".sketchizi-smart-ink-menu")) return;
      if (event.target.closest(".App-toolbar") && isNativeDrawButton(event.target.closest("button, [role='button']"))) return;
      setMenu(null);
    };
    root.addEventListener("click", onDrawClick, true);
    document.addEventListener("pointerdown", onOutsideClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("click", onDrawClick, true);
      document.removeEventListener("pointerdown", onOutsideClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canvasRootRef, canEdit, viewModeEnabled]);

  if (!canEdit || viewModeEnabled) return null;
  return (
    <>
      {mode === "write" && <div className="sketchizi-smart-ink-indicator" role="status">
        <span>Write mode</span>
        <button type="button" disabled={busy} onClick={() => openPreview()}>{busy ? "Recognizing…" : "Beautify selected ink"}</button>
        {message && <span className="sketchizi-smart-ink-message">{message}</span>}
      </div>}
      {preview && createPortal(
        <div className="sketchizi-smart-ink-preview" role="dialog" aria-modal="true" aria-label="Review handwriting recognition">
          <h3>Review handwriting</h3>
          <p>Check the words before replacing selected ink. Your original remains until you apply.</p>
          <textarea aria-label="Recognized handwriting" value={recognizedText} onChange={(event) => setRecognizedText(event.target.value)} rows={4} placeholder="Type or correct your handwritten words" autoFocus />
          <div className="sketchizi-smart-ink-preview-actions">
            <button type="button" onClick={() => { setPreview(null); setMessage(""); }}>Keep original</button>
            <button type="button" disabled={!recognizedText.trim()} onClick={applyPreview}>Apply handwriting</button>
          </div>
        </div>, document.body
      )}
      {menu && createPortal(
        <div className="sketchizi-smart-ink-menu" role="menu" aria-label="Draw mode" style={menu}>
          <button type="button" role="menuitemradio" aria-checked={mode === "draw"} onClick={() => chooseMode("draw")}>
            <span aria-hidden="true">✎</span><span><strong>Freehand</strong><small>Freehand shapes and sketches</small></span>
            {mode === "draw" && <span aria-hidden="true">✓</span>}
          </button>
          <button type="button" role="menuitemradio" aria-checked={mode === "write"} onClick={() => chooseMode("write")}>
            <span aria-hidden="true">✍</span><span><strong>Write</strong><small>Preview clean handwriting after a pause</small></span>
            {mode === "write" && <span aria-hidden="true">✓</span>}
          </button>
        </div>, document.body
      )}
    </>
  );
}
