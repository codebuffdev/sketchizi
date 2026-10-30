import { useMemo, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

const GROUP_NAME_KEY = "sketchiziGroupNames";

function layerLabel(element, index) {
  const customName = element?.customData?.sketchiziLayerName;
  if (typeof customName === "string" && customName.trim()) return customName.trim();
  if (element?.type === "text" && element.text?.trim()) return element.text.trim().split("\n")[0].slice(0, 42);
  const type = String(element?.type || "element").replace(/-/g, " ");
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} ${index + 1}`;
}

function groupName(element, groupId, index) {
  const name = element?.customData?.[GROUP_NAME_KEY]?.[groupId];
  return typeof name === "string" && name.trim() ? name.trim() : `Group ${index + 1}`;
}

function buildLayerTree(elements) {
  const root = { id: "root", children: [], elements: [] };
  const groups = new Map();
  elements.forEach(({ element, index }) => {
    let parent = root;
    const path = Array.isArray(element.groupIds) ? element.groupIds : [];
    path.forEach((groupId, depth) => {
      const key = `${parent.id}/${groupId}`;
      let node = groups.get(key);
      if (!node) {
        node = { id: key, groupId, parent, children: [], elements: [], depth, label: groupName(element, groupId, depth) };
        groups.set(key, node);
        parent.children.push(node);
      }
      node.elements.push(element);
      parent = node;
    });
    parent.children.push({ id: element.id, element, index, depth: path.length, children: [], elements: [element] });
  });
  const sort = (node) => {
    node.children.sort((a, b) => {
      const ai = a.element ? a.index : Math.min(...a.elements.map((el) => elements.findIndex((entry) => entry.element.id === el.id)));
      const bi = b.element ? b.index : Math.min(...b.elements.map((el) => elements.findIndex((entry) => entry.element.id === el.id)));
      return bi - ai;
    });
    node.children.forEach((child) => { if (child.children.length) sort(child); });
  };
  sort(root);
  return root.children;
}

function LayersPanel({ apiRef, sceneElements = [], selectedElements = [], canEdit, autoOpen = true, onAutoOpenChange, onClose }) {
  const [revision, setRevision] = useState(0);
  const [renamingId, setRenamingId] = useState(null);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
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
    if (resizeStateRef.current?.pointerId === event.pointerId) resizePanel(event.clientX);
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
    workspace.style.setProperty("--sketchizi-desktop-context-width", `${Math.max(260, Math.min(560, current + (event.key === "ArrowLeft" ? 24 : -24)))}px`);
  };

  const elements = useMemo(() => (Array.isArray(sceneElements) ? sceneElements : [])
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element && element.type !== "selection" && element.id)
    .reverse(), [sceneElements, revision]);
  const tree = useMemo(() => buildLayerTree(elements), [elements]);
  const selectedIds = new Set(selectedElements.map((element) => element?.id).filter(Boolean));
  const liveElements = elements.filter(({ element }) => !element.isDeleted);
  const matchingIds = query.trim()
    ? new Set(elements.filter(({ element, index }) => `${layerLabel(element, index)} ${element.type || ""}`.toLowerCase().includes(query.trim().toLowerCase())).map(({ element }) => element.id))
    : null;

  const updateElements = (nextElements) => {
    const api = apiRef.current;
    if (!api?.updateScene || !canEdit) return;
    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setRevision((value) => value + 1);
  };
  const selectIds = (ids, additive = false) => {
    const api = apiRef.current;
    if (!api?.updateScene) return;
    const next = additive ? Object.fromEntries([...selectedIds, ...ids].map((id) => [id, true])) : Object.fromEntries(ids.map((id) => [id, true]));
    api.updateScene({ appState: { selectedElementIds: next }, captureUpdate: CaptureUpdateAction.NEVER });
  };
  const selectLayer = (element, event) => selectIds([element.id], event?.shiftKey || event?.ctrlKey || event?.metaKey);
  const selectGroup = (node) => selectIds(node.elements.filter((element) => !element.isDeleted).map((element) => element.id));

  const saveElementName = (element) => {
    if (renamingId !== element.id) return;
    const name = draftName.trim();
    if (name) {
      const current = apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [];
      updateElements(current.map((item) => item.id === element.id ? { ...item, customData: { ...(item.customData || {}), sketchiziLayerName: name } } : item));
    }
    setRenamingId(null);
  };
  const saveGroupName = (node) => {
    if (!draftName.trim()) { setRenamingGroup(false); return; }
    const memberIds = new Set(node.elements.map((element) => element.id));
    const current = apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [];
    updateElements(current.map((item) => {
      if (!memberIds.has(item.id)) return item;
      const names = { ...(item.customData?.[GROUP_NAME_KEY] || {}), [node.groupId]: draftName.trim() };
      return { ...item, customData: { ...(item.customData || {}), [GROUP_NAME_KEY]: names } };
    }));
    setRenamingGroup(false);
  };

  const createGroup = () => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    const current = apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [];
    const groupId = globalThis.crypto?.randomUUID?.() || `sketchizi-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const groupNumber = current.reduce((count, item) => Math.max(count, Object.keys(item.customData?.[GROUP_NAME_KEY] || {}).length), 0) + 1;
    updateElements(current.map((item) => ids.includes(item.id) ? {
      ...item,
      groupIds: [...(Array.isArray(item.groupIds) ? item.groupIds : []), groupId],
      customData: { ...(item.customData || {}), [GROUP_NAME_KEY]: { ...(item.customData?.[GROUP_NAME_KEY] || {}), [groupId]: `Group ${groupNumber}` } },
    } : item));
    setCollapsedGroups((currentState) => ({ ...currentState, [groupId]: false }));
  };
  const ungroupSelection = () => {
    if (!selectedIds.size) return;
    const current = apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [];
    updateElements(current.map((item) => {
      if (!selectedIds.has(item.id) || !Array.isArray(item.groupIds) || !item.groupIds.length) return item;
      const groupId = item.groupIds[item.groupIds.length - 1];
      const groupIds = item.groupIds.slice(0, -1);
      const names = { ...(item.customData?.[GROUP_NAME_KEY] || {}) };
      delete names[groupId];
      const customData = { ...(item.customData || {}) };
      if (Object.keys(names).length) customData[GROUP_NAME_KEY] = names;
      else delete customData[GROUP_NAME_KEY];
      return { ...item, groupIds, customData };
    }));
  };
  const toggleGroupFlag = (node, flag) => {
    const memberIds = new Set(node.elements.map((element) => element.id));
    const current = apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [];
    const visible = node.elements.some((element) => !element[flag]);
    updateElements(current.map((item) => memberIds.has(item.id) ? { ...item, [flag]: flag === "isDeleted" ? visible : visible } : item));
  };
  const toggleLayerFlag = (element, flag) => {
    const current = apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [];
    updateElements(current.map((item) => item.id === element.id ? { ...item, [flag]: !item[flag] } : item));
  };
  const moveLayer = (element, direction) => {
    const current = [...(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [])];
    const index = current.findIndex((item) => item.id === element.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    updateElements(current);
  };

  const renderNode = (node) => {
    if (node.element) {
      const { element, index, depth } = node;
      const label = layerLabel(element, index);
      if (matchingIds && !matchingIds.has(element.id)) return null;
      return <div className={`sketchizi-layer-row sketchizi-layer-tree-object ${element.isDeleted ? "is-hidden" : ""} ${element.locked ? "is-locked" : ""} ${selectedIds.has(element.id) ? "is-selected" : ""}`} key={element.id} role="listitem" style={{ "--layer-depth": depth }}>
        <div role="button" tabIndex={0} aria-pressed={selectedIds.has(element.id)} className="sketchizi-layer-select" onClick={(event) => selectLayer(element, event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectLayer(element, event); } }} title={`Select ${label}`}>
          <span className="sketchizi-layer-type" aria-hidden="true">{String(element.type || "?").slice(0, 1).toUpperCase()}</span>
          {renamingId === element.id ? <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={() => saveElementName(element)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") saveElementName(element); if (event.key === "Escape") setRenamingId(null); }} onClick={(event) => event.stopPropagation()} aria-label="Layer name" /> : <span className="sketchizi-layer-name">{label}</span>}
        </div>
        <div className="sketchizi-layer-actions">
          {canEdit && <button type="button" onClick={() => { setRenamingId(element.id); setDraftName(label); }} title="Rename layer" aria-label={`Rename ${label}`}>✎</button>}
          <button type="button" onClick={() => toggleLayerFlag(element, "isDeleted")} title={element.isDeleted ? "Show layer" : "Hide layer"} aria-label={element.isDeleted ? "Show layer" : "Hide layer"}>{element.isDeleted ? "◌" : "◉"}</button>
          {canEdit && <button type="button" onClick={() => toggleLayerFlag(element, "locked")} title={element.locked ? "Unlock layer" : "Lock layer"} aria-label={element.locked ? "Unlock layer" : "Lock layer"}>{element.locked ? "▣" : "▢"}</button>}
          {canEdit && <button type="button" onClick={() => moveLayer(element, -1)} title="Move backward" aria-label="Move layer backward">↓</button>}
          {canEdit && <button type="button" onClick={() => moveLayer(element, 1)} title="Move forward" aria-label="Move layer forward">↑</button>}
        </div>
      </div>;
    }
    const children = node.children.map(renderNode).filter(Boolean);
    if (matchingIds && !children.length) return null;
    const collapsed = Boolean(collapsedGroups[node.groupId]) && !matchingIds;
    const allHidden = node.elements.every((element) => element.isDeleted);
    const allLocked = node.elements.every((element) => element.locked);
    return <div className="sketchizi-layer-tree-group" key={node.id} style={{ "--layer-depth": node.depth }}>
      <div className={`sketchizi-layer-row sketchizi-layer-group-row ${selectedIds.size && node.elements.every((element) => selectedIds.has(element.id)) ? "is-selected" : ""} ${allHidden ? "is-hidden" : ""}`}>
        <button type="button" className="sketchizi-layer-expand" aria-label={collapsed ? `Expand ${node.label}` : `Collapse ${node.label}`} aria-expanded={!collapsed} onClick={() => setCollapsedGroups((state) => ({ ...state, [node.groupId]: !state[node.groupId] }))}>{collapsed ? "▸" : "▾"}</button>
        <button type="button" className="sketchizi-layer-group-select" onClick={() => selectGroup(node)} title={`Select all objects in ${node.label}`}>
          <span className="sketchizi-layer-group-icon" aria-hidden="true">▰</span>
          {renamingGroup && renamingId === node.groupId ? <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={() => saveGroupName(node)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") saveGroupName(node); if (event.key === "Escape") setRenamingGroup(false); }} onClick={(event) => event.stopPropagation()} aria-label="Group name" /> : <span className="sketchizi-layer-name">{node.label}</span>}
          <small>{node.elements.length}</small>
        </button>
        <div className="sketchizi-layer-actions">
          {canEdit && <button type="button" onClick={() => { setRenamingId(node.groupId); setRenamingGroup(true); setDraftName(node.label); }} title="Rename group" aria-label={`Rename ${node.label}`}>✎</button>}
          <button type="button" onClick={() => toggleGroupFlag(node, "isDeleted")} title={allHidden ? "Show group" : "Hide group"} aria-label={allHidden ? "Show group" : "Hide group"}>{allHidden ? "◌" : "◉"}</button>
          {canEdit && <button type="button" onClick={() => toggleGroupFlag(node, "locked")} title={allLocked ? "Unlock group" : "Lock group"} aria-label={allLocked ? "Unlock group" : "Lock group"}>{allLocked ? "▣" : "▢"}</button>}
        </div>
      </div>
      {!collapsed && <div className="sketchizi-layer-tree-children" role="group" aria-label={node.label}>{children}</div>}
    </div>;
  };

  return <section className="sketchizi-layers-panel" aria-label="Layers">
    <div ref={resizeRef} className="sketchizi-layers-resize-handle" role="separator" aria-label="Resize Layers panel" aria-orientation="vertical" aria-valuemin={260} aria-valuemax={560} tabIndex={0} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerEnd} onPointerCancel={handleResizePointerEnd} onKeyDown={handleResizeKeyDown}><span /></div>
    <header className="sketchizi-layers-header"><div><strong>Layers</strong><span>{liveElements.length} objects · {tree.length} top-level items</span></div><button type="button" onClick={onClose} aria-label="Close layers panel">×</button></header>
    <label className="sketchizi-layers-auto-open"><span className="sketchizi-layers-auto-open-copy"><strong>Auto-open Layers</strong><small>Show the panel whenever you add an object</small></span>
      <button type="button" className={`sketchizi-layers-auto-open-button ${autoOpen ? "is-active" : ""}`} role="switch" aria-checked={autoOpen} aria-label="Keep Layers open when drawing" title={autoOpen ? "Auto-open Layers is on" : "Auto-open Layers is off"} onClick={() => onAutoOpenChange?.(!autoOpen)}>
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2.75" y="3.25" width="14.5" height="13.5" rx="2.25" /><path d="M2.75 7h14.5M6 5.1h.01M8.5 5.1h.01" /><path className="auto-open-mark" d="M10 11.25h5M12.5 8.75v5" /></svg>
      </button>
    </label>
    <label className="sketchizi-layers-search"><span className="sketchizi-layers-search-icon" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search layers by name or type" aria-label="Search layers" />{query && <button type="button" className="sketchizi-layers-search-clear" onClick={() => setQuery("")} aria-label="Clear layer search">×</button>}</label>
    <div className="sketchizi-layers-tree-toolbar">
      <span>Hierarchy</span>
      <div>
        {canEdit && <button type="button" disabled={selectedIds.size < 2} onClick={createGroup} title="Group selected objects">Group</button>}
        {canEdit && <button type="button" disabled={!selectedElements.some((element) => element.groupIds?.length)} onClick={ungroupSelection} title="Ungroup selected objects">Ungroup</button>}
      </div>
    </div>
    <div className="sketchizi-layers-list sketchizi-layers-tree" role="tree" aria-label="Diagram layers">
      {!elements.length ? <div className="sketchizi-layers-empty">Your diagram layers will appear here.</div> : matchingIds && !matchingIds.size ? <div className="sketchizi-layers-empty">No layers match your search.</div> : tree.map(renderNode)}
    </div>
    <footer className="sketchizi-layers-footer">Select · Shift/Ctrl-click to multi-select · Group to nest objects</footer>
  </section>;
}

export default LayersPanel;
