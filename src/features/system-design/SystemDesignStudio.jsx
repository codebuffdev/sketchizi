import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import TopWorkspaceBar from "./TopWorkspaceBar.jsx";
import CollapsibleQuickDock from "./CollapsibleQuickDock.jsx";
import SystemDesignNodeOverlay from "./SystemDesignNodeOverlay.jsx";
import ContextualInspectorDrawer from "./ContextualInspectorDrawer.jsx";
import { readGraph } from "./sceneModel.js";
import { simulateTraffic } from "./trafficSimulator.js";
import { deriveArchitectureDiagnostic } from "./architectureDiagnostics.js";
import "./systemDesign.css";

/**
 * Thin integration boundary mounted by App.jsx inside the canvas region.
 * App.jsx still passes saveStatus/canvasTabs/onSelectTab/onCreateTab from the first iteration. They are intentionally
 * ignored: Sketchizi's own header already renders documents and save status, so the studio no longer duplicates them.
 */
export default function SystemDesignStudio({ workspace, isDarkTheme }) {
  const { store, enabled, mode, simulate, loadRps, actions, canEdit } = workspace;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const rootRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [toast, setToast] = useState("");

  const getHost = useCallback(() => rootRef.current?.parentElement?.querySelector(".excalidraw") || null, []);
  const graph = useMemo(() => readGraph(snapshot.elements), [snapshot.elements]);
  const simulation = useMemo(
    () => (simulate ? simulateTraffic({ nodes: graph.nodes, edges: graph.edges, totalRps: loadRps }) : null),
    [simulate, graph, loadRps],
  );
  const diagnostic = useMemo(() => deriveArchitectureDiagnostic(graph.nodes, simulation), [graph.nodes, simulation]);

  // Brief, non-blocking hint. Auto-dismisses; never steals focus or blocks the canvas.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Simulation is opt-in. With nothing on the canvas there is nothing to run, so say what to add instead of
  // flipping to an ON state that would just show RPS 0.
  const hasNodes = graph.nodes.length > 0;
  const onSimulateChange = useCallback((next) => {
    if (next && !hasNodes) { setToast("Add a Client or Gateway node (or load a Blueprint) to simulate traffic."); return; }
    workspace.setSimulate(next);
  }, [hasNodes, workspace]);

  // Deleting the last node while running would leave a lit-up button over an empty canvas.
  useEffect(() => { if (simulate && !hasNodes) workspace.setSimulate(false); }, [simulate, hasNodes, workspace]);

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

  // While the studio is open this class (a) re-themes Excalidraw's selection accents (default violet) and (b) hides
  // Sketchizi's bottom stroke/fill palette, which would otherwise sit on top of the studio dock (see systemDesign.css).
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
      <TopWorkspaceBar mode={mode} onModeChange={workspace.setMode} simulate={simulate} onSimulateChange={onSimulateChange}
        loadRps={loadRps} onLoadChange={workspace.setLoadRps} onLoadBlueprint={actions.loadBlueprint} canEdit={canEdit} onClose={workspace.close}
        nodes={graph.nodes} edges={graph.edges} diagnostic={simulate ? diagnostic : null} />
      {toast && <div className="sd-toast" role="status" aria-live="polite">{toast}</div>}
      <CollapsibleQuickDock onAdd={actions.addNode} onAutoLayout={actions.autoLayout}
        snapEnabled={workspace.gridEnabled} onSnapChange={workspace.setGridEnabled} canEdit={canEdit} />
      <ContextualInspectorDrawer selection={selection} mode={mode} simulation={simulation} simulate={simulate} actions={actions} canEdit={canEdit} />
    </div>
  );
}
