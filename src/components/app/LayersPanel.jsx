import { useMemo, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

function layerLabel(element, index) {
  const customName = element?.customData?.sketchiziLayerName;
  if (typeof customName === "string" && customName.trim()) return customName.trim();
  if (element?.type === "text" && element.text?.trim()) return element.text.trim().split("\n")[0].slice(0, 42);
  const type = String(element?.type || "element").replace(/-/g, " ");
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} ${index + 1}`;
}

function LayersPanel({ apiRef, sceneElements = [], selectedElements = [], canEdit, autoOpen = true, onAutoOpenChange, onClose }) {
  const [revision, setRevision] = useState(0);
  const [renamingId, setRenamingId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [query, setQuery] = useState("");
  const resizeRef = useRef(null);
  const resizeStateRef = useRef(null);

  const resizePanel = (clientX) => {
    const workspace = resizeRef.current?.closest(".desktop-workspace");
    if (!workspace) return;
    const bounds = workspace.getBoundingClientRect();
    const width = Math.max(260, Math.min(560, bounds.right - clientX));
    workspace.style.setProperty("--sketchizi-desktop-context-width", `${width}px`);
  };

  const handleResizePointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = { pointerId: event.pointerId };
    resizePanel(event.clientX);
  };

  const handleResizePointerMove = (event) => {
    if (resizeStateRef.current?.pointerId !== event.pointerId) return;
    resizePanel(event.clientX);
  };

  const handleResizePointerEnd = (event) => {
    if (resizeStateRef.current?.pointerId !== event.pointerId) return;
    resizeStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const workspace = resizeRef.current?.closest(".desktop-workspace");
    if (!workspace) return;
    const current = Number.parseFloat(getComputedStyle(workspace).getPropertyValue("--sketchizi-desktop-context-width")) || 320;
    const next = Math.max(260, Math.min(560, current + (event.key === "ArrowLeft" ? 24 : -24)));
    workspace.style.setProperty("--sketchizi-desktop-context-width", `${next}px`);
  };

  const elements = useMemo(() => {
    const live = Array.isArray(sceneElements) ? sceneElements : [];
    return live.map((element, index) => ({ element, index }))
      .filter(({ element }) => element && element.type !== "selection" && element.id)
      .reverse();
  }, [sceneElements, revision]);

  const selectedIds = new Set(selectedElements.map((element) => element?.id).filter(Boolean));
  const filteredElements = elements.filter(({ element, index }) => {
    const needle = query.trim().toLowerCase();
    return !needle || `${layerLabel(element, index)} ${element.type || ""}`.toLowerCase().includes(needle);
  });

  const updateElements = (nextElements) => {
    const api = apiRef.current;
    if (!api?.updateScene || !canEdit) return;
    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setRevision((value) => value + 1);
  };

  const selectLayer = (element) => {
    const api = apiRef.current;
    if (!api?.updateScene) return;
    api.updateScene({
      appState: { selectedElementIds: { [element.id]: true } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const renameLayer = (element) => {
    if (renamingId !== element.id) return;
    const name = draftName.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    const api = apiRef.current;
    const current = api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || [];
    updateElements(current.map((item) => item.id === element.id
      ? { ...item, customData: { ...(item.customData || {}), sketchiziLayerName: name } }
      : item));
    setRenamingId(null);
  };

  const toggleLayerFlag = (element, flag) => {
    const api = apiRef.current;
    const current = api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || [];
    updateElements(current.map((item) => item.id === element.id ? { ...item, [flag]: !item[flag] } : item));
  };

  const moveLayer = (element, direction) => {
    const api = apiRef.current;
    const current = [...(api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || [])];
    const index = current.findIndex((item) => item.id === element.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    updateElements(current);
  };

  return (
    <section className="sketchizi-layers-panel" aria-label="Layers">
      <div ref={resizeRef} className="sketchizi-layers-resize-handle" role="separator" aria-label="Resize Layers panel" aria-orientation="vertical" aria-valuemin={260} aria-valuemax={560} tabIndex={0} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerEnd} onPointerCancel={handleResizePointerEnd} onKeyDown={handleResizeKeyDown}><span /></div>
      <header className="sketchizi-layers-header">
        <div><strong>Layers</strong><span>{elements.filter(({ element }) => !element.isDeleted).length} objects</span></div>
        <button type="button" onClick={onClose} aria-label="Close layers panel">×</button>
      </header>
      <label className="sketchizi-layers-auto-open">
        <span className="sketchizi-layers-auto-open-copy">
          <strong>Auto-open Layers</strong>
          <small>Show the panel whenever you add an object</small>
        </span>
        <span className={`sketchizi-layers-auto-open-state ${autoOpen ? "is-on" : ""}`}>{autoOpen ? "On" : "Off"}</span>
        <input type="checkbox" role="switch" checked={autoOpen} onChange={(event) => onAutoOpenChange?.(event.target.checked)} aria-label="Keep Layers open when drawing" />
      </label>
      <label className="sketchizi-layers-search">
        <span className="sketchizi-layers-search-icon" aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search layers by name or type" aria-label="Search layers" />
        {query && <button type="button" className="sketchizi-layers-search-clear" onClick={() => setQuery("")} aria-label="Clear layer search">×</button>}
      </label>
      <div className="sketchizi-layers-list" role="list" aria-label="Diagram layers">
        {elements.length === 0 ? <div className="sketchizi-layers-empty">Your diagram layers will appear here.</div> : filteredElements.length === 0 ? <div className="sketchizi-layers-empty">No layers match your search.</div> : filteredElements.map(({ element, index }) => {
          const label = layerLabel(element, index);
          return (
            <div className={`sketchizi-layer-row ${element.isDeleted ? "is-hidden" : ""} ${element.locked ? "is-locked" : ""} ${selectedIds.has(element.id) ? "is-selected" : ""}`} key={element.id} role="listitem">
              <div role="button" tabIndex={0} aria-pressed={selectedIds.has(element.id)} className="sketchizi-layer-select" onClick={() => selectLayer(element)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectLayer(element); } }} title={`Select ${label}`}>
                <span className="sketchizi-layer-type" aria-hidden="true">{String(element.type || "?").slice(0, 1).toUpperCase()}</span>
                {renamingId === element.id ? (
                  <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={() => renameLayer(element)} onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") { event.preventDefault(); renameLayer(element); }
                    if (event.key === "Escape") { event.preventDefault(); setRenamingId(null); }
                  }} onClick={(event) => event.stopPropagation()} aria-label="Layer name" />
                ) : <span className="sketchizi-layer-name">{label}</span>}
              </div>
              <div className="sketchizi-layer-actions">
                {canEdit && <button type="button" onClick={() => { setRenamingId(element.id); setDraftName(label); }} title="Rename layer" aria-label={`Rename ${label}`}>✎</button>}
                <button type="button" onClick={() => toggleLayerFlag(element, "isDeleted")} title={element.isDeleted ? "Show layer" : "Hide layer"} aria-label={element.isDeleted ? "Show layer" : "Hide layer"}>{element.isDeleted ? "◌" : "◉"}</button>
                {canEdit && <button type="button" onClick={() => toggleLayerFlag(element, "locked")} title={element.locked ? "Unlock layer" : "Lock layer"} aria-label={element.locked ? "Unlock layer" : "Lock layer"}>{element.locked ? "▣" : "▢"}</button>}
                {canEdit && <button type="button" onClick={() => moveLayer(element, -1)} title="Move backward" aria-label="Move layer backward">↓</button>}
                {canEdit && <button type="button" onClick={() => moveLayer(element, 1)} title="Move forward" aria-label="Move layer forward">↑</button>}
              </div>
            </div>
          );
        })}
      </div>
      <footer className="sketchizi-layers-footer">Top layers appear first · Select an object to edit it</footer>
    </section>
  );
}

export default LayersPanel;
