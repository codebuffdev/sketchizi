import React, { useState } from "react";
import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";

export default function ExportStudioModal({ isOpen, onClose, apiRef, filename = "architecture-diagram" }) {
  const [scale, setScale] = useState(2);
  const [bgMode, setBgMode] = useState("dark"); // "transparent" | "dark" | "light"
  const [exportOnlySelected, setExportOnlySelected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const getExportElementsAndState = () => {
    const api = apiRef?.current;
    if (!api) return null;

    const allElements = api.getSceneElements?.() || [];
    const appState = api.getAppState?.() || {};
    const selectedIds = new Set(
      Object.entries(appState.selectedElementIds || {})
        .filter(([, selected]) => selected)
        .map(([id]) => id)
    );

    const elements = exportOnlySelected && selectedIds.size > 0
      ? allElements.filter((el) => selectedIds.has(el.id))
      : allElements.filter((el) => !el.isDeleted && !el.deleted);

    const exportBackground = bgMode !== "transparent";
    const viewBackgroundColor = bgMode === "dark" ? "#12141c" : "#ffffff";

    return {
      elements,
      appState: {
        ...appState,
        exportBackground,
        viewBackgroundColor,
        exportScale: scale,
        exportPadding: 24,
      },
      files: api.getFiles?.() || {},
    };
  };

  const handleCopyToClipboard = async () => {
    setBusy(true);
    setStatusMessage("Generating image…");
    try {
      const data = getExportElementsAndState();
      if (!data || data.elements.length === 0) {
        setStatusMessage("No elements to export");
        return;
      }

      const blob = await exportToBlob({
        elements: data.elements,
        appState: data.appState,
        files: data.files,
        mimeType: "image/png",
      });

      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setStatusMessage("✓ Copied PNG to clipboard!");
      } else {
        setStatusMessage("Clipboard API not supported in this browser");
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Failed to copy image");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPng = async () => {
    setBusy(true);
    try {
      const data = getExportElementsAndState();
      if (!data) return;

      const blob = await exportToBlob({
        elements: data.elements,
        appState: data.appState,
        files: data.files,
        mimeType: "image/png",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}_${scale}x.png`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage("✓ PNG downloaded");
    } catch (err) {
      console.error(err);
      setStatusMessage("Failed to download PNG");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSvg = async () => {
    setBusy(true);
    try {
      const data = getExportElementsAndState();
      if (!data) return;

      const svg = await exportToSvg({
        elements: data.elements,
        appState: data.appState,
        files: data.files,
      });

      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.svg`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage("✓ SVG downloaded");
    } catch (err) {
      console.error(err);
      setStatusMessage("Failed to download SVG");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyMarkdown = () => {
    const md = `![${filename}](./${filename}.png)`;
    navigator.clipboard?.writeText(md);
    setStatusMessage("✓ Copied Markdown snippet!");
  };

  return (
    <div className="sketchizi-export-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sketchizi-export-modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
        <div className="sketchizi-export-header">
          <div>
            <h2 id="export-modal-title">Export Studio</h2>
            <p>Generate high-resolution PNGs, SVGs, or copy directly to Slack/Notion.</p>
          </div>
          <button type="button" className="sketchizi-modal-close" onClick={onClose} aria-label="Close export studio">×</button>
        </div>

        <div className="sketchizi-export-body">
          {/* Resolution Multiplier */}
          <div className="sketchizi-export-control-group">
            <label className="sketchizi-export-label">Resolution Scale</label>
            <div className="sketchizi-export-pill-row">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`sketchizi-export-pill ${scale === s ? "is-active" : ""}`}
                  onClick={() => setScale(s)}
                >
                  {s}× {s === 2 ? "(Retina)" : s === 3 ? "(Ultra-HD)" : "(Standard)"}
                </button>
              ))}
            </div>
          </div>

          {/* Background Mode */}
          <div className="sketchizi-export-control-group">
            <label className="sketchizi-export-label">Background</label>
            <div className="sketchizi-export-pill-row">
              {[
                { id: "dark", label: "Dark Surface" },
                { id: "light", label: "Light Surface" },
                { id: "transparent", label: "Transparent" },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`sketchizi-export-pill ${bgMode === b.id ? "is-active" : ""}`}
                  onClick={() => setBgMode(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope Toggle */}
          <div className="sketchizi-export-control-group">
            <label className="sketchizi-export-checkbox-label">
              <input
                type="checkbox"
                checked={exportOnlySelected}
                onChange={(e) => setExportOnlySelected(e.target.checked)}
              />
              <span>Export selected elements only</span>
            </label>
          </div>

          {/* Action Row */}
          <div className="sketchizi-export-primary-action">
            <button
              type="button"
              className="sketchizi-export-copy-btn"
              onClick={handleCopyToClipboard}
              disabled={busy}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy Image to Clipboard</span>
            </button>
          </div>

          <div className="sketchizi-export-downloads-row">
            <button type="button" className="sketchizi-export-sub-btn" onClick={handleDownloadPng} disabled={busy}>
              Download PNG
            </button>
            <button type="button" className="sketchizi-export-sub-btn" onClick={handleDownloadSvg} disabled={busy}>
              Download SVG
            </button>
            <button type="button" className="sketchizi-export-sub-btn" onClick={handleCopyMarkdown}>
              Copy Markdown
            </button>
          </div>

          {statusMessage && (
            <div className="sketchizi-export-status" role="status">
              {statusMessage}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
