import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import { isSystemDesignEdge, isSystemDesignNode, readGraph } from "../../features/system-design/sceneModel.js";
import { simulateTraffic } from "../../features/system-design/trafficSimulator.js";
import { buildSystemDesignSvg, svgToCanvas } from "../../features/system-design/exportSystemDesignImage.js";

const EMPTY_SNAPSHOT = Object.freeze({ elements: [] });
const noopSubscribe = () => () => {};
const getEmptySnapshot = () => EMPTY_SNAPSHOT;

export default function ExportStudioModal({ isOpen, onClose, apiRef, filename = "architecture-diagram", isDarkTheme = true }) {
  const [scale, setScale] = useState(2);
  const [bgMode, setBgMode] = useState(isDarkTheme ? "dark" : "light");
  const [darkMode, setDarkMode] = useState(Boolean(isDarkTheme));
  useEffect(() => { if (isOpen) { setDarkMode(Boolean(isDarkTheme)); setBgMode(isDarkTheme ? "dark" : "light"); } }, [isOpen, isDarkTheme]);
  const [exportOnlySelected, setExportOnlySelected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const workspace = apiRef?.current?.systemDesignWorkspace;
  const activeTabId = workspace?.activeTabId;
  const activeTabState = workspace?.workspaceByTabId?.[activeTabId] || null;
  const activeTabEnabled = activeTabState?.active ?? workspace?.enabled;
  const activeTabMode = activeTabState?.studioMode || workspace?.mode || "canvas";
  const activeTabSimRunning = activeTabState?.simRunning ?? workspace?.simulate;
  const activeTabBaseRps = activeTabState?.baseRps ?? workspace?.loadRps ?? 0;
  const subscribe = workspace?.store?.subscribe || noopSubscribe;
  const getSnapshot = workspace?.store?.getSnapshot || getEmptySnapshot;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sceneElements = apiRef?.current?.getSceneElements?.() || [];
  const systemGraph = useMemo(() => workspace ? (activeTabEnabled ? readGraph(snapshot.elements) : { nodes: [], edges: [] }) : readGraph(sceneElements), [workspace, activeTabEnabled, snapshot.elements, sceneElements]);
  const simulation = useMemo(() => systemGraph.nodes.length ? simulateTraffic({
    nodes: systemGraph.nodes, edges: systemGraph.edges,
    totalRps: activeTabSimRunning ? activeTabBaseRps : 0,
  }) : null, [systemGraph, activeTabSimRunning, activeTabBaseRps]);
  const mode = activeTabMode;
  const systemSvg = useMemo(() => systemGraph.nodes.length ? buildSystemDesignSvg({
    ...systemGraph, simulation, mode, background: bgMode, darkMode, padding: 24,
  }) : "", [systemGraph, simulation, mode, bgMode, darkMode]);

  if (!isOpen) return null;

  const getExportData = () => {
    const api = apiRef?.current;
    if (!api) return null;
    const allElements = api.getSceneElements?.() || [];
    const appState = api.getAppState?.() || {};
    const selectedIds = new Set(Object.entries(appState.selectedElementIds || {}).filter(([, selected]) => selected).map(([id]) => id));
    const elements = exportOnlySelected && selectedIds.size
      ? allElements.filter((element) => selectedIds.has(element.id))
      : allElements.filter((element) => !element.isDeleted && !element.deleted);
    return {
      elements,
      appState: { ...appState, exportBackground: bgMode !== "transparent", viewBackgroundColor: bgMode === "dark" ? "#12141c" : "#ffffff", exportScale: scale, exportPadding: 24 },
      files: api.getFiles?.() || {},
    };
  };

  const getCombinedSystemSvg = async () => {
    const data = getExportData();
    if (!data?.elements.length) throw new Error("No elements to export");
    const nativeElements = data.elements.filter((element) => !isSystemDesignNode(element) && !isSystemDesignEdge(element));
    const overlayGraph = exportOnlySelected
      ? { nodes: systemGraph.nodes.filter((node) => data.elements.some((element) => element.id === node.id)),
          edges: systemGraph.edges.filter((edge) => data.elements.some((element) => element.id === edge.from) && data.elements.some((element) => element.id === edge.to)) }
      : systemGraph;
    const overlay = buildSystemDesignSvg({
      ...overlayGraph, simulation, mode,
      background: nativeElements.length ? "transparent" : bgMode,
      darkMode, padding: 24,
    });
    if (!nativeElements.length) return overlay;
    const nativeSvg = await exportToSvg({ elements: nativeElements, appState: data.appState, files: data.files });
    const nativeMarkup = new XMLSerializer().serializeToString(nativeSvg);
    if (!overlay) return nativeMarkup;
    const inner = overlay.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    const nativeBox = nativeMarkup.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/[\s,]+/).map(Number);
    const overlayBox = overlay.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/[\s,]+/).map(Number);
    if (!nativeBox || !overlayBox || nativeBox.length !== 4 || overlayBox.length !== 4) {
      return nativeMarkup.replace(/<\/svg>\s*$/, "<g>" + inner + "</g></svg>");
    }
    const minX = Math.min(nativeBox[0], overlayBox[0]);
    const minY = Math.min(nativeBox[1], overlayBox[1]);
    const maxX = Math.max(nativeBox[0] + nativeBox[2], overlayBox[0] + overlayBox[2]);
    const maxY = Math.max(nativeBox[1] + nativeBox[3], overlayBox[1] + overlayBox[3]);
    const width = maxX - minX;
    const height = maxY - minY;
    const root = nativeMarkup.match(/^<svg\b[^>]*>/)?.[0];
    if (!root) throw new Error("Unable to compose exported SVG");
    const expandedRoot = root.replace(/\swidth="[^"]*"/i, "").replace(/\sheight="[^"]*"/i, "").replace(/\sviewBox="[^"]*"/i, "")
      .replace(/>$/, ' width="' + width + '" height="' + height + '" viewBox="' + minX + " " + minY + " " + width + " " + height + '">');
    return nativeMarkup.replace(root, expandedRoot).replace(/<\/svg>\s*$/, "<g>" + inner + "</g></svg>");
  };

  const makePng = async () => {
    if (systemSvg) {
      const combinedSvg = await getCombinedSystemSvg();
      const canvas = await svgToCanvas(combinedSvg, scale);
      return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to encode PNG")), "image/png"));
    }
    const data = getExportData();
    if (!data?.elements.length) throw new Error("No elements to export");
    return exportToBlob({ elements: data.elements, appState: data.appState, files: data.files, mimeType: "image/png" });
  };
  const downloadBlob = (blob, extension) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = extension === "png" ? `${filename}_${scale}x.png` : `${filename}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const handleCopyToClipboard = async () => {
    setBusy(true); setStatusMessage("Generating image…");
    try {
      const blob = await makePng();
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error("Clipboard API not supported in this browser");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatusMessage("✓ Copied PNG to clipboard!");
    } catch (error) { console.error(error); setStatusMessage(error.message === "Clipboard API not supported in this browser" ? error.message : "Failed to copy image"); }
    finally { setBusy(false); }
  };
  const handleDownloadPng = async () => {
    setBusy(true);
    try { downloadBlob(await makePng(), "png"); setStatusMessage("✓ PNG downloaded"); }
    catch (error) { console.error(error); setStatusMessage("Failed to download PNG"); }
    finally { setBusy(false); }
  };
  const handleDownloadSvg = async () => {
    setBusy(true);
    try {
      let blob;
      if (systemSvg) blob = new Blob([await getCombinedSystemSvg()], { type: "image/svg+xml;charset=utf-8" });
      else {
        const data = getExportData();
        if (!data?.elements.length) throw new Error("No elements to export");
        const svg = await exportToSvg({ elements: data.elements, appState: data.appState, files: data.files });
        blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
      }
      downloadBlob(blob, "svg"); setStatusMessage("✓ SVG downloaded");
    } catch (error) { console.error(error); setStatusMessage("Failed to download SVG"); }
    finally { setBusy(false); }
  };
  const handleCopyMarkdown = () => {
    navigator.clipboard?.writeText(`![${filename}](./${filename}.png)`);
    setStatusMessage("✓ Copied Markdown snippet!");
  };

  return (
    <div className="sketchizi-export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sketchizi-export-modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
        <div className="sketchizi-export-header">
          <div><h2 id="export-modal-title">Export Studio</h2><p>Generate high-resolution PNGs, SVGs, or copy directly to Slack/Notion.</p></div>
          <button type="button" className="sketchizi-modal-close" onClick={onClose} aria-label="Close export studio">×</button>
        </div>
        <div className="sketchizi-export-body">
          <div className="sketchizi-export-control-group"><label className="sketchizi-export-label">Resolution Scale</label>
            <div className="sketchizi-export-pill-row">{[1, 2, 3].map((value) => <button key={value} type="button" className={`sketchizi-export-pill ${scale === value ? "is-active" : ""}`} onClick={() => setScale(value)}>{value}× {value === 2 ? "(Retina)" : value === 3 ? "(Ultra-HD)" : "(Standard)"}</button>)}</div>
          </div>
          <div className="sketchizi-export-control-group"><label className="sketchizi-export-label">Background</label>
            <div className="sketchizi-export-pill-row">{[{ id: "dark", label: "Dark Surface" }, { id: "light", label: "Light Surface" }, { id: "transparent", label: "Transparent" }].map((item) => <button key={item.id} type="button" className={`sketchizi-export-pill ${bgMode === item.id ? "is-active" : ""}`} onClick={() => setBgMode(item.id)}>{item.label}</button>)}</div>
          </div>
          <div className="sketchizi-export-control-group"><label className="sketchizi-export-checkbox-label"><input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} /><span>Dark mode rendering</span></label></div>
          {systemSvg && <div className="sketchizi-export-control-group"><label className="sketchizi-export-label">Diagram preview</label><div className="sketchizi-system-export-preview" style={{ background: bgMode === "transparent" ? "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 16px 16px" : bgMode === "dark" ? "#12141c" : "#fff" }} dangerouslySetInnerHTML={{ __html: systemSvg }} /></div>}
          <div className="sketchizi-export-control-group"><label className="sketchizi-export-checkbox-label"><input type="checkbox" checked={exportOnlySelected} onChange={(event) => setExportOnlySelected(event.target.checked)} /><span>Export selected elements only</span></label></div>
          <div className="sketchizi-export-primary-action"><button type="button" className="sketchizi-export-copy-btn" onClick={handleCopyToClipboard} disabled={busy}><span>Copy Image to Clipboard</span></button></div>
          <div className="sketchizi-export-downloads-row"><button type="button" className="sketchizi-export-sub-btn" onClick={handleDownloadPng} disabled={busy}>Download PNG</button><button type="button" className="sketchizi-export-sub-btn" onClick={handleDownloadSvg} disabled={busy}>Download SVG</button><button type="button" className="sketchizi-export-sub-btn" onClick={handleCopyMarkdown}>Copy Markdown</button></div>
          {statusMessage && <div className="sketchizi-export-status" role="status">{statusMessage}</div>}
        </div>
      </section>
    </div>
  );
}
