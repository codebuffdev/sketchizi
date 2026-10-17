import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { inferSimulationNodeType, normalizeSimulationGraph, validateSimulationGraph } from "../graph/normalizeSimulationGraph.js";
import { createSimulation } from "../engine/simulationEngine.js";
import "./simulation.css";

const NODE_TYPES = [
  ["start", "Start"], ["task", "Task"], ["decision", "Decision"], ["delay", "Delay"], ["end", "End"],
  ["service", "Service"], ["database", "Database"], ["queue", "Queue"], ["api", "API"],
];

function readElements(apiRef) {
  return apiRef.current?.getSceneElements?.() || [];
}

export default function SimulationPanel({ apiRef, selectedElements = [], canEdit = true, isDarkTheme = false }) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("process");
  const [seed, setSeed] = useState("1");
  const [speed, setSpeed] = useState("500");
  const [runtime, setRuntime] = useState(null);
  const [issues, setIssues] = useState([]);
  const engineRef = useRef(null);
  const intervalRef = useRef(null);
  const selected = selectedElements.length === 1 ? selectedElements[0] : null;
  const selectedConfig = selected?.customData?.simulation || {};
  const sceneElements = readElements(apiRef);
  const inferredSelectedType = selected ? inferSimulationNodeType(selected, sceneElements) : "task";
  const config = selectedConfig.config || {};
  const isConnector = selected?.type === "arrow" || selected?.type === "line";

  const stopTimer = useCallback(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  useEffect(() => () => {
    stopTimer();
    engineRef.current?.stop?.();
  }, [stopTimer]);

  const refreshGraph = useCallback(() => {
    const nextGraph = normalizeSimulationGraph(readElements(apiRef), { domain });
    const nextIssues = validateSimulationGraph(nextGraph);
    setIssues(nextIssues);
    return { graph: nextGraph, issues: nextIssues };
  }, [apiRef, domain]);

  const updateSelectedConfig = (patch) => {
    if (!canEdit || !selected || !apiRef.current?.updateScene) return;
    const elements = readElements(apiRef);
    const updated = elements.map((element) => {
      if (element.id !== selected.id) return element;
      const current = element.customData?.simulation || {};
      return {
        ...element,
        customData: {
          ...(element.customData || {}),
          simulation: {
            schemaVersion: 1,
            domain,
            nodeType: current.nodeType || inferSimulationNodeType(element, elements),
            ...current,
            config: { ...(current.config || {}), ...patch },
          },
          },
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: Date.now(),
      };
    });
    apiRef.current.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };


  const updateSelectedEdge = (patch) => {
    if (!canEdit || !selected || !apiRef.current?.updateScene) return;
    const elements = readElements(apiRef);
    const updated = elements.map((element) => {
      if (element.id !== selected.id) return element;
      const current = element.customData?.simulation || {};
      return {
        ...element,
        customData: { ...(element.customData || {}), simulation: { ...current, schemaVersion: 1, domain, edgeType: "flow", ...patch } },
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: Date.now(),
      };
    });
    apiRef.current.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const updateSelectedType = (nodeType) => {
    if (!canEdit || !selected || !apiRef.current?.updateScene) return;
    const elements = readElements(apiRef);
    const updated = elements.map((element) => element.id !== selected.id ? element : ({
      ...element,
      customData: { ...(element.customData || {}), simulation: { ...(element.customData?.simulation || {}), schemaVersion: 1, domain, nodeType, config: { ...(element.customData?.simulation?.config || {}) } } },
      version: (element.version || 0) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now(),
    }));
    apiRef.current.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const step = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = engine.step();
    setRuntime(next);
    if (["completed", "failed", "stopped"].includes(next.status)) stopTimer();
  }, [stopTimer]);

  const run = () => {
    stopTimer();
    const { graph: nextGraph, issues: nextIssues } = refreshGraph();
    if (nextIssues.some((issue) => issue.severity === "error")) { setRuntime(null); return; }
    try {
      engineRef.current = createSimulation(nextGraph, { seed: Number(seed) || 1, maxEvents: 10000, maxVirtualTimeMs: 3600000, maxTokens: 1000 });
      let next = engineRef.current.resume();
      setRuntime(next);
      intervalRef.current = window.setInterval(() => {
        const result = engineRef.current?.step();
        if (!result) return;
        setRuntime(result);
        if (["completed", "failed", "stopped"].includes(result.status)) stopTimer();
      }, Math.max(100, Number(speed) || 500));
    } catch (error) {
      setIssues([{ severity: "error", code: "engine-init", message: error.message }]);
    }
  };

  const pause = () => {
    stopTimer();
    if (engineRef.current) setRuntime(engineRef.current.pause());
  };
  const reset = () => {
    stopTimer();
    engineRef.current?.stop?.();
    engineRef.current = null;
    setRuntime(null);
    setIssues([]);
  };

  const latestEvents = [...(runtime?.eventLog || [])].slice(-8).reverse();
  const latencySamples = [...(runtime?.metrics?.latencySamples || [])].sort((a, b) => a - b);
  const averageLatency = latencySamples.length ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length) : 0;
  const p95Latency = latencySamples.length ? latencySamples[Math.min(latencySamples.length - 1, Math.ceil(latencySamples.length * 0.95) - 1)] : 0;
  const throughput = runtime?.virtualTimeMs > 0 ? (runtime.metrics.completed * 1000 / runtime.virtualTimeMs).toFixed(2) : "0.00";
  const overlayElements = readElements(apiRef);
  const appState = apiRef.current?.getAppState?.() || {};
  const zoom = Number(appState.zoom?.value || 1);
  const canvasRect = typeof document !== "undefined" ? document.querySelector(".desktop-canvas-region")?.getBoundingClientRect() : null;
  const elementById = new Map(overlayElements.map((element) => [element.id, element]));
  const tokenMarkers = Object.values(runtime?.tokens || {}).filter((token) => token.status === "active" || token.status === "waiting").flatMap((token) => {
    const element = elementById.get(token.currentNodeId);
    if (!element || !canvasRect) return [];
    const sceneX = element.x + (element.width || 0) / 2;
    const sceneY = element.y + (element.height || 0) / 2;
    return [{ id: token.id, x: canvasRect.left + (sceneX + (appState.scrollX || 0)) * zoom, y: canvasRect.top + (sceneY + (appState.scrollY || 0)) * zoom }];
  });

  return (
    <>
      {tokenMarkers.length > 0 && <svg className="simulation-token-overlay" width="100%" height="100%" aria-hidden="true">
        {tokenMarkers.map((marker) => <g key={marker.id} transform={`translate(${marker.x} ${marker.y})`}><circle r="11" fill="#16a36a" opacity=".2"/><circle r="5.5" fill="#16a36a" stroke="#ffffff" strokeWidth="2" className="simulation-token-pulse"/><title>{marker.id}</title></g>)}
      </svg>}
    <div className={`simulation-panel ${isDarkTheme ? "simulation-panel-dark" : ""} ${open ? "simulation-panel-open" : ""}`}>
      <button className="simulation-launch" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} title="Open simulation">
        <span aria-hidden="true">▶</span> Simulation
      </button>
      {open && <section className="simulation-drawer" aria-label="Simulation controls">
        <header className="simulation-header">
          <div><strong>Simulation</strong><small>Process flow and architecture</small></div>
          <button type="button" className="simulation-icon-button" onClick={() => setOpen(false)} aria-label="Close simulation">×</button>
        </header>
        <div className="simulation-controls">
          <label>Domain<select value={domain} onChange={(event) => { reset(); setDomain(event.target.value); }}><option value="process">Process flow</option><option value="architecture">Software architecture</option></select></label>
          <label>Seed<input type="number" min="1" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
          <label>Playback interval<select value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="1000">Slow</option><option value="500">Normal</option><option value="200">Fast</option></select></label>
          <div className="simulation-action-row">
            <button type="button" onClick={run} disabled={!canEdit}>▶ Run</button>
            <button type="button" onClick={pause} disabled={!runtime || runtime.status !== "running"}>Ⅱ Pause</button>
            <button type="button" onClick={() => { if (!engineRef.current) run(); else { stopTimer(); step(); } }}>Step</button>
            <button type="button" onClick={reset}>Reset</button>
          </div>
        </div>

        <div className="simulation-section">
          <h3>Selected element</h3>
          {!selected && <p className="simulation-muted">Select one shape on the canvas to configure its simulation behavior.</p>}
          {selected && <>
            <div className="simulation-selected-name">{selected.text?.trim() || selected.type} <code>{selected.id.slice(0, 8)}</code></div>
            {isConnector ? <>
              <label>Route condition<select value={selectedConfig.condition || "always"} disabled={!canEdit} onChange={(event) => updateSelectedEdge({ condition: event.target.value })}><option value="always">Always</option><option value="success">Success</option><option value="failure">Failure</option><option value="true">Decision: true</option><option value="false">Decision: false</option></select></label>
              <label>Connector latency (ms)<input type="number" min="0" max="3600000" value={selectedConfig.latencyMs ?? 0} disabled={!canEdit} onChange={(event) => updateSelectedEdge({ latencyMs: Math.max(0, Number(event.target.value) || 0) })}/></label>
            </> : <>
              <label>Behavior<select value={selectedConfig.nodeType || inferredSelectedType} onChange={(event) => updateSelectedType(event.target.value)} disabled={!canEdit}>{NODE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="simulation-field-grid">
                {selectedConfig.nodeType === "decision" && <label>True probability<input type="number" min="0" max="1" step="0.01" value={config.trueProbability ?? 0.5} disabled={!canEdit} onChange={(event) => updateSelectedConfig({ trueProbability: Math.max(0, Math.min(1, Number(event.target.value) || 0)) })}/></label>}
                <label>Duration (ms)<input type="number" min="0" max="3600000" value={config.durationMs ?? 100} disabled={!canEdit} onChange={(event) => updateSelectedConfig({ durationMs: Math.max(0, Number(event.target.value) || 0) })}/></label>
                <label>Failure probability<input type="number" min="0" max="1" step="0.01" value={config.failureProbability ?? 0} disabled={!canEdit} onChange={(event) => updateSelectedConfig({ failureProbability: Math.max(0, Math.min(1, Number(event.target.value) || 0)) })}/></label>
                <label>Max retries<input type="number" min="0" max="20" value={config.maxRetries ?? 0} disabled={!canEdit} onChange={(event) => updateSelectedConfig({ maxRetries: Math.max(0, Math.min(20, Number(event.target.value) || 0)) })}/></label>
                <label>Retry delay (ms)<input type="number" min="0" max="3600000" value={config.retryDelayMs ?? 100} disabled={!canEdit} onChange={(event) => updateSelectedConfig({ retryDelayMs: Math.max(0, Number(event.target.value) || 0) })}/></label>
              </div>
            </>}
          </>}
        </div>

        <div className="simulation-section">
          <h3>Run status</h3>
          {runtime ? <>
            <div className={`simulation-status simulation-status-${runtime.status}`}>{runtime.status}</div>
            <div className="simulation-metrics">
              <div><small>Virtual time</small><strong>{runtime.virtualTimeMs} ms</strong></div>
              <div><small>Events</small><strong>{runtime.eventsProcessed}</strong></div>
              <div><small>Completed</small><strong>{runtime.metrics.completed}</strong></div>
              <div><small>Failed</small><strong>{runtime.metrics.failed}</strong></div>
              <div><small>Retries</small><strong>{runtime.metrics.retries}</strong></div>
              <div><small>Pending</small><strong>{runtime.queue.length}</strong></div>
              <div><small>Mean latency</small><strong>{averageLatency} ms</strong></div>
              <div><small>p95 latency</small><strong>{p95Latency} ms</strong></div>
              <div><small>Throughput</small><strong>{throughput}/s</strong></div>
              <div><small>Max event queue</small><strong>{runtime.metrics.maxQueueDepth}</strong></div>
            </div>
            {runtime.error && <p className="simulation-error">{runtime.error}</p>}
          </> : <p className="simulation-muted">Run a simulation to inspect execution metrics and events.</p>}
        </div>

        {(issues.length > 0 || runtime?.eventLog?.length > 0) && <div className="simulation-section">
          <h3>Diagnostics and events</h3>
          {issues.map((issue, index) => <p key={`${issue.code}-${index}`} className={issue.severity === "error" ? "simulation-error" : "simulation-warning"}>{issue.message}</p>)}
          {latestEvents.map((event) => <div className="simulation-event" key={event.id}><span>{event.timeMs} ms</span><strong>{event.type}</strong><p>{event.message}</p></div>)}
        </div>}
      </section>}
    </div>
    </>
  );
}
