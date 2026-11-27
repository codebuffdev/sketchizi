import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "./imageSizePolicy.js";
import "./imageImport.css";

/** Shown when a Save to Cloud would exceed the account's cloud limit. Reuses the image-limit dialog theme. */
export default function CloudOptimizeModal({ prompt, isDarkTheme = false, onShrink, onKeepLocal }) {
  const primaryRef = useRef(null);
  const open = Boolean(prompt);

  useEffect(() => {
    if (!open) return undefined;
    primaryRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onKeepLocal(); }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onKeepLocal]);

  if (!prompt) return null;
  const { totalBytes, maxBytes, isAdmin, images = [], feasible = true, busy, progress } = prompt;
  const limitLabel = isAdmin ? "Admin limit" : "limit";

  return createPortal(
    <div
      className={`image-limit-backdrop${isDarkTheme ? " theme-dark" : ""}`}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onKeepLocal(); }}
    >
      <section
        className="image-limit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cloud-optimize-title"
        aria-describedby="cloud-optimize-message"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <h2 id="cloud-optimize-title" className="image-limit-title">Optimize Images to Save to Cloud</h2>
        <dl className="image-limit-details">
          <div>
            <dt>Diagram size</dt>
            <dd>{formatBytes(totalBytes)} → exceeds {formatBytes(maxBytes)} {limitLabel}</dd>
          </div>
          {images.map((image) => (
            <div key={image.id}>
              <dt>Oversized image</dt>
              <dd>{formatBytes(image.decodedBytes)}</dd>
            </div>
          ))}
        </dl>
        <p id="cloud-optimize-message" className="image-limit-message">
          {feasible
            ? `Cloud Workspace accepts diagrams up to ${formatBytes(maxBytes)}. Shrinking keeps the original pixel dimensions where possible, preserves transparency and layout, and only scales an image down if it still doesn’t fit. Your local copy stays untouched until you save.`
            : `Even with every embedded image optimized this diagram cannot fit in ${formatBytes(maxBytes)}. You can keep it saved locally only.`}
        </p>
        <div className="image-limit-actions">
          <button type="button" className="image-limit-button" onClick={onKeepLocal}>
            {busy ? "Cancel" : "Keep Local Only"}
          </button>
          {feasible && (
            <button type="button" className="image-limit-button is-primary" ref={primaryRef} onClick={onShrink} disabled={busy} aria-busy={busy}>
              {busy ? `Optimizing${progress ? ` ${progress}` : ""}…` : "Shrink Images & Save to Cloud"}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
