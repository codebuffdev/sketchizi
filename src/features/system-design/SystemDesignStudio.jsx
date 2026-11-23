import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import TopWorkspaceBar from "./TopWorkspaceBar.jsx";
import CollapsibleQuickDock from "./CollapsibleQuickDock.jsx";
import SystemDesignNodeOverlay from "./SystemDesignNodeOverlay.jsx";
import ContextualInspectorDrawer from "./ContextualInspectorDrawer.jsx";
import { readGraph } from "./sceneModel.js";
import { simulateTraffic } from "./trafficSimulator.js";
import "./systemDesign.css";

/** Thin integration boundary mounted by App.jsx inside the canvas region. */
export default function SystemDesignStudio({ workspace, saveStatus, canvasTabs, activeCanvasId, onSelectTab, onCreateTab, isDarkTheme }) {
  const { store, enabled, mode, simulate, loadRps, actions, canEdit } = workspace;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const rootRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const getHost = useCallback(() => rootRef.current?.parentElement?.querySelector(".excalidraw") || null, []);
  const graph = useMemo(() => readGraph(snapshot.elements), [snapshot.elements]);
  const simulation = useMemo(
    () => (simulate ? simulateTraffic({ nodes: graph.nodes, edges: graph.edges, totalRps: loadRps }) : null),
    [simulate, graph, loadRps],
  );

  // Keep the overlay aligned with the Excalidraw host even if the region is resized or offset.
  useLayoutEffect(() => {
    const host = getHost();
    const root = rootRef.current;
    if (!host || !root) return;
    const h = host.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const next = { x: Math.round(h.left - r.left), y: Math.round(h.top - r.top) };
    setOffset((current) => (current.x === next.x && current.y === next.y ? current : next));
  }, [getHost, snapshot.revision, enabled]);

  // Re-theme Excalidraw's selection/primary accents (default violet) while the studio is open: zero purple.
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const region = rootRef.current?.parentElement;
    region?.classList.add("sd-active");
    return () => region?.classList.remove("sd-active");
  }, [enabled]);

  const selection = useMemo(() => {
    if (snapshot.selectedIds.length !== 1) return null;
    const id = snapshot.selectedIds[0];
    const node = graph.nodes.find((n) => n.id === id);
    if (node) return { kind: "node", item: node };
    const edge = graph.edges.find((e) => e.id === id);
    return edge ? { kind: "edge", item: edge } : null;
  }, [snapshot.selectedIds, graph]);

  if (!enabled) return <div ref={rootRef} hidden />;

  return (
    <div ref={rootRef} className={`sd-root${isDarkTheme ? " is-dark" : ""}`} data-testid="system-design-studio" data-mode={mode}>
      <SystemDesignNodeOverlay graph={graph} simulation={simulation} simulate={simulate} mode={mode} snapshot={snapshot}
        offset={offset} getHost={getHost} actions={actions} canEdit={canEdit} />
      <TopWorkspaceBar canvasTabs={canvasTabs} activeCanvasId={activeCanvasId} onSelectTab={onSelectTab} onCreateTab={onCreateTab}
        saveStatus={saveStatus} mode={mode} onModeChange={workspace.setMode} simulate={simulate} onSimulateChange={workspace.setSimulate}
        loadRps={loadRps} onLoadChange={workspace.setLoadRps} snapEnabled={workspace.gridEnabled} onSnapChange={workspace.setGridEnabled}
        zoom={snapshot.zoom} onZoom={actions.setZoom} onClose={workspace.close} />
      <CollapsibleQuickDock pinned={workspace.dockPinned} onPinnedChange={workspace.setDockPinned} onAdd={actions.addNode}
        onAutoLayout={actions.autoLayout} canEdit={canEdit} />
      <ContextualInspectorDrawer selection={selection} mode={mode} simulation={simulation} simulate={simulate} actions={actions} canEdit={canEdit} />
    </div>
  );
}
