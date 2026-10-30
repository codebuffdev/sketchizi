import { useMemo, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

function layerLabel(element, index) {
  const customName = element?.customData?.sketchiziLayerName;
  if (typeof customName === "string" && customName.trim()) return customName.trim();
  if (element?.type === "text" && element.text?.trim()) return element.text.trim().split("\n")[0].slice(0, 42);
  const type = String(element?.type || "element").replace(/-/g, " ");
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} ${index + 1}`;
}

function LayersPanel({ apiRef, sceneElements = [], canEdit, onClose }) {
  const [revision, setRevision] = useState(0);
  const [renamingId, setRenamingId] = useState(null);
  const [draftName, setDraftName] = useState("");

  const elements = useMemo(() => {
    const live = Array.isArray(sceneElements) ? sceneElements : [];
    return live.map((element, index) => ({ element, index }))
      .filter(({ element }) => element && element.type !== "selection" && element.id)
      .reverse();
  }, [sceneElements, revision]);

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
      <header className="sketchizi-layers-header">
        <div><strong>Layers</strong><span>{elements.filter(({ element }) => !element.isDeleted).length} objects</span></div>
        <button type="button" onClick={onClose} aria-label="Close layers panel">×</button>
      </header>
      <div className="sketchizi-layers-list" role="list" aria-label="Diagram layers">
        {elements.length === 0 ? <div className="sketchizi-layers-empty">Your diagram layers will appear here.</div> : elements.map(({ element, index }) => {
          const label = layerLabel(element, index);
          return (
            <div className={`sketchizi-layer-row ${element.isDeleted ? "is-hidden" : ""} ${element.locked ? "is-locked" : ""}`} key={element.id} role="listitem">
              <button type="button" className="sketchizi-layer-select" onClick={() => selectLayer(element)} title={`Select ${label}`}>
                <span className="sketchizi-layer-type" aria-hidden="true">{String(element.type || "?").slice(0, 1).toUpperCase()}</span>
                {renamingId === element.id ? (
                  <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={() => renameLayer(element)} onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); renameLayer(element); }
                    if (event.key === "Escape") { event.preventDefault(); setRenamingId(null); }
                  }} onClick={(event) => event.stopPropagation()} aria-label="Layer name" />
                ) : <span className="sketchizi-layer-name">{label}</span>}
              </button>
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
