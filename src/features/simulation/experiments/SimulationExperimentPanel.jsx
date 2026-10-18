import { useEffect, useMemo, useRef, useState } from "react";
import { runWorkbenchExperiments } from "../runWorkbenchExperiments.js";
import { getTypedRequestGuidance } from "./typedRequestGuidance.js";
import { partitionSimulationDiagnostics } from "./diagnosticPresentation.js";
import { deriveSimulationScope } from "../adapter/deriveSimulationScope.js";
import { appendSimulationHistory, createSimulationHistoryEntry, createSimulationModelSnapshot, restoreSimulationHistoryEntry, simulationResultsAreStale } from "./simulationHistory.js";
import { buildRuntimeOverlayModel } from "./runtimeOverlayModel.js";
import { deriveTraceInvestigation, findTraceWindowBucketRange } from "./traceInvestigation.js";
import {
  compareSimulationRuns,
  buildScenarioComparisonOverview,
  chooseCapacityImprovementScenarioKey,
  getCapacityPressureRows,
  createCapacityImprovementProfile,
  createServiceTimeImprovementProfile,
  createDatabaseContentionImprovementProfile,
  getDatabaseIndexCandidates,
  createDatabaseIndexImprovementProfile,
  buildTimeSeriesComparisonPoints,
  summarizeSimulationImprovement,
  createIllustrativeSimulationProfile,
  markSimulationAssumptionsConfirmed,
  mergeMissingIllustrativeProfiles,
  SIMULATION_PROFILE_FIELD_DEFINITIONS,
} from "./simulationExperimentModel.js";

const deepClone = (value) => structuredClone(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const formatInteger = (value) => isFiniteNumber(value) ? Math.round(value).toLocaleString() : "—";
const formatDecimal = (value, digits = 2) => isFiniteNumber(value) ? value.toFixed(digits) : "—";
const formatPercent = (value) => isFiniteNumber(value) ? `${(value * 100).toFixed(1)}%` : "—";
const profileIsConfirmed = (profile) => Boolean(profile && Object.values(profile.profilesByEntityId || {}).length && Object.values(profile.profilesByEntityId || {}).every((entry) => Object.values(entry.assumptions || {}).every((assumption) => assumption.status === "user-confirmed")));

function profileForEntityIds(profile, entityIds) {
  if (!profile) return null;
  const included = new Set(entityIds || []);
  return {
    ...deepClone(profile),
    profilesByEntityId: Object.fromEntries(Object.entries(profile.profilesByEntityId || {}).filter(([entityId]) => included.has(entityId))),
  };
}

function confirmProfileAssumptionsForEntityIds(profile, entityIds) {
  const next = deepClone(profile);
  const included = new Set(entityIds || []);
  for (const [entityId, item] of Object.entries(next.profilesByEntityId || {})) {
    if (!included.has(entityId)) continue;
    item.assumptions = Object.fromEntries(Object.keys(item.parameters || {}).map((field) => [field, {
      status: "user-confirmed",
      source: "explicit-user-acknowledgement",
      note: "The user explicitly accepted this value for this synthetic simulation profile.",
    }]));
  }
  const allConfirmed = Object.values(next.profilesByEntityId || {}).length > 0
    && Object.values(next.profilesByEntityId || {}).every((item) => Object.values(item.assumptions || {}).every((assumption) => assumption.status === "user-confirmed"));
  next.profileKind = allConfirmed ? "user-confirmed-synthetic" : "illustrative-synthetic";
  return next;
}

function ensureDatabaseIndexProfileDefaults(profile) {
  if (!profile || typeof profile !== "object") return null;
  const next = deepClone(profile);
  let changed = false;
  for (const item of Object.values(next.profilesByEntityId || {})) {
    if (item?.kind !== "relational-store") continue;
    item.parameters ||= {};
    item.assumptions ||= {};
    if (!Object.hasOwn(item.parameters, "indexBenefitReadFraction")) {
      item.parameters.indexBenefitReadFraction = 0;
      item.assumptions.indexBenefitReadFraction = {
        status: "proposed", source: "backward-compatible-synthetic-index-default",
        note: "Default assumption: no reads are assumed to benefit from a proposed index until explicitly tested.",
      };
      changed = true;
    }
    if (!Object.hasOwn(item.parameters, "indexReadSpeedupFactor")) {
      item.parameters.indexReadSpeedupFactor = 3;
      item.assumptions.indexReadSpeedupFactor = {
        status: "proposed", source: "backward-compatible-synthetic-index-default",
        note: "Synthetic assumption: an index-benefiting read uses one third of sampled base database service time; this is not a measured SQL plan.",
      };
      changed = true;
    }
  }
  if (changed) next.profileKind = "illustrative-synthetic";
  return next;
}

function profileValues(profile) {
  if (!profile) return null;
  const profilesByEntityId = Object.fromEntries(Object.keys(profile.profilesByEntityId || {}).sort().map((id) => {
    const item = profile.profilesByEntityId[id] || {};
    return [id, { kind: item.kind, parameters: item.parameters || {} }];
  }));
  return { schemaVersion: profile.schemaVersion, defaultScenario: profile.defaultScenario || {}, profilesByEntityId };
}

function profileIsSame(a, b) {
  return JSON.stringify(profileValues(a)) === JSON.stringify(profileValues(b));
}

function setField(profile, entityId, field, value) {
  const next = deepClone(profile);
  const entry = next.profilesByEntityId[entityId];
  entry.parameters[field] = value;
  entry.assumptions ||= {};
  entry.assumptions[field] = {
    status: "proposed",
    source: "user-edited-simulation-profile",
    note: "Edited value requires explicit confirmation before simulation.",
  };
  next.profileKind = "illustrative-synthetic";
  return next;
}

function confirmAllProfileAssumptions(profile) {
  const next = markSimulationAssumptionsConfirmed(profile);
  for (const item of Object.values(next.profilesByEntityId || {})) {
    for (const assumption of Object.values(item.assumptions || {})) assumption.note = "Explicitly accepted for this synthetic scenario; not a live-system measurement.";
  }
  return next;
}


function MetricCard({ label, value, detail }) {
  return <div className="sim-result-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function RunMetrics({ run }) {
  if (run?.result?.status !== "completed") return null;
  const metrics = run.result.result.metrics;
  return <div className="sim-result-metric-grid">
    <MetricCard label="Offered" value={formatInteger(metrics.offeredRequests)} detail="requests" />
    <MetricCard label="Succeeded" value={formatInteger(metrics.successfulRequests)} detail={formatPercent(metrics.successRate)} />
    <MetricCard label="Dropped" value={formatInteger(metrics.droppedRequests)} detail="capacity / buffer" />
    <MetricCard label="Throughput" value={formatDecimal(metrics.throughputRps)} detail="successful req/sec" />
    <MetricCard label="p95 latency" value={formatDecimal(metrics.successfulLatencyMs?.p95)} detail="milliseconds" />
    <MetricCard label="Failed" value={formatInteger(metrics.failedRequests)} detail="requests" />
  </div>;
}

function timeSeriesPath(values, maximum, width = 320, height = 86) {
  const left = 7; const right = width - 7; const top = 8; const bottom = height - 8;
  const segments = []; let segment = [];
  const flush = () => { if (segment.length) segments.push(segment); segment = []; };
  values.forEach((value, index) => {
    if (!isFiniteNumber(value)) { flush(); return; }
    const x = left + (values.length <= 1 ? 0 : (right - left) * index / (values.length - 1));
    const y = bottom - (Math.max(0, value) / maximum) * (bottom - top);
    segment.push(`${index === 0 || segment.length === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  });
  flush();
  return segments.map((part) => part.join(" "));
}

function SimulationTrendChart({ title, points, series, unit, selectedWindow }) {
  const allValues = series.flatMap((item) => points.map((point) => point[item.key])).filter(isFiniteNumber);
  const hasSamples = allValues.length > 0;
  const actualPeak = hasSamples ? Math.max(0, ...allValues) : null;
  const scaleMaximum = Math.max(1, actualPeak ?? 0);
  const chartHeight = 86;
  const selectedBuckets = findTraceWindowBucketRange(points, selectedWindow);
  const bucketCount = points.length;
  const pointSpacing = bucketCount > 1 ? 306 / (bucketCount - 1) : 4;
  const pointX = (index) => 7 + 306 * index / Math.max(1, bucketCount - 1);
  const highlightX = selectedBuckets ? Math.max(7, pointX(selectedBuckets.startIndex) - pointSpacing / 2) : 0;
  const highlightRight = selectedBuckets ? Math.min(313, pointX(selectedBuckets.endIndex) + pointSpacing / 2) : 0;
  const highlightWidth = selectedBuckets ? Math.max(4, highlightRight - highlightX) : 0;
  const highlightLeft = selectedBuckets ? Math.max(7, Math.min(313 - highlightWidth, highlightX)) : 0;
  return <section className="sim-time-chart" aria-label={`${title} time series`}>
    <div className="sim-time-chart-heading"><strong>{title}</strong><small>{hasSamples ? `Peak ${formatDecimal(actualPeak)}${unit ? ` ${unit}` : ""}` : "No samples in this interval"}</small></div>
    <div className="sim-time-chart-legend">{series.map((item) => <span key={item.key}><i className={item.className} aria-hidden="true"/>{item.label}</span>)}</div>
    <svg className="sim-time-chart-svg" viewBox={`0 0 320 ${chartHeight}`} role="img" aria-label={`${title}; ${points.length} event-derived time buckets`}>
      {selectedBuckets && <rect x={highlightLeft} y="7" width={highlightWidth} height={chartHeight - 14} rx="2" className="sim-time-chart-investigation-window"><title>Selected request hop interval</title></rect>}
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="7" x2="313" y1={8 + (chartHeight - 16) * fraction} y2={8 + (chartHeight - 16) * fraction} className="sim-time-chart-grid"/>)}
      {series.map((item) => {
        const values = points.map((point) => point[item.key]);
        return <g key={item.key} className={item.className}>
          {timeSeriesPath(values, scaleMaximum, 320, chartHeight).map((path, index) => <path key={index} d={path} className="sim-time-chart-line"/>)}
          {values.map((value, index) => {
            if (!isFiniteNumber(value)) return null;
            const x = 7 + (values.length <= 1 ? 0 : 306 * index / (values.length - 1));
            const y = chartHeight - 8 - (Math.max(0, value) / scaleMaximum) * (chartHeight - 16);
            return <circle key={index} cx={x} cy={y} r="1.4" className="sim-time-chart-point"><title>{`${formatDecimal(points[index].endMs / 1000)}s · ${item.label}: ${formatDecimal(value)}${unit ? ` ${unit}` : ""}`}</title></circle>;
          })}
        </g>;
      })}
    </svg>
    <div className="sim-time-chart-axis"><span>0 s</span><span>{formatDecimal(points.at(-1)?.endMs / 1000 || 0)} s</span></div>
  </section>;
}

function SimulationTimeSeries({ run, investigation }) {
  const timeSeries = run?.result?.result?.timeSeries;
  const points = timeSeries?.points;
  if (!Array.isArray(points) || !points.length) return null;
  const drain = timeSeries.postWindowDrain || {};
  const drainTotal = (drain.successfulRequests || 0) + (drain.failedRequests || 0) + (drain.droppedRequests || 0);
  return <details className="sim-time-series" open={Boolean(investigation?.hasTimeWindow)}>
    <summary><span>Performance over time</span><small>{points.length} event-derived intervals</small></summary>
    <p>Each point is calculated from simulated request-arrival and completion timestamps. Outcomes after the observation window are reported separately as drain results.</p>
    {investigation && <div className="sim-trace-chart-link" role="status"><strong>{investigation.componentLabel}</strong><span>{investigation.reason === "request-problem-point" ? `Request ${investigation.requestId} · ${investigation.hopOutcome} point` : `Request ${investigation.requestId} · ${formatDecimal(investigation.durationMs)} ms measured queue + service time`}</span>{investigation.hasTimeWindow ? <small>Highlighted interval: {formatDecimal(investigation.startMs)}–{formatDecimal(investigation.endMs)} ms from run start.</small> : <small>This hop has no complete recorded time interval to highlight.</small>}</div>}
    <SimulationTrendChart title="Offered load and successful throughput" points={points} unit="req/s" series={[
      { key: "offeredRps", label: "Offered", className: "series-offered" },
      { key: "successfulRps", label: "Succeeded", className: "series-success" },
    ]} selectedWindow={investigation}/>
    <SimulationTrendChart title="Successful p95 latency" points={points} unit="ms" series={[
      { key: "latencyP95Ms", label: "p95 latency", className: "series-latency" },
    ]} selectedWindow={investigation}/>
    <SimulationTrendChart title="Failures and capacity drops" points={points} unit="requests" series={[
      { key: "failedRequests", label: "Failed", className: "series-failed" },
      { key: "droppedRequests", label: "Dropped", className: "series-dropped" },
    ]} selectedWindow={investigation}/>
    {drainTotal > 0 && <p className="sim-time-drain-note">After-window drain: {formatInteger(drain.successfulRequests || 0)} succeeded, {formatInteger(drain.failedRequests || 0)} failed, {formatInteger(drain.droppedRequests || 0)} dropped while already offered work finished. These outcomes are included in aggregate totals but not plotted inside the observation window.</p>}
  </details>;
}

function ImprovementTimeSeriesComparison({ comparison, investigation }) {
  if (comparison?.status !== "ready" || !Array.isArray(comparison.points) || comparison.points.length === 0) {
    return <p className="sim-improvement-series-unavailable">{comparison?.reason || "Matching event-derived time-series data is not available for both runs. Aggregate comparison remains available."}</p>;
  }
  const points = comparison.points;
  const pairedSeries = (key, label) => [
    { key: `before${key}`, label: `Before · ${label}`, className: "series-before" },
    { key: `after${key}`, label: `After · ${label}`, className: "series-after" },
  ];
  return <details className="sim-improvement-series" open>
    <summary><span>Before / after over time</span><small>{points.length} matched event-derived intervals</small></summary>
    <p>Both curves use the same stressed scenario, seed, observation window, and bucket boundaries. Highlighted intervals refer to the originally investigated request.</p>
    <SimulationTrendChart title="Successful throughput" points={points} unit="req/s" series={pairedSeries("SuccessfulRps", "success")} selectedWindow={investigation}/>
    <SimulationTrendChart title="Successful p95 latency" points={points} unit="ms" series={pairedSeries("LatencyP95Ms", "p95")} selectedWindow={investigation}/>
    <SimulationTrendChart title="Dropped requests per interval" points={points} unit="requests" series={pairedSeries("DroppedRequests", "drops")} selectedWindow={investigation}/>
  </details>;
}

function RequestTraceExplorer({ run, scenarioKey, onFocusEntity, onInvestigateTrace, investigation }) {
  const traceCapture = run?.result?.result?.requestTraces;
  const traces = Array.isArray(traceCapture?.traces) ? traceCapture.traces : [];
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const preferredTrace = traces.find((trace) => trace.outcome === "dropped")
    || traces.find((trace) => trace.outcome === "failed")
    || [...traces].sort((a, b) => (b.totalLatencyMs ?? -1) - (a.totalLatencyMs ?? -1) || String(a.requestId).localeCompare(String(b.requestId)))[0]
    || null;
  const selectedTrace = traces.find((trace) => trace.requestId === selectedRequestId) || preferredTrace;
  const traceInvestigation = deriveTraceInvestigation(selectedTrace);
  if (!traceCapture || traces.length === 0) return null;
  const totalRequests = Number.isSafeInteger(traceCapture.totalTerminalRequests) ? traceCapture.totalTerminalRequests : traces.length;
  const outcomeLabel = (outcome) => ({ success: "Succeeded", failed: "Failed", dropped: "Dropped" })[outcome] || String(outcome || "Unknown");
  const hopOutcomeLabel = (outcome) => ({ sent: "Traffic offered", success: "Request completed", completed: "Hop completed", failed: "Failed here", unavailable: "Dependency unavailable", dropped: "Dropped before service" })[outcome] || String(outcome || "Unknown");
  const displayTime = (value) => isFiniteNumber(value) ? `${formatDecimal(value, 2)} ms` : "Not recorded";
  return <details className="sim-request-traces">
    <summary><span>Request-level traces</span><small>{traces.length} sampled · {formatInteger(totalRequests)} terminal requests</small></summary>
    <p>Trace samples are recorded from discrete-event request lifecycles. We keep a few examples of each outcome plus the slowest requests; this is not a full distributed trace of a deployed service.</p>
    <label className="sim-request-trace-select">Request sample
      <select aria-label="Select request trace" value={selectedTrace?.requestId || ""} onChange={(event) => setSelectedRequestId(event.target.value)}>
        {traces.map((trace) => <option key={trace.requestId} value={trace.requestId}>{trace.requestId} · {outcomeLabel(trace.outcome)} · {formatDecimal(trace.totalLatencyMs)} ms</option>)}
      </select>
    </label>
    {selectedTrace && <>
      <div className={`sim-request-trace-summary outcome-${selectedTrace.outcome}`}>
        <div><span>Outcome</span><strong>{outcomeLabel(selectedTrace.outcome)}</strong></div>
        <div><span>End-to-end modeled time</span><strong>{formatDecimal(selectedTrace.totalLatencyMs)} ms</strong></div>
        <div><span>Arrival</span><strong>{formatDecimal(selectedTrace.arrivalMs)} ms</strong></div>
        <div><span>Completion</span><strong>{formatDecimal(selectedTrace.completedAtMs)} ms</strong></div>
        <small>{selectedTrace.withinObservationWindow ? "Completed within the observation window" : "Completed during post-window drain"}</small>
      </div>
      {traceInvestigation && <div className={`sim-trace-investigation ${traceInvestigation.reason === "request-problem-point" ? "problem" : "slowest"}`}>
        <div><strong>{traceInvestigation.reason === "request-problem-point" ? "Recorded problem point" : traceInvestigation.reason === "hop-without-timing-evidence" ? "Hop selected · timing unavailable" : "Slowest measured hop"}</strong><span>{traceInvestigation.componentLabel}{traceInvestigation.durationMs !== null ? ` · ${formatDecimal(traceInvestigation.durationMs)} ms queue + service` : ` · ${hopOutcomeLabel(traceInvestigation.hopOutcome)}`}</span></div>
        <button type="button" className="workbench-secondary" onClick={() => { onInvestigateTrace?.({ ...traceInvestigation, scenarioKey }); if (traceInvestigation.entityId) onFocusEntity?.(traceInvestigation.entityId); }}>Investigate on charts & canvas</button>
        {investigation?.scenarioKey === scenarioKey && investigation?.requestId === selectedTrace.requestId && investigation?.hopIndex === traceInvestigation.hopIndex && <small className="sim-trace-investigation-active">Currently highlighted in charts and canvas.</small>}
      </div>}
      <ol className="sim-request-trace-hops">
        {(selectedTrace.hops || []).map((hop, index) => <li key={`${selectedTrace.requestId}-${hop.nodeId}-${index}`} className={`sim-request-trace-hop outcome-${hop.outcome}`}>
          <div className="sim-request-trace-hop-head"><span className="sim-request-trace-step">{index + 1}</span><div><strong>{hop.label || hop.entityId || hop.nodeId}</strong><small>{hop.kind || "runtime component"} · {hopOutcomeLabel(hop.outcome)}</small></div></div>
          <dl>
            {hop.kind === "traffic-source" ? <div><dt>Request offered</dt><dd>{displayTime(hop.arrivalMs)}</dd></div> : <>
              <div><dt>Arrival</dt><dd>{displayTime(hop.arrivalMs)}</dd></div>
              <div><dt>Queue wait</dt><dd>{displayTime(hop.queueWaitMs)}</dd></div>
              <div><dt>Service time</dt><dd>{displayTime(hop.serviceTimeMs)}</dd></div>
              <div><dt>Service started</dt><dd>{displayTime(hop.serviceStartedAtMs)}</dd></div>
              <div><dt>Service ended / outcome</dt><dd>{displayTime(hop.outcomeAtMs)}</dd></div>
            </>}
          </dl>
          {hop.entityId && <button type="button" className="sim-request-trace-focus" onClick={() => onFocusEntity?.(hop.entityId)}>Focus component</button>}
        </li>)}
      </ol>
      <small className="sim-request-trace-footnote">Queue wait and service time are reported separately. Unavailable or dropped hops have no service time. Times are relative to the start of this synthetic run.</small>
    </>}
  </details>;
}

function compareValue(row) {
  if (!isFiniteNumber(row.before) || !isFiniteNumber(row.after)) return "—";
  if (row.unit === "ratio") return `${formatPercent(row.before)} → ${formatPercent(row.after)}`;
  if (row.unit === "requests/sec") return `${formatDecimal(row.before)} → ${formatDecimal(row.after)}`;
  return `${formatDecimal(row.before, row.unit === "requests" ? 0 : 2)} → ${formatDecimal(row.after, row.unit === "requests" ? 0 : 2)}`;
}


function formatSigned(value, digits = 1) {
  if (!isFiniteNumber(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function ScenarioComparisonOverview({ overview, onFocusEntity, onSelectScenario }) {
  if (!overview || overview.status !== "ready") return null;
  const scenarios = overview.scenarios;
  const notableComponents = overview.components.filter((component) => component.hasPressure).slice(0, 8);
  const componentRows = notableComponents.length ? notableComponents : overview.components.slice(0, 4);
  return <details className="sim-suite-overview">
    <summary><span>Compare all scenarios</span><small>{scenarios.filter((item) => item.status === "completed").length}/{scenarios.length} completed</small></summary>
    <div className="sim-suite-table-wrap">
      <table className="sim-suite-table">
        <thead><tr><th>Scenario</th><th>Success</th><th>Throughput</th><th>p95</th><th>Dropped</th><th>Δ drops</th></tr></thead>
        <tbody>{scenarios.map((scenario) => {
          const metrics = scenario.metrics;
          const completed = scenario.status === "completed" && metrics;
          return <tr key={scenario.key} className={scenario.key === "baseline" ? "baseline" : ""}>
            <td><button type="button" className="sim-scenario-link" onClick={() => onSelectScenario?.(scenario.key)}>{scenario.label}</button><small>{scenario.status}</small></td>
            <td>{completed ? formatPercent(metrics.successRate) : "—"}</td>
            <td>{completed ? formatDecimal(metrics.throughputRps) : "—"}</td>
            <td>{completed ? formatDecimal(metrics.p95LatencyMs) : "—"}</td>
            <td>{completed ? formatInteger(metrics.droppedRequests) : "—"}</td>
            <td>{isFiniteNumber(scenario.deltaVsBaseline.droppedRequests) ? formatSigned(scenario.deltaVsBaseline.droppedRequests, 0) : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="sim-suite-subheading"><strong>Component pressure across scenarios</strong><small>Utilization and dropped requests from the model, not live telemetry.</small></div>
    {componentRows.length === 0 ? <p className="workbench-findings-empty">No per-component results are available.</p> : <div className="sim-suite-table-wrap">
      <table className="sim-suite-table sim-component-pressure-table">
        <thead><tr><th>Component</th>{scenarios.map((scenario) => <th key={scenario.key}>{scenario.label}</th>)}</tr></thead>
        <tbody>{componentRows.map((component) => <tr key={component.entityId}>
          <td><button type="button" className="sim-scenario-link" onClick={() => onFocusEntity?.(component.entityId)}>{component.label}</button></td>
          {scenarios.map((scenario) => {
            const item = component.byScenario[scenario.key];
            return <td key={scenario.key}>{item ? <><span>{formatPercent(item.utilization)}</span><small>{formatInteger(item.dropped)} dropped · {formatInteger(item.failed)} failed</small></> : "—"}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>}
    <div className="sim-suite-subheading"><strong>What changed versus baseline</strong><small>{overview.insights.length} modeled signal(s)</small></div>
    {overview.insights.length === 0 ? <p className="workbench-findings-empty">No supported regression signal was detected in the available comparison. This is not proof of production safety.</p> : <div className="sim-suite-insights">
      {overview.insights.slice(0, 8).map((insight) => <button type="button" key={insight.id} className={`sim-suite-insight ${insight.severity}`} onClick={() => { onSelectScenario?.(insight.scenarioKey); if (insight.entityIds?.[0]) onFocusEntity?.(insight.entityIds[0]); }}>
        <strong>{insight.title}</strong><span>{insight.message}</span><em>{insight.suggestedAction}</em>{insight.entityIds?.length > 0 && <small>Open scenario and focus component</small>}
      </button>)}
    </div>}
  </details>;
}

export default function SimulationExperimentPanel({ workbench, simulationProfile, onUpdateSimulationProfile, simulationHistory = [], onUpdateSimulationHistory, onCreateTypedRelation, onFocusEntity, onUpdateEntity, visibleEntityIds = null, activeViewId = "system", onSwitchView, onSwitchToAdd, onRuntimeOverlayChange, canEdit = true }) {
  const scopeSignature = Array.isArray(visibleEntityIds) ? JSON.stringify([...new Set(visibleEntityIds)].sort()) : "__model_scope__";
  const scopeSeeds = useMemo(() => scopeSignature === "__model_scope__" ? null : JSON.parse(scopeSignature), [scopeSignature]);
  const simulationScope = useMemo(() => workbench ? deriveSimulationScope(workbench, scopeSeeds) : { workbench: null, entityIds: [], seedEntityIds: [], excludedEntityIds: [], scoped: Array.isArray(scopeSeeds) }, [workbench, scopeSignature]);
  const typedRequestGuidance = useMemo(() => getTypedRequestGuidance(workbench, visibleEntityIds), [workbench, scopeSignature]);
  // Keep the run control aligned with the same semantic path analysis used by the
  // quick-connect guidance. A visual canvas arrow alone never satisfies this check.
  const typedCallMissing = Boolean(typedRequestGuidance?.missingLinks.some((link) => link.relationKind === "calls"));
  const activeViewHasTrafficSource = !simulationScope.scoped || simulationScope.seedEntityIds.some((id) => workbench?.entities?.some((entity) => entity.id === id && entity.kind === "frontend.react-app"));
  const missingTrafficSource = simulationScope.scoped && !activeViewHasTrafficSource;
  const scopeEntityIdSet = useMemo(() => new Set(simulationScope.entityIds), [simulationScope]);
  const effectiveScopeSignature = JSON.stringify(simulationScope.entityIds);
  const [draftProfile, setDraftProfile] = useState(() => ensureDatabaseIndexProfileDefaults(simulationProfile));
  const draftProfileRef = useRef(draftProfile);
  draftProfileRef.current = draftProfile;
  const [acknowledged, setAcknowledged] = useState(() => profileIsConfirmed(profileForEntityIds(simulationProfile, simulationScope.entityIds)));
  const [results, setResults] = useState(null);
  const [activeRunKey, setActiveRunKey] = useState("baseline");
  const [profileError, setProfileError] = useState("");
  const [runError, setRunError] = useState("");
  const [improvementResult, setImprovementResult] = useState(null);
  const [improvementError, setImprovementError] = useState("");
  const [databaseIndexCandidateKey, setDatabaseIndexCandidateKey] = useState("");
  const [schemaUpdateNotice, setSchemaUpdateNotice] = useState("");
  const [profileEditorOpen, setProfileEditorOpen] = useState(true);
  const [showAllExplanations, setShowAllExplanations] = useState(false);
  const [trafficMultiplier, setTrafficMultiplier] = useState(5);
  const [investigation, setInvestigation] = useState(null);

  useEffect(() => {
    // The controller may clone Workbench metadata after an autosave or an unrelated
    // model update. If profile values are unchanged, preserve current results and
    // run-local assumption acknowledgement; modelRevision still marks stale results.
    if (profileIsSame(draftProfileRef.current, ensureDatabaseIndexProfileDefaults(simulationProfile))) return;
    const next = ensureDatabaseIndexProfileDefaults(simulationProfile);
    setDraftProfile(next);
    setAcknowledged(profileIsConfirmed(profileForEntityIds(next, simulationScope.entityIds)));
    setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
    setProfileError("");
    setRunError("");
  }, [simulationProfile, effectiveScopeSignature, scopeSignature]);

  // Changing the active-view scope requires reviewing that scope's assumptions
  // again. Saved history remains available and is marked stale where appropriate.
  useEffect(() => {
    setAcknowledged(false);
    setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
    setRunError("");
  }, [effectiveScopeSignature]);

  // Typed relationships alter the compiled request topology even when the
  // active-view placement set and profile values stay the same. Clear results
  // from the previous model revision and require fresh assumption review.
  const modelRevision = workbench?.modelRevision ?? null;
  useEffect(() => {
    setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
    setAcknowledged(false);
    setRunError("");
  }, [modelRevision]);

  const entitiesById = useMemo(() => new Map((workbench?.entities || []).map((entity) => [entity.id, entity])), [workbench?.entities]);
  const profiles = draftProfile?.profilesByEntityId || {};
  const availableProfileEntities = Object.entries(profiles).map(([entityId, profile]) => ({ entity: entitiesById.get(entityId), entityId, profile })).filter((item) => item.entity && scopeEntityIdSet.has(item.entityId));
  const missingProfileEntityIds = useMemo(() => {
    if (!simulationScope.workbench) return [];
    const supported = new Set(["frontend.react-app", "backend.rest-service", "data.postgresql-database", "integrations.external-api"]);
    return simulationScope.workbench.entities.filter((entity) => supported.has(entity.kind) && !profiles[entity.id]).map((entity) => entity.id);
  }, [simulationScope, profiles]);
  const unsaved = Boolean(draftProfile && simulationProfile && !profileIsSame(draftProfile, simulationProfile));
  const staleModel = simulationResultsAreStale(results, workbench, simulationProfile, simulationScope.entityIds)
    || Boolean(results && Number.isFinite(results.trafficMultiplier) && results.trafficMultiplier !== trafficMultiplier);
  const activeRun = results?.runs?.[activeRunKey];
  const capacityScenarioKey = useMemo(() => chooseCapacityImprovementScenarioKey(results?.runs, activeRunKey), [results, activeRunKey]);
  const capacityScenario = capacityScenarioKey ? results?.runs?.[capacityScenarioKey] : null;
  const databaseIndexCandidates = useMemo(() => getDatabaseIndexCandidates({
    profile: draftProfile,
    workbench,
    scopeEntityIds: simulationScope.entityIds,
    componentRows: getCapacityPressureRows(capacityScenario),
  }), [draftProfile, workbench, simulationScope, capacityScenario]);
  const candidateKey = (candidate) => candidate ? `${candidate.entityId}::${candidate.tableEntityId}::${candidate.columnName}` : "";
  const selectedDatabaseIndexCandidate = databaseIndexCandidates.find((candidate) => candidateKey(candidate) === databaseIndexCandidateKey)
    || (databaseIndexCandidates.length === 1 ? databaseIndexCandidates[0] : null);
  const baselineRun = results?.runs?.baseline?.result;
  const comparisonRun = activeRunKey === "baseline" ? baselineRun : activeRun?.result;
  const comparison = activeRunKey !== "baseline" && baselineRun && comparisonRun
    ? compareSimulationRuns(baselineRun, comparisonRun)
    : null;
  const explanations = activeRun?.explanations || [];
  const externalApprox = availableProfileEntities.some((item) => item.profile.kind === "external-service-approximation");
  const resultsModel = results?.sourceModelSnapshot || workbench;
  const resultsEntitiesById = useMemo(() => new Map((resultsModel?.entities || []).map((entity) => [entity.id, entity])), [resultsModel?.entities]);
  const resultsProfile = results?.profileUsed || results?.historyProfileSnapshot;
  const scenarioOverview = useMemo(() => results ? buildScenarioComparisonOverview(results, resultsModel) : null, [results, resultsModel]);
  const activeInvestigation = investigation?.scenarioKey === activeRunKey && !staleModel ? investigation : null;
  const capacityTraceTargetEntityId = useMemo(() => {
    if (!activeInvestigation || activeInvestigation.scenarioKey !== capacityScenarioKey
      || activeInvestigation.requestOutcome !== "success"
      || activeInvestigation.reason !== "largest-measured-hop-duration"
      || !activeInvestigation.entityId) return null;
    const pressure = getCapacityPressureRows(capacityScenario).find((row) => row.entityId === activeInvestigation.entityId);
    // Concurrency is appropriate to test only when the selected hop has some
    // observed queueing or component-level pressure. A large service time alone
    // is not evidence that adding concurrency is the right intervention.
    return (activeInvestigation.queueWaitMs ?? 0) > 0 || pressure?.hasPressure
      ? activeInvestigation.entityId
      : null;
  }, [activeInvestigation, capacityScenarioKey, capacityScenario]);
  const serviceTimeTraceTargetEntityId = useMemo(() => {
    if (!activeInvestigation || activeInvestigation.scenarioKey !== capacityScenarioKey
      || activeInvestigation.requestOutcome !== "success"
      || activeInvestigation.reason !== "largest-measured-hop-duration"
      || !activeInvestigation.entityId
      || !isFiniteNumber(activeInvestigation.serviceTimeMs)
      || activeInvestigation.serviceTimeMs <= 0
      || (activeInvestigation.queueWaitMs ?? 0) > activeInvestigation.serviceTimeMs) return null;
    const row = getCapacityPressureRows(capacityScenario).find((item) => item.entityId === activeInvestigation.entityId);
    return isFiniteNumber(row?.serviceTimeP95Ms) && row.serviceTimeP95Ms > 0
      ? activeInvestigation.entityId
      : null;
  }, [activeInvestigation, capacityScenarioKey, capacityScenario]);
  const databaseContentionEvidenceRows = useMemo(() => getCapacityPressureRows(capacityScenario)
    .filter((row) => {
      const entity = entitiesById.get(row.entityId);
      const item = profiles[row.entityId];
      return scopeEntityIdSet.has(row.entityId)
        && entity?.kind === "data.postgresql-database"
        && item?.kind === "relational-store"
        && isFiniteNumber(item?.parameters?.writeContentionMs)
        && item.parameters.writeContentionMs > 0
        && row.writeOperationsStarted > 0
        && row.writeContentionMsTotal > 0;
    })
    .sort((a, b) => b.writeContentionMsTotal - a.writeContentionMsTotal
      || b.maxDropped - a.maxDropped
      || b.peakUtilization - a.peakUtilization
      || a.entityId.localeCompare(b.entityId)),
  [capacityScenario, entitiesById, profiles, scopeEntityIdSet]);
  const databaseContentionTraceTargetEntityId = useMemo(() => {
    if (!activeInvestigation || activeInvestigation.scenarioKey !== capacityScenarioKey
      || activeInvestigation.requestOutcome !== "success"
      || activeInvestigation.operation !== "write"
      || !isFiniteNumber(activeInvestigation.writeContentionMs)
      || activeInvestigation.writeContentionMs <= 0) return null;
    return databaseContentionEvidenceRows.some((row) => row.entityId === activeInvestigation.entityId)
      ? activeInvestigation.entityId
      : null;
  }, [activeInvestigation, capacityScenarioKey, databaseContentionEvidenceRows]);
  const databaseContentionTargetEntityId = databaseContentionTraceTargetEntityId
    || databaseContentionEvidenceRows[0]?.entityId
    || null;
  const runtimeOverlayModel = useMemo(() => buildRuntimeOverlayModel({
    results,
    activeRunKey,
    workbench,
    activeViewId,
    stale: staleModel,
    investigation: activeInvestigation,
  }), [results, activeRunKey, workbench, activeViewId, staleModel, activeInvestigation]);

  useEffect(() => {
    // A null update clears the canvas layer whenever results are absent, blocked,
    // stale, or scoped to another view. The canvas independently validates the
    // model revision before rendering any badge.
    onRuntimeOverlayChange?.(runtimeOverlayModel);
  }, [onRuntimeOverlayChange, runtimeOverlayModel]);

  const prepareProfile = () => {
    try {
      const profile = createIllustrativeSimulationProfile(simulationScope.scoped ? simulationScope.workbench : workbench);
      setDraftProfile(profile);
      setProfileEditorOpen(true);
      setAcknowledged(false);
      setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
      onUpdateSimulationProfile?.(profile);
      setProfileError("");
    } catch (error) { setProfileError(error.message); }
  };
  const syncProfiles = () => {
    try {
      const merged = mergeMissingIllustrativeProfiles(workbench, draftProfile, simulationScope.scoped ? simulationScope.entityIds : undefined);
      setDraftProfile(merged.profile);
      setProfileEditorOpen(true);
      setAcknowledged(false);
      setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
      onUpdateSimulationProfile?.(merged.profile);
      setProfileError(merged.addedEntityIds.length ? `Added proposed profiles for ${merged.addedEntityIds.length} component(s). Review the values and acknowledge the assumptions before running.` : "All supported components already have profiles.");
    } catch (error) { setProfileError(error.message); }
  };
  const saveProfile = () => {
    if (!draftProfile) return;
    const next = deepClone(draftProfile);
    next.profileKind = "illustrative-synthetic";
    next.sourceModelRevision = workbench?.modelRevision ?? null;
    for (const item of Object.values(next.profilesByEntityId || {})) {
      item.assumptions ||= {};
      for (const field of Object.keys(item.parameters || {})) {
        if (!item.assumptions[field] || item.assumptions[field].source === "explicit-user-acknowledgement") {
          item.assumptions[field] = { status: "proposed", source: "profile-edited", note: "Review and explicitly confirm before running." };
        }
      }
    }
    setDraftProfile(next);
    setProfileEditorOpen(true);
    setAcknowledged(false);
    setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
    onUpdateSimulationProfile?.(next);
    setProfileError("");
  };
  const runExperiments = () => {
    setImprovementResult(null);
    setImprovementError("");
    setInvestigation(null);
    setRunError("");
    if (missingTrafficSource) { setRunError("The active view has no React traffic source. Switch to a view containing the React application before running request-path experiments."); return; }
    if (!draftProfile) { setRunError("Prepare a simulation profile first."); return; }
    if (!acknowledged) { setRunError("Review and confirm the illustrative assumptions before running."); return; }
    if (unsaved) { setRunError("Save profile changes before running experiments."); return; }
    if (simulationScope.scoped && simulationScope.seedEntityIds.length === 0) {
      setRunError("No Workbench components are placed in the active view. Add or switch to a semantic component before running a scoped simulation.");
      return;
    }
    try {
      // Acknowledge only the assumptions displayed for this view-connected scope.
      // Inputs belonging to unrelated views remain proposed until those are reviewed.
      const confirmed = simulationScope.scoped
        ? confirmProfileAssumptionsForEntityIds(draftProfile, simulationScope.entityIds)
        : confirmAllProfileAssumptions(draftProfile);
      confirmed.sourceModelRevision = workbench?.modelRevision ?? null;
      const suite = runWorkbenchExperiments({ workbench, simulationProfile: confirmed, trafficMultiplier, scopeEntityIds: scopeSeeds ?? undefined });
      const displaySuite = {
        ...suite,
        trafficMultiplier,
        sourceModelSnapshot: createSimulationModelSnapshot(workbench),
        profileUsed: deepClone(draftProfile),
        runScopeEntityIds: suite.provenance?.scopeEntityIds || simulationScope.entityIds,
      };
      setResults(displaySuite);
      setProfileEditorOpen(false);
      setShowAllExplanations(false);
      setActiveRunKey("baseline");
      if (["completed", "partial"].includes(suite.status)) {
        const entry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: draftProfile });
        onUpdateSimulationHistory?.(appendSimulationHistory(simulationHistory, entry));
      }
    } catch (error) { setRunError(error.message); }
  };

  const runImprovementExperiment = (interventionKind = "capacity") => {
    setImprovementError("");
    setImprovementResult(null);
    if (!canEdit) { setImprovementError("Edit permission is required to run a controlled improvement experiment."); return; }
    if (!results || results.status !== "completed" || staleModel) {
      setImprovementError("Run a current, completed experiment suite before testing an improvement.");
      return;
    }
    if (unsaved) { setImprovementError("Save the current simulation profile before testing an improvement."); return; }
    try {
      const comparisonScenarioKey = chooseCapacityImprovementScenarioKey(results.runs, activeRunKey);
      const originalScenario = comparisonScenarioKey ? results.runs?.[comparisonScenarioKey] : null;
      if (!originalScenario || originalScenario.result?.status !== "completed") {
        throw new Error("No completed load scenario is available for an improvement comparison. Run the baseline and traffic-surge scenarios first.");
      }
      const pressureRows = getCapacityPressureRows(originalScenario);
      const isServiceTime = interventionKind === "service-time";
      const isWriteContention = interventionKind === "write-contention";
      const isDatabaseIndex = interventionKind === "database-index";
      const preferredEntityId = isDatabaseIndex
        ? selectedDatabaseIndexCandidate?.entityId
        : isWriteContention ? databaseContentionTraceTargetEntityId
          : isServiceTime ? serviceTimeTraceTargetEntityId : capacityTraceTargetEntityId;
      const improvement = isDatabaseIndex
        ? createDatabaseIndexImprovementProfile({
          profile: draftProfile,
          workbench,
          scopeEntityIds: simulationScope.entityIds,
          componentRows: pressureRows,
          preferredEntityId,
          preferredTableId: selectedDatabaseIndexCandidate?.tableEntityId,
          preferredColumnName: selectedDatabaseIndexCandidate?.columnName,
        })
        : isWriteContention
        ? createDatabaseContentionImprovementProfile({
          profile: draftProfile,
          workbench,
          scopeEntityIds: simulationScope.entityIds,
          componentRows: pressureRows,
          preferredEntityId,
        })
        : isServiceTime
          ? createServiceTimeImprovementProfile({
            profile: draftProfile,
            workbench,
            scopeEntityIds: simulationScope.entityIds,
            componentRows: pressureRows,
            preferredEntityId,
          })
          : createCapacityImprovementProfile({
            profile: draftProfile,
            workbench,
            scopeEntityIds: simulationScope.entityIds,
            componentRows: pressureRows,
            preferredEntityId,
          });
      const suite = runWorkbenchExperiments({ workbench, simulationProfile: improvement.profile, trafficMultiplier: results.trafficMultiplier ?? trafficMultiplier, scopeEntityIds: scopeSeeds ?? undefined });
      const improvedScenario = suite.runs?.[comparisonScenarioKey];
      if (improvedScenario?.result?.status !== "completed") {
        const blocking = (improvedScenario?.result?.diagnostics || suite.diagnostics || []).filter((item) => item.severity === "blocker").map((item) => item.message || item.title);
        throw new Error(blocking[0] || `The improved ${originalScenario.label || comparisonScenarioKey} scenario did not complete.`);
      }
      const comparisonResult = compareSimulationRuns(originalScenario.result, improvedScenario.result);
      if (comparisonResult.status !== "ready") throw new Error(comparisonResult.reason || "The improved scenario could not be compared against the same original scenario.");
      const timeSeriesComparison = buildTimeSeriesComparisonPoints(originalScenario.result, improvedScenario.result);
      const outcomeSummary = summarizeSimulationImprovement(comparisonResult);
      const traceMatchesTarget = preferredEntityId === activeInvestigation?.entityId
        && activeInvestigation?.scenarioKey === comparisonScenarioKey
        && (improvement.selectionReason?.startsWith("selected-trace")
          || (isDatabaseIndex && activeInvestigation?.operation === "read" && activeInvestigation?.requestOutcome === "success"));
      const traceInvestigationSnapshot = traceMatchesTarget ? deepClone(activeInvestigation) : null;

      const displayImprovement = {
        ...improvement,
        interventionKind,
        comparison: comparisonResult,
        timeSeriesComparison,
        outcomeSummary,
        comparisonScenarioKey,
        comparisonScenarioLabel: originalScenario.label || comparisonScenarioKey,
        targetSelectionReason: improvement.selectionReason,
        traceInvestigationSnapshot,
        baselineRunFingerprint: results.runs?.baseline?.result?.result?.simulation?.runFingerprint || null,
        comparisonRunFingerprint: originalScenario.result?.result?.simulation?.runFingerprint || null,
        beforeRunFingerprint: originalScenario.result?.result?.simulation?.runFingerprint || null,
        afterRunFingerprint: improvedScenario.result?.result?.simulation?.runFingerprint || null,
        suite,
        createdAt: new Date().toISOString(),
      };
      setImprovementResult(displayImprovement);
      setActiveRunKey(comparisonScenarioKey);
      // Keep the trial in the same bounded experiment history as normal runs,
      // while preserving the canonical profile and model unchanged.
      const historySuite = {
        ...suite,
        sourceModelSnapshot: createSimulationModelSnapshot(workbench),
        experimentMetadata: {
          kind: "one-variable-improvement",
          interventionKind,
          title: improvement.label,
          changedEntityId: improvement.entityId,
          field: improvement.field,
          comparisonScenarioKey,
          comparisonScenarioLabel: originalScenario.label || comparisonScenarioKey,
          comparisonRunFingerprint: originalScenario.result?.result?.simulation?.runFingerprint || null,
          beforeRunFingerprint: originalScenario.result?.result?.simulation?.runFingerprint || null,
          afterRunFingerprint: improvedScenario.result?.result?.simulation?.runFingerprint || null,
          targetSelectionReason: improvement.selectionReason,
          traceRequestId: traceInvestigationSnapshot?.requestId || null,
          traceHopIndex: traceInvestigationSnapshot?.hopIndex ?? null,
          tracedEntityId: traceInvestigationSnapshot?.entityId || null,
          traceQueueWaitMs: traceInvestigationSnapshot?.queueWaitMs ?? null,
          traceServiceTimeMs: traceInvestigationSnapshot?.serviceTimeMs ?? null,
          traceOperation: traceInvestigationSnapshot?.operation ?? null,
          traceWriteContentionMs: traceInvestigationSnapshot?.writeContentionMs ?? null,
          interventionEvidence: improvement.evidence || null,
          proposedIndex: improvement.proposedIndex || null,
          modelingLimit: improvement.modelingLimit || null,
          before: improvement.before,
          after: improvement.after,
          baseProfileSnapshot: deepClone(draftProfile),
          note: "Controlled synthetic experiment. Only the test profile changed; the canonical model and saved base profile were not modified.",
        },
      };
      const entry = createSimulationHistoryEntry(historySuite, { workbench, simulationProfile: improvement.profile });
      entry.experimentMetadata = historySuite.experimentMetadata;
      onUpdateSimulationHistory?.(appendSimulationHistory(simulationHistory, entry));
    } catch (error) {
      setImprovementError(error.message || "Could not run the improvement experiment.");
    }
  };
  const runCapacityImprovement = () => runImprovementExperiment("capacity");
  const runServiceTimeImprovement = () => runImprovementExperiment("service-time");
  const runDatabaseContentionImprovement = () => runImprovementExperiment("write-contention");
  const runDatabaseIndexImprovement = () => runImprovementExperiment("database-index");
  const applyProposedIndexToSchema = () => {
    const proposed = improvementResult?.proposedIndex;
    const table = proposed ? entitiesById.get(proposed.tableEntityId) : null;
    if (!canEdit || typeof onUpdateEntity !== "function" || !proposed || !table || table.kind !== "data.postgresql-table") {
      setImprovementError("The proposed index cannot be added to the model in the current context. Check edit permissions and the target table.");
      return;
    }
    try {
      const raw = table.properties?.indexes;
      const existingIndexes = raw == null || String(raw).trim() === "" ? [] : typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(existingIndexes)) throw new Error("The table indexes property must be a JSON array before adding a proposed index.");
      if (existingIndexes.some((index) => index?.name === proposed.indexName || (Array.isArray(index?.columns) && index.columns.includes(proposed.columnName)))) {
        setSchemaUpdateNotice(`An index on ${proposed.tableName}.${proposed.columnName} is already modeled. Review the table schema and regenerate SQL.`);
        return;
      }
      const nextIndexes = [...existingIndexes, { name: proposed.indexName, columns: [proposed.columnName], method: "btree", unique: false }];
      onUpdateEntity(table.id, { properties: { indexes: JSON.stringify(nextIndexes, null, 2) } });
      setSchemaUpdateNotice(`Candidate index added to the schema model: ${proposed.indexName}. Switch to Build and regenerate SQL. The experiment results are historical for the previous model revision.`);
      setImprovementError("");
    } catch (error) {
      setImprovementError(`Could not add the candidate index: ${error.message}`);
    }
  };

  return <section id="workbench-experiments" className="workbench-section sim-experiment-panel" aria-label="Simulation experiments">
    <div className="workbench-section-heading"><span>EXPERIMENTS</span><span className="workbench-count">{results?.status === "completed" ? Object.keys(results.runs).length : "—"}</span></div>
    <p className="workbench-section-intro">Run modeled scenarios with explicit assumptions. Results are synthetic, not live-system measurements.</p>
    {missingTrafficSource && <div className="sim-view-scope-notice" role="status">
      <span className="sim-view-scope-icon" aria-hidden="true">↗</span>
      <div><strong>No React traffic source in this view</strong><p>Run experiments from a view containing the React application. The POC's complete request path is available in the System view.</p>
        {activeViewId !== "system" ? <button type="button" onClick={() => onSwitchView?.("system")}>Switch to System view</button> : <button type="button" onClick={() => onSwitchToAdd?.()}>Browse components</button>}
      </div>
    </div>}
    <details className="sim-scope-explainer"><summary>What gets simulated?</summary><p>Only runtime components reachable from a React traffic source through typed relationships are included. Disconnected components remain in your document but are excluded from the current run.</p></details>
    {typedRequestGuidance && <section className="sim-typed-request-guidance" aria-label="Connect the typed simulation request path">
      <strong>Connect the typed request path</strong>
      <p>The arrows already drawn on the canvas are visual only unless they are linked to a Workbench relationship. Use the actions below to add the semantic relationship; a matching bound arrow will be reused instead of duplicated.</p>
      <ol>{typedRequestGuidance.missingLinks.map((link) => <li key={link.id}>
        <strong>{link.title}</strong><small>{link.instruction}</small>
        {!link.canCreate && <small className="sim-guidance-placement-note">Place both components in the active view before creating this relationship.</small>}
        <div className="sim-guidance-actions">
          <button type="button" disabled={!canEdit || !link.canCreate || !onCreateTypedRelation} onClick={() => onCreateTypedRelation?.({ sourceId: link.from.id, kind: link.relationKind, targetId: link.to.id })}>Create {link.relationLabel === "Calls" ? "Calls" : link.relationKind === "reads" ? "Reads from" : link.relationLabel} relationship</button>
          {link.alternativeRelationKind && <button type="button" className="workbench-secondary" disabled={!canEdit || !link.canCreate || !onCreateTypedRelation} onClick={() => onCreateTypedRelation?.({ sourceId: link.from.id, kind: link.alternativeRelationKind, targetId: link.to.id })}>Create Writes to relationship</button>}
          <button type="button" className="workbench-secondary" onClick={() => onFocusEntity?.(link.focusEntityId)}>Focus {link.from.name || link.from.kind}</button>
        </div>
      </li>)}</ol>
      <p className="sim-typed-request-guidance-next">Create the Calls relationship first. The simulator then follows only the typed-connected path. Review the newly in-scope profile and confirm its synthetic assumptions before running.</p>
    </section>}
    {!draftProfile ? <button type="button" className="workbench-secondary sim-profile-prepare" disabled={!canEdit || !workbench?.entities?.length || missingTrafficSource || (simulationScope.scoped && simulationScope.seedEntityIds.length === 0)} onClick={prepareProfile}>Prepare illustrative profile</button> : <>
      <div className="sim-profile-summary">
        <strong>{availableProfileEntities.length} profiled runtime component(s) in this scope</strong>
        <span>{simulationScope.scoped ? "Traffic sources and their typed-connected runtime path" : "Whole-model scope"} · illustrative profile — not measured</span>
      </div>
      <details className="sim-profile-editor" open={profileEditorOpen} onToggle={(event) => setProfileEditorOpen(event.currentTarget.open)}>
        <summary>Simulation assumptions and workload <span className="sim-profile-editor-summary-note">{profileEditorOpen ? "hide settings" : "edit settings"}</span></summary>
        <div className="sim-profile-scenario-fields">
          <label><span>Observation window (seconds)</span><input type="number" min="1" max="3600" value={(draftProfile.defaultScenario?.durationMs || 15000) / 1000} disabled={!canEdit} onChange={(event) => { const next = deepClone(draftProfile); next.defaultScenario ||= {}; next.defaultScenario.durationMs = Math.round(Number(event.target.value) * 1000); next.profileKind = "illustrative-synthetic"; setDraftProfile(next); setAcknowledged(false); setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null); }} /></label>
          <label><span>Random seed</span><input type="number" step="1" value={draftProfile.defaultScenario?.seed ?? 211} disabled={!canEdit} onChange={(event) => { const next = deepClone(draftProfile); next.defaultScenario ||= {}; next.defaultScenario.seed = Number(event.target.value); next.profileKind = "illustrative-synthetic"; setDraftProfile(next); setAcknowledged(false); setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null); }} /></label>
        </div>
        {availableProfileEntities.map(({ entity, entityId, profile }) => <details className="sim-profile-entity" key={entityId}>
          <summary><span>{entity.name || entity.id}</span><small>{profile.kind}</small></summary>
          <div className="sim-profile-field-grid">
            {(SIMULATION_PROFILE_FIELD_DEFINITIONS[profile.kind] || []).map((field) => <label key={field.key}>
              <span>{field.label}</span>
              <input type="number" min={field.min} max={field.max} step={field.step} value={profile.parameters?.[field.key] ?? ""} disabled={!canEdit} onChange={(event) => {
                const parsed = event.target.value === "" ? "" : Number(event.target.value);
                setDraftProfile((current) => setField(current, entityId, field.key, parsed));
                setProfileEditorOpen(true);
                setAcknowledged(false);
                setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
              }} />
            </label>)}
            <p className="sim-profile-assumption-note">Values are scenario assumptions. This prototype does not infer them from live infrastructure.</p>
          </div>
        </details>)}
        {missingProfileEntityIds.length > 0 && <div className="sim-profile-warning">{missingProfileEntityIds.length} supported component(s) lack a profile. Add proposed profiles and review their values before running.</div>}
        <div className="sim-profile-actions">
          {missingProfileEntityIds.length > 0 && <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={syncProfiles}>Add missing profiles</button>}
          <button type="button" className="workbench-secondary" disabled={!canEdit || !unsaved} onClick={saveProfile}>Save profile</button>
        </div>
        <label className="sim-confirm-assumptions"><input type="checkbox" checked={acknowledged} disabled={!canEdit} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I reviewed these synthetic assumptions and accept them for this experiment.</span></label>
      </details>
      {externalApprox && <p className="sim-profile-warning">External APIs use a generic approximation. This warning does not block a run after you confirm assumptions; results are not provider measurements.</p>}
      <div className="sim-traffic-control">
        <label htmlFor="sim-traffic-multiplier"><span>Traffic-surge scenario</span><strong>{trafficMultiplier}× offered load</strong></label>
        <input id="sim-traffic-multiplier" aria-label="Traffic-surge multiplier" type="range" min="2" max="10" step="1" value={trafficMultiplier} disabled={!canEdit} onChange={(event) => setTrafficMultiplier(Number(event.target.value))}/>
        <div className="sim-traffic-range-labels"><span>2×</span><span>10×</span></div>
        <small>Baseline uses the configured traffic rate. This multiplier applies only to the surge scenario.</small>
      </div>
      <button type="button" className="workbench-primary sim-run-button" disabled={!canEdit || missingTrafficSource || unsaved || missingProfileEntityIds.length > 0 || typedCallMissing || (simulationScope.scoped && simulationScope.seedEntityIds.length === 0)} onClick={runExperiments}>{missingTrafficSource ? "Switch to System view to run" : typedCallMissing ? "Create Calls relationship to run" : "Run experiments"}</button>
    </>}
    {profileError && <p className="sim-inline-note" role="status">{profileError}</p>}
    {runError && <p className="workbench-inspector-error" role="alert">{runError}</p>}
    {simulationHistory.length > 0 && <details className="sim-history-list">
      <summary><span>Saved experiment history</span><small>{simulationHistory.length} saved · latest 5 retained</small></summary>
      <div className="sim-history-items">
        {simulationHistory.map((entry) => <div className="sim-history-item" key={entry.id}>
          <div><strong>{new Date(entry.createdAt).toLocaleString()}</strong><small>{entry.status} · {entry.engineVersion || "engine version unavailable"}</small><small>Model {entry.modelFingerprint ? `${entry.modelFingerprint.slice(0, 12)}…` : "fingerprint unavailable"}</small></div>
          <button type="button" className="workbench-secondary" onClick={() => {
            try {
              const restored = restoreSimulationHistoryEntry(entry);
              const savedMultiplier = Number(restored.runs?.trafficSurge?.overrides?.trafficMultiplier ?? 5);
              const safeMultiplier = Number.isFinite(savedMultiplier) && savedMultiplier >= 2 && savedMultiplier <= 10 ? savedMultiplier : 5;
              setTrafficMultiplier(safeMultiplier);
              setResults({ ...restored, trafficMultiplier: safeMultiplier });
              setInvestigation(null);
              setProfileEditorOpen(false); setShowAllExplanations(false); setImprovementResult(null); setImprovementError(""); setActiveRunKey("baseline"); setRunError("");
            } catch (error) { setRunError(`Could not open saved experiment: ${error.message}`); }
          }}>Open results</button>
        </div>)}
      </div>
    </details>}
    {results && <div className="sim-results-area">
      {results.historyCreatedAt && <>
        <p className="sim-inline-note">Viewing saved results from {new Date(results.historyCreatedAt).toLocaleString()}. These are recorded synthetic outputs; opening them does not rerun the engine.{results.experimentMetadata?.kind === "one-variable-improvement" ? ` Controlled experiment: ${results.experimentMetadata.title}.` : ""}</p>
        <details className="sim-history-assumptions"><summary>Recorded assumptions ({Object.keys(results.historyProfileSnapshot?.profilesByEntityId || {}).length} components)</summary>
          <div className="sim-history-assumption-list">{Object.entries(results.historyProfileSnapshot?.profilesByEntityId || {}).filter(([entityId]) => !Array.isArray(results.provenance?.scopeEntityIds) || results.provenance.scopeEntityIds.includes(entityId)).map(([entityId, profile]) => <div key={entityId}><strong>{resultsEntitiesById.get(entityId)?.name || entityId}</strong><small>{profile.kind}</small><code>{JSON.stringify(profile.parameters || {})}</code></div>)}</div>
          <small>These are the values recorded for this historical run. They are not live telemetry and do not imply the current model uses the same values.</small>
        </details>
      </>}
      {staleModel && <p className="sim-stale-banner">The current semantic model or simulation profile differs from the inputs recorded for these results. The saved comparison remains historical; rerun to evaluate the current inputs.</p>}
      {results.status === "blocked" && <div className="sim-blocked-results"><strong>Simulation blocked</strong><p>Resolve the blocking model, profile, or engine diagnostics shown below, then rerun the scenario.</p>
        {resultDiagnosticGroups.blocking.length === 0
          ? <div className="sim-diagnostic"><strong>No explicit blocking diagnostic was returned</strong><small>The suite reported a blocked status without a blocker-level cause. Warnings below are advisory and should not be treated as the reason execution stopped.</small></div>
          : resultDiagnosticGroups.blocking.map((diagnostic, index) => (
              <div className="sim-diagnostic" key={`${diagnostic.code}-${index}`}>
                <strong>{diagnostic.title}</strong>
                <small>{diagnostic.message}</small>
                {diagnostic.entityIds?.length > 0 && (
                  <button type="button" onClick={() => onFocusEntity?.(diagnostic.entityIds[0])}>
                    Focus component
                  </button>
                )}
              </div>
            ))}
      </div>}
      {results.status === "blocked" && (resultDiagnosticGroups.warnings.length > 0 || resultDiagnosticGroups.info.length > 0) && <div className="sim-advisory-results"><strong>Warnings and context — not blockers</strong>
        {[...resultDiagnosticGroups.warnings, ...resultDiagnosticGroups.info].map((diagnostic, index) => (
          <div className={`sim-diagnostic ${diagnostic.severity === "warning" ? "warning" : "info"}`} key={`${diagnostic.code}-${index}`}>
            <strong>{diagnostic.title}</strong>
            <small>{diagnostic.message}</small>
            {diagnostic.entityIds?.length > 0 && (
              <button type="button" onClick={() => onFocusEntity?.(diagnostic.entityIds[0])}>
                Focus component
              </button>
            )}
          </div>
        ))}
      </div>}
      {results.status !== "blocked" && <>
        <ScenarioComparisonOverview overview={scenarioOverview} onFocusEntity={onFocusEntity} onSelectScenario={setActiveRunKey} />
        {results.status === "completed" && <section className="sim-improvement-lab" aria-label="Test an improvement">
          <div className="sim-improvement-heading"><strong>TEST AN IMPROVEMENT</strong><small>Controlled one-variable experiment</small></div>
          <p>Test one hypothesis at a time under the same stressed scenario: add concurrency when capacity pressure is recorded, reduce mean service time when timing evidence supports it, or reduce PostgreSQL write-contention overhead when the run records writes with applied contention. These are synthetic what-if experiments, not guaranteed real-world fixes. Outage scenarios are excluded.</p>
          {capacityScenario && <p className="sim-capacity-target">Comparison target: <strong>{capacityScenario.label}</strong>. Each trial reruns this same scenario with the same seed, duration, model, and traffic multiplier.</p>}
          {capacityTraceTargetEntityId && <p className="sim-capacity-target">Capacity target from current evidence: <strong>{entitiesById.get(capacityTraceTargetEntityId)?.name || capacityTraceTargetEntityId}</strong>.</p>}
          {serviceTimeTraceTargetEntityId && <p className="sim-capacity-target">Service-time target from the selected trace: <strong>{entitiesById.get(serviceTimeTraceTargetEntityId)?.name || serviceTimeTraceTargetEntityId}</strong>. Recorded service time is at least as large as queue wait for this hop.</p>}
          <div className="sim-improvement-actions">
            <button type="button" className="workbench-secondary" disabled={!canEdit || unsaved || staleModel || !capacityScenarioKey} onClick={runCapacityImprovement}>{capacityTraceTargetEntityId ? `Test capacity at ${entitiesById.get(capacityTraceTargetEntityId)?.name || "selected component"}` : "Test higher concurrency"}</button>
            <button type="button" className="workbench-secondary" disabled={!canEdit || unsaved || staleModel || !capacityScenarioKey} onClick={runServiceTimeImprovement}>{serviceTimeTraceTargetEntityId ? `Test service time at ${entitiesById.get(serviceTimeTraceTargetEntityId)?.name || "selected component"}` : "Test lower service time"}</button>
          </div>
          <details className="sim-database-contention-experiment">
            <summary>PostgreSQL write-contention hypothesis {databaseContentionTargetEntityId ? "· available" : "· needs write evidence"}</summary>
            <p>Tests a 20% reduction in the model's per-write contention overhead. It does not tune a real SQL query or database setting.</p>
            {databaseContentionTargetEntityId
              ? <button type="button" className="workbench-secondary" disabled={!canEdit || unsaved || staleModel || !capacityScenarioKey} onClick={runDatabaseContentionImprovement}>{databaseContentionTraceTargetEntityId ? `Test write contention at ${entitiesById.get(databaseContentionTraceTargetEntityId)?.name || "PostgreSQL"}` : `Test lower write contention at ${entitiesById.get(databaseContentionTargetEntityId)?.name || "PostgreSQL"}`}</button>
              : <p className="sim-capacity-target">Available only when this scenario records PostgreSQL write operations with non-zero modeled contention overhead. A read-only relationship cannot produce write-contention evidence.</p>}
          </details>
          <details className="sim-database-index-experiment">
            <summary>Query / index hypothesis {selectedDatabaseIndexCandidate ? "· candidate available" : "· needs read evidence"}</summary>
            <p>Tests whether a share of database reads benefiting from a proposed btree index would change this stressed scenario. The engine models an assumed read-time speedup; it does not parse SQL, select indexes, or run a PostgreSQL query planner.</p>
            {databaseIndexCandidates.length > 0 ? <>
              <label className="sim-index-candidate-select"><span>Candidate table column</span><select value={candidateKey(selectedDatabaseIndexCandidate)} disabled={!canEdit || unsaved || staleModel} onChange={(event) => setDatabaseIndexCandidateKey(event.target.value)}><option value="">Choose a column to hypothesize an index…</option>{databaseIndexCandidates.map((candidate) => <option key={candidateKey(candidate)} value={candidateKey(candidate)}>{candidate.tableName}.{candidate.columnName} · {candidate.databaseName}</option>)}</select></label>
              <small className="sim-capacity-target">{selectedDatabaseIndexCandidate ? `Scenario recorded ${formatInteger(selectedDatabaseIndexCandidate.evidence.readOperationsStarted)} read operation(s); assumed speedup is ${formatDecimal(selectedDatabaseIndexCandidate.speedupFactor, 1)}× for the reads counted as index-benefiting.` : "Choose the column the hypothetical query filters or sorts by. Aggregate read metrics cannot identify that column for you."}</small>
              <button type="button" className="workbench-secondary" disabled={!canEdit || unsaved || staleModel || !capacityScenarioKey || !selectedDatabaseIndexCandidate} onClick={runDatabaseIndexImprovement}>{selectedDatabaseIndexCandidate ? `Test proposed index on ${selectedDatabaseIndexCandidate.tableName}.${selectedDatabaseIndexCandidate.columnName}` : "Choose a candidate column"}</button>
            </> : <p className="sim-capacity-target">Available when the selected load scenario records read operations on a typed Reads from path and the PostgreSQL database contains a table with an unindexed, non-primary-key column.</p>}
          </details>
          {schemaUpdateNotice && <p className="sim-inline-note" role="status">{schemaUpdateNotice}</p>}
          {improvementError && <p className="workbench-inspector-error" role="alert">{improvementError}</p>}
          {improvementResult && <div className="sim-improvement-result" role="status">
            <strong>{improvementResult.label}</strong>
            <p>{improvementResult.field === "concurrency"
              ? `Concurrency changed from ${improvementResult.before} to ${improvementResult.after} for this experiment only.`
              : improvementResult.field === "meanServiceMs"
                ? `Mean service time changed from ${formatDecimal(improvementResult.before)} ms to ${formatDecimal(improvementResult.after)} ms for this experiment only.`
                : improvementResult.field === "writeContentionMs"
                  ? `Modeled PostgreSQL write-contention overhead changed from ${formatDecimal(improvementResult.before, 4)} to ${formatDecimal(improvementResult.after, 4)} ms per write operation for this experiment only.`
                  : `Share of reads assumed to benefit from the proposed index changed from ${formatPercent(improvementResult.before)} to ${formatPercent(improvementResult.after)}. The assumed speedup factor remains ${formatDecimal(improvementResult.evidence?.assumedIndexedReadSpeedupFactor ?? 3, 1)}×.`}</p>
            {improvementResult.proposedIndex && <div className="sim-index-hypothesis-result"><strong>Proposed schema index</strong><p>{improvementResult.proposedIndex.tableName}.{improvementResult.proposedIndex.columnName} · btree · synthetic what-if only</p><pre>{improvementResult.proposedIndex.sqlStatement}</pre><small>No SQL planner or live database was consulted. Validate the candidate with real query plans and workload measurements before treating it as an optimization.</small><button type="button" className="workbench-secondary" disabled={!canEdit || typeof onUpdateEntity !== "function" || staleModel} onClick={applyProposedIndexToSchema}>Add candidate index to schema model</button></div>}
            <p className="sim-capacity-target">Compared under <strong>{improvementResult.comparisonScenarioLabel}</strong>, not against an unstressed baseline.</p>
            {improvementResult.traceInvestigationSnapshot && <p className="sim-capacity-target">Target linked to request <strong>{improvementResult.traceInvestigationSnapshot.requestId}</strong> at hop {improvementResult.traceInvestigationSnapshot.hopIndex + 1}. The selected trace is evidence for investigation, not proof that the parameter change caused the observed outcome.</p>}
            <div className={`sim-improvement-outcome status-${improvementResult.outcomeSummary.status}`} role="status"><strong>{improvementResult.outcomeSummary.status === "improved" ? "Measured outcomes improved" : improvementResult.outcomeSummary.status === "mixed" ? "Mixed result — review trade-offs" : improvementResult.outcomeSummary.status === "regressed" ? "Measured outcomes regressed" : improvementResult.outcomeSummary.status === "no-material-change" ? "No material change measured" : "Comparison inconclusive"}</strong><p>{improvementResult.outcomeSummary.message}</p>{improvementResult.outcomeSummary.gains.length > 0 && <ul>{improvementResult.outcomeSummary.gains.map((item) => <li key={item.key}>{item.label} {item.direction} by {formatDecimal(item.change)} {item.unit}</li>)}</ul>}{improvementResult.outcomeSummary.regressions.length > 0 && <ul>{improvementResult.outcomeSummary.regressions.map((item) => <li key={item.key}>{item.label} {item.direction} by {formatDecimal(item.change)} {item.unit}</li>)}</ul>}</div>
            <div className="sim-improvement-metrics"><div><span>Success rate</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "successRate"))}</strong></div><div><span>Throughput (req/sec)</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "throughputRps"))}</strong></div><div><span>p95 latency (ms)</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "p95LatencyMs"))}</strong></div><div><span>Dropped requests</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "droppedRequests"))}</strong></div></div>
            <ImprovementTimeSeriesComparison comparison={improvementResult.timeSeriesComparison} investigation={improvementResult.traceInvestigationSnapshot}/>
            <small>Original scenario → improved version of that same scenario. These are synthetic model outputs, not production measurements. The trial was added to Saved experiment history.</small>
          </div>}
        </section>}
        {results.status === "partial" && <p className="sim-profile-warning">One or more scenarios were blocked. Completed scenarios remain available below.</p>}
        <div className="sim-run-tabs" role="tablist" aria-label="Simulation scenarios">
          {Object.entries(results.runs).map(([key, run]) => <button type="button" role="tab" aria-selected={activeRunKey === key} className={activeRunKey === key ? "active" : ""} key={key} onClick={() => setActiveRunKey(key)}>{run.label}</button>)}
        </div>
        {activeRun?.result?.status === "completed" ? <>
          <RunMetrics run={activeRun} />
          <SimulationTimeSeries run={activeRun} investigation={activeInvestigation} />
          <RequestTraceExplorer key={activeRunKey} run={activeRun} scenarioKey={activeRunKey} onFocusEntity={onFocusEntity} investigation={investigation} onInvestigateTrace={(next) => setInvestigation(next)} />
          {comparison?.status === "ready" && <div className="sim-comparison-table-wrap"><strong>Change versus baseline</strong><table className="sim-comparison-table"><thead><tr><th>Metric</th><th>Baseline → current</th><th>Δ</th></tr></thead><tbody>{comparison.metrics.map((row) => <tr key={row.key}><td>{row.label}</td><td>{compareValue(row)}</td><td>{row.key === "successRate" ? formatPercent(row.delta.absolute) : isFiniteNumber(row.delta.absolute) ? `${row.delta.absolute > 0 ? "+" : ""}${formatDecimal(row.delta.absolute, row.unit === "requests" ? 0 : 2)}${row.unit === "requests" ? "" : row.unit === "requests/sec" ? " rps" : row.unit === "ms" ? " ms" : ""}` : "—"}</td></tr>)}</tbody></table></div>}
          <div className="sim-explanations"><div className="workbench-section-heading"><span>WHY THESE RESULTS?</span><span className="workbench-count">{explanations.length}</span></div>
            {explanations.length === 0 ? <p className="workbench-findings-empty">No capacity or request-failure signal crossed the current explanation thresholds for this run. This does not prove the design is production-safe.</p> : <>
              {explanations.slice(0, showAllExplanations ? explanations.length : 2).map((finding) => <button type="button" className={`sim-explanation ${finding.severity}`} key={finding.id} onClick={() => finding.entityIds?.[0] && onFocusEntity?.(finding.entityIds[0])}><strong>{finding.title}</strong><span>{finding.message}</span><em>{finding.suggestedAction}</em>{finding.entityIds?.length > 0 && <small>Focus component on canvas</small>}</button>)}
              {explanations.length > 2 && <button type="button" className="sim-show-more-explanations" aria-expanded={showAllExplanations} onClick={() => setShowAllExplanations((value) => !value)}>{showAllExplanations ? "Show fewer explanations" : `Show all ${explanations.length} explanations`}</button>}
            </>}
          </div>
          <details className="sim-provenance"><summary>Run provenance and assumptions</summary>
            <dl><dt>Model revision</dt><dd>{results.provenance.modelRevision ?? "unknown"}</dd><dt>Model fingerprint</dt><dd>{results.provenance.modelFingerprint || "unavailable"}</dd><dt>Profile fingerprint</dt><dd>{results.provenance.profileFingerprint || "unavailable"}</dd><dt>Adapter version</dt><dd>{results.provenance.adapterVersion}</dd><dt>Engine version</dt><dd>{results.provenance.engineVersion}</dd><dt>Run fingerprint</dt><dd>{activeRun.result.result.simulation.runFingerprint}</dd><dt>Scenario overrides</dt><dd>{JSON.stringify(activeRun.overrides || {})}</dd><dt>Seed</dt><dd>{activeRun.result.result.simulation.seed}</dd><dt>Observation window</dt><dd>{formatDecimal(activeRun.result.result.simulation.durationMs / 1000)} seconds</dd></dl>
            <strong className="sim-assumption-ledger-title">Assumptions used for this run</strong>
            <div className="sim-assumption-ledger">{Object.entries(resultsProfile?.profilesByEntityId || {}).filter(([entityId]) => {
              const ids = Array.isArray(results.runScopeEntityIds) ? results.runScopeEntityIds : results.provenance?.scopeEntityIds;
              return !Array.isArray(ids) || ids.includes(entityId);
            }).map(([entityId, item]) => <div key={entityId}><strong>{resultsEntitiesById.get(entityId)?.name || entityId}</strong><small>{item.kind}</small><p>{Object.entries(item.parameters || {}).map(([field, value]) => `${field}: ${String(value)}`).join(" · ")}</p></div>)}</div>
            <p>Metrics are produced by a synthetic discrete-event model using the displayed profiles. They are not measurements or forecasts guaranteed to match a live system.</p>
          </details>
        </> : <>
          <div className="sim-blocked-results"><strong>Scenario could not run</strong>
            {activeRunDiagnosticGroups.blocking.length === 0
              ? <div className="sim-diagnostic"><strong>No explicit blocking diagnostic was returned</strong><small>Inspect the advisory messages separately; an approximation warning is not a blocker.</small></div>
              : activeRunDiagnosticGroups.blocking.map((diagnostic, index) => <div className="sim-diagnostic" key={`${diagnostic.code}-${index}`}><strong>{diagnostic.title}</strong><small>{diagnostic.message}</small></div>)}
          </div>
          {(activeRunDiagnosticGroups.warnings.length > 0 || activeRunDiagnosticGroups.info.length > 0) && <div className="sim-advisory-results"><strong>Warnings and context — not blockers</strong>{[...activeRunDiagnosticGroups.warnings, ...activeRunDiagnosticGroups.info].map((diagnostic, index) => <div className={`sim-diagnostic ${diagnostic.severity === "warning" ? "warning" : "info"}`} key={`${diagnostic.code}-${index}`}><strong>{diagnostic.title}</strong><small>{diagnostic.message}</small></div>)}</div>}
        </>}
      </>}
    </div>}
  </section>;
}
