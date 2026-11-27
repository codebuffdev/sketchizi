import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "./imageSizePolicy.js";
import "./imageImport.css";

export default function ImageSizeLimitModal({ prompt, isDarkTheme = false, onShrink, onCancel }) {
  const primaryRef = useRef(null);
  const open = Boolean(prompt);

  useEffect(() => {
    if (!open) return undefined;
    primaryRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!prompt) return null;
  const { file, maxBytes, isAdmin, busy } = prompt;

  return createPortal(
    <div
      className={`image-limit-backdrop${isDarkTheme ? " theme-dark" : ""}`}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}
    >
      <section
        className="image-limit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="image-limit-title"
        aria-describedby="image-limit-message"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <h2 id="image-limit-title" className="image-limit-title">Image Exceeds Size Limit</h2>
        <dl className="image-limit-details">
          <div><dt>File</dt><dd title={file.name}>{file.name}</dd></div>
          <div><dt>Original size</dt><dd>{formatBytes(file.size)}</dd></div>
          <div><dt>{isAdmin ? "Admin limit" : "Your limit"}</dt><dd>{formatBytes(maxBytes)}</dd></div>
        </dl>
        <p id="image-limit-message" className="image-limit-message">
          Would you like to automatically optimize this image to fit within your {formatBytes(maxBytes)} limit?
          Sharpness is preserved first; the image is only scaled down if it still doesn’t fit.
        </p>
        <div className="image-limit-actions">
          <button type="button" className="image-limit-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="image-limit-button is-primary" ref={primaryRef} onClick={onShrink} disabled={busy} aria-busy={busy}>
            {busy ? "Optimizing…" : "Shrink & Import"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
