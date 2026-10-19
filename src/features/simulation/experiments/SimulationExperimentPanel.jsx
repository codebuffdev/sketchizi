import { useEffect, useMemo, useRef, useState } from "react";
import { runWorkbenchExperiments, runTrafficSweep, runResilienceMatrix, runFailureChainMatrix } from "../runWorkbenchExperiments.js";
import { getTypedRequestGuidance } from "./typedRequestGuidance.js";
import { partitionSimulationDiagnostics } from "./diagnosticPresentation.js";
import { deriveSimulationScope } from "../adapter/deriveSimulationScope.js";
import { appendSimulationHistory, assessSimulationReproducibility, compareSimulationHistoryEntries, createSimulationHistoryEntry, createSimulationModelSnapshot, renameSimulationHistoryEntry, restoreSimulationHistoryEntry, searchSimulationHistory, simulationResultsAreStale } from "./simulationHistory.js";
import { createSimulationEvidenceReport } from "./simulationEvidenceReport.js";
import { compareSimulationEvidenceReports, parseSimulationEvidenceReport } from "./simulationEvidenceComparison.js";
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
import {
  INFRASTRUCTURE_EVIDENCE_OPTIONS,
  INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS,
  ensureInfrastructureProfileDefaults,
  summarizeInfrastructureProfile,
  updateInfrastructureField,
} from "./infrastructureProfile.js";
import {
  LOAD_TEST_MEASUREMENT_FIELDS,
  assessLoadTestEvidence,
  assessObservedOperatingEnvelope,
  compareLoadTestToSimulation,
  createEmptyLoadTestRecord,
  createLoadTestJsonTemplate,
  normalizeLoadTestRecord,
  parseLoadTestEvidenceJson,
  parseJMeterLoadTestText,
  proposeServiceTimeCalibrations,
} from "./loadTestCalibration.js";

const deepClone = (value) => structuredClone(value);

function downloadSimulationEvidence(experimentType, results) {
  if (!results || typeof document === "undefined") return;
  const artifact = createSimulationEvidenceReport({ experimentType, results });
  const blob = new Blob([artifact.text], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.rel = "noopener";
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 1000);
}
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
    infrastructureByEntityId: Object.fromEntries(Object.entries(profile.infrastructureByEntityId || {}).filter(([entityId]) => included.has(entityId))),
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

function simulationInputValues(profile) {
  if (!profile) return null;
  const profilesByEntityId = Object.fromEntries(Object.keys(profile.profilesByEntityId || {}).sort().map((id) => {
    const item = profile.profilesByEntityId[id] || {};
    return [id, { kind: item.kind, parameters: item.parameters || {} }];
  }));
  return { schemaVersion: profile.schemaVersion, defaultScenario: profile.defaultScenario || {}, profilesByEntityId };
}

function runConfigurationValues(profile) {
  if (!profile) return null;
  const infrastructureByEntityId = Object.fromEntries(Object.keys(profile.infrastructureByEntityId || {}).sort().map((id) => {
    const item = profile.infrastructureByEntityId[id] || {};
    return [id, { schemaVersion: item.schemaVersion, entityKind: item.entityKind, fields: item.fields || {} }];
  }));
  return { ...simulationInputValues(profile), infrastructureByEntityId };
}

function profileValues(profile) {
  if (!profile) return null;
  return {
    ...runConfigurationValues(profile),
    loadTestEvidence: profile.loadTestEvidence?.records || [],
  };
}

function profileIsSame(a, b) {
  return JSON.stringify(profileValues(a)) === JSON.stringify(profileValues(b));
}

function runConfigurationIsSame(a, b) {
  return JSON.stringify(runConfigurationValues(a)) === JSON.stringify(runConfigurationValues(b));
}

function formatCalibrationValue(value, unit) {
  if (!isFiniteNumber(value)) return "—";
  const rendered = unit === "requests" ? formatInteger(value) : formatDecimal(value, 2);
  return unit === "%" ? `${formatDecimal(value, 2)}%` : unit ? `${rendered} ${unit}` : rendered;
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
    <MetricCard label="Failed" value={formatInteger(metrics.failedRequests)} detail={`${formatInteger(metrics.dependencyUnavailableRequests || 0)} dependency · ${formatInteger(metrics.componentFailedRequests || 0)} component`} />
    <MetricCard label="In flight at window end" value={formatInteger(metrics.requestsInFlightAtWindowEnd || 0)} detail={`${formatInteger(metrics.requestsQueuedAtWindowEnd || 0)} queued · ${formatInteger(metrics.requestsInServiceAtWindowEnd || 0)} in service`} />
  </div>;
}

function ObservationBoundaryTable({ run }) {
  const result = run?.result?.result;
  const boundary = result?.timeSeries?.observationBoundary;
  const rows = Array.isArray(boundary?.byNode) ? boundary.byNode : [];
  if (!boundary || rows.length === 0) return null;
  const perNode = Array.isArray(result?.perNode) ? result.perNode : [];
  const nodeLabel = (row) => perNode.find((node) => node.nodeId === row.nodeId)?.label || row.sourceEntityId || row.nodeId;
  return <details className="sim-observation-boundary">
    <summary>Queued and in-service requests at the observation boundary <small>{formatInteger(boundary.inFlightRequests)} in flight</small></summary>
    <p>This is a point-in-time snapshot at {formatDecimal(boundary.capturedAtMs / 1000)} seconds, before the post-window drain. It is not an additional terminal outcome.</p>
    <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Component</th><th>In service</th><th>Queued</th><th>In flight</th></tr></thead><tbody>{rows.map((row) => <tr key={row.nodeId}><td>{nodeLabel(row)}</td><td>{formatInteger(row.activeServiceRequests)}</td><td>{formatInteger(row.queuedRequests)}</td><td>{formatInteger(row.inFlightRequests)}</td></tr>)}</tbody></table></div>
    {boundary.inFlightRequests === 0 && <p>No requests were active or queued at the observation boundary.</p>}
  </details>;
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
  const traceOutcomeLabel = (trace) => trace?.failureKind === "dependency-unavailable" ? "Dependency unavailable" : trace?.failureKind === "component-failure" ? "Component failure" : outcomeLabel(trace?.outcome);
  const hopOutcomeLabel = (outcome) => ({ sent: "Traffic offered", success: "Request completed", completed: "Hop completed", failed: "Failed here", unavailable: "Dependency unavailable", dropped: "Dropped before service" })[outcome] || String(outcome || "Unknown");
  const displayTime = (value) => isFiniteNumber(value) ? `${formatDecimal(value, 2)} ms` : "Not recorded";
  return <details className="sim-request-traces">
    <summary><span>Request-level traces</span><small>{traces.length} sampled · {formatInteger(totalRequests)} terminal requests</small></summary>
    <p>Trace samples are recorded from discrete-event request lifecycles. We keep a few examples of each outcome plus the slowest requests; this is not a full distributed trace of a deployed service.</p>
    <label className="sim-request-trace-select">Request sample
      <select aria-label="Select request trace" value={selectedTrace?.requestId || ""} onChange={(event) => setSelectedRequestId(event.target.value)}>
        {traces.map((trace) => <option key={trace.requestId} value={trace.requestId}>{trace.requestId} · {traceOutcomeLabel(trace)} · {formatDecimal(trace.totalLatencyMs)} ms</option>)}
      </select>
    </label>
    {selectedTrace && <>
      <div className={`sim-request-trace-summary outcome-${selectedTrace.outcome}`}>
        <div><span>Outcome</span><strong>{traceOutcomeLabel(selectedTrace)}</strong></div>
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
  const [draftProfile, setDraftProfile] = useState(() => ensureInfrastructureProfileDefaults(ensureDatabaseIndexProfileDefaults(simulationProfile), workbench));
  const draftProfileRef = useRef(draftProfile);
  draftProfileRef.current = draftProfile;
  const [acknowledged, setAcknowledged] = useState(() => profileIsConfirmed(profileForEntityIds(simulationProfile, simulationScope.entityIds)));
  const [results, setResults] = useState(null);
  const [trafficSweepResults, setTrafficSweepResults] = useState(null);
  const [trafficSweepError, setTrafficSweepError] = useState("");
  const [resilienceMatrixResults, setResilienceMatrixResults] = useState(null);
  const [resilienceMatrixError, setResilienceMatrixError] = useState("");
  const [failureChainResults, setFailureChainResults] = useState(null);
  const [failureChainError, setFailureChainError] = useState("");
  const [evidenceComparison, setEvidenceComparison] = useState(null);
  const [evidenceComparisonError, setEvidenceComparisonError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyCompareIds, setHistoryCompareIds] = useState([]);
  const [historyComparison, setHistoryComparison] = useState(null);
  const [historyActionError, setHistoryActionError] = useState("");
  const [historyRerunComparison, setHistoryRerunComparison] = useState(null);
  const [historyRerunBusyId, setHistoryRerunBusyId] = useState("");
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
  const [loadTestDraft, setLoadTestDraft] = useState(() => createEmptyLoadTestRecord());
  const [loadTestImportText, setLoadTestImportText] = useState("");
  const [loadTestImportFormat, setLoadTestImportFormat] = useState("json");
  const [loadTestImportMetadata, setLoadTestImportMetadata] = useState({ name: "", testedAt: "", targetEnvironment: "", offeredRps: "", durationSeconds: "", concurrency: "", notes: "" });
  const [loadTestError, setLoadTestError] = useState("");
  const [operatingEnvelopeLatencyTarget, setOperatingEnvelopeLatencyTarget] = useState("");
  const [operatingEnvelopeErrorTarget, setOperatingEnvelopeErrorTarget] = useState("");
  const [selectedLoadTestId, setSelectedLoadTestId] = useState("");

  useEffect(() => {
    // The controller may clone Workbench metadata after an autosave or an unrelated
    // model update. If profile values are unchanged, preserve current results and
    // run-local assumption acknowledgement; modelRevision still marks stale results.
    const next = ensureInfrastructureProfileDefaults(ensureDatabaseIndexProfileDefaults(simulationProfile), workbench);
    const previousDraft = draftProfileRef.current;
    if (profileIsSame(previousDraft, next)) return;
    const simulationConfigurationChanged = !runConfigurationIsSame(previousDraft, next);
    setDraftProfile(next);
    if (simulationConfigurationChanged) {
      setAcknowledged(profileIsConfirmed(profileForEntityIds(next, simulationScope.entityIds)));
      setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
      setProfileError("");
      setRunError("");
    }
  }, [simulationProfile, effectiveScopeSignature, scopeSignature, workbench?.modelRevision]);

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
  const infrastructureByEntityId = draftProfile?.infrastructureByEntityId || {};
  const availableInfrastructureEntities = Object.entries(infrastructureByEntityId).map(([entityId, infrastructure]) => ({ entity: entitiesById.get(entityId), entityId, infrastructure })).filter((item) => item.entity && scopeEntityIdSet.has(item.entityId) && INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS[item.entity.kind]);
  const loadTestRecords = draftProfile?.loadTestEvidence?.records || [];
  const loadTestAssessment = useMemo(() => assessLoadTestEvidence(loadTestRecords), [loadTestRecords]);
  const operatingEnvelope = useMemo(() => assessObservedOperatingEnvelope(loadTestRecords, {
    maxP95LatencyMs: operatingEnvelopeLatencyTarget === "" ? null : Number(operatingEnvelopeLatencyTarget),
    maxErrorRatePercent: operatingEnvelopeErrorTarget === "" ? null : Number(operatingEnvelopeErrorTarget),
  }), [loadTestRecords, operatingEnvelopeLatencyTarget, operatingEnvelopeErrorTarget]);
  const serviceTimeProposals = useMemo(() => proposeServiceTimeCalibrations(loadTestRecords, workbench, draftProfile), [loadTestRecords, workbench, draftProfile]);
  const selectedLoadTestRecord = loadTestRecords.find((record) => record.id === selectedLoadTestId) || loadTestRecords[0] || null;
  const availableProfileEntities = Object.entries(profiles).map(([entityId, profile]) => ({ entity: entitiesById.get(entityId), entityId, profile })).filter((item) => item.entity && scopeEntityIdSet.has(item.entityId));
  const missingProfileEntityIds = useMemo(() => {
    if (!simulationScope.workbench) return [];
    const supported = new Set(["frontend.react-app", "backend.rest-service", "data.postgresql-database", "integrations.external-api"]);
    return simulationScope.workbench.entities.filter((entity) => supported.has(entity.kind) && !profiles[entity.id]).map((entity) => entity.id);
  }, [simulationScope, profiles]);
  const unsaved = Boolean(draftProfile && simulationProfile && !profileIsSame(draftProfile, simulationProfile));
  const staleModel = simulationResultsAreStale(results, workbench, simulationProfile, simulationScope.entityIds)
    || Boolean(results && Number.isFinite(results.trafficMultiplier) && results.trafficMultiplier !== trafficMultiplier);
  const trafficSweepStale = Boolean(trafficSweepResults && (
    unsaved
    || trafficSweepResults.provenance?.modelRevision !== (workbench?.modelRevision ?? null)
    || trafficSweepResults.targets?.maxP95LatencyMs !== (operatingEnvelopeLatencyTarget.trim() === "" ? undefined : Number(operatingEnvelopeLatencyTarget))
    || trafficSweepResults.targets?.maxErrorRatePercent !== (operatingEnvelopeErrorTarget.trim() === "" ? undefined : Number(operatingEnvelopeErrorTarget))
  ));
  const resilienceMatrixStale = Boolean(resilienceMatrixResults && (unsaved || resilienceMatrixResults.provenance?.modelRevision !== (workbench?.modelRevision ?? null) || JSON.stringify(resilienceMatrixResults.provenance?.scopeEntityIds || null) !== JSON.stringify(simulationScope.entityIds)));
  const failureChainStale = Boolean(failureChainResults && (unsaved || failureChainResults.provenance?.modelRevision !== (workbench?.modelRevision ?? null) || JSON.stringify(failureChainResults.provenance?.scopeEntityIds || null) !== JSON.stringify(simulationScope.entityIds)));
  const activeRun = results?.runs?.[activeRunKey];
  const calibrationComparison = useMemo(() => activeRun?.result?.status === "completed" && selectedLoadTestRecord
    ? compareLoadTestToSimulation(activeRun.result.result, selectedLoadTestRecord)
    : null, [activeRun, selectedLoadTestRecord]);
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
      profile.loadTestEvidence = deepClone(draftProfile?.loadTestEvidence || simulationProfile?.loadTestEvidence || { schemaVersion: 1, records: [] });
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
    const simulationInputsChanged = JSON.stringify(simulationInputValues(next)) !== JSON.stringify(simulationInputValues(simulationProfile));
    const runConfigurationChanged = !runConfigurationIsSame(next, simulationProfile);
    if (simulationInputsChanged) {
      next.profileKind = "illustrative-synthetic";
      for (const item of Object.values(next.profilesByEntityId || {})) {
        item.assumptions ||= {};
        for (const field of Object.keys(item.parameters || {})) {
          if (!item.assumptions[field] || item.assumptions[field].source === "explicit-user-acknowledgement") {
            item.assumptions[field] = { status: "proposed", source: "profile-edited", note: "Review and explicitly confirm before running." };
          }
        }
      }
    }
    next.sourceModelRevision = workbench?.modelRevision ?? null;
    setDraftProfile(next);
    setProfileEditorOpen(true);
    if (simulationInputsChanged) setAcknowledged(false);
    if (runConfigurationChanged) { setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null); }
    onUpdateSimulationProfile?.(next);
    setProfileError("");
  };
  const addLoadTestRecord = () => {
    try {
      if (!draftProfile) throw new Error("Prepare a simulation profile before adding load-test evidence.");
      const normalized = normalizeLoadTestRecord(loadTestDraft);
      const existing = draftProfile.loadTestEvidence?.records || [];
      if (existing.length >= 25) throw new Error("The profile already has the maximum of 25 load-test records. Remove an old record before adding another.");
      const next = deepClone(draftProfile);
      next.loadTestEvidence = { schemaVersion: 1, records: [normalized, ...existing] };
      setDraftProfile(next);
      setProfileEditorOpen(true);
      setLoadTestDraft(createEmptyLoadTestRecord());
      setLoadTestError("");
    } catch (error) { setLoadTestError(error.message || "Could not add load-test evidence."); }
  };
  const importLoadTestEvidence = () => {
    try {
      if (!draftProfile) throw new Error("Prepare a simulation profile before importing load-test evidence.");
      const imported = loadTestImportFormat === "json"
        ? parseLoadTestEvidenceJson(loadTestImportText)
        : [parseJMeterLoadTestText(loadTestImportText, loadTestImportMetadata, loadTestImportFormat === "jmeter-xml" ? "xml" : "csv")];
      const current = draftProfile.loadTestEvidence?.records || [];
      const combined = [...current];
      let added = 0;
      for (const record of imported) {
        if (combined.some((item) => item.id === record.id)) continue;
        if (combined.length >= 25) break;
        combined.push(record); added += 1;
      }
      if (!added) throw new Error("No new records were imported. Check whether the IDs already exist or the 25-record limit has been reached.");
      const next = deepClone(draftProfile);
      next.loadTestEvidence = { schemaVersion: 1, records: combined };
      setDraftProfile(next);
      setProfileEditorOpen(true);
      setLoadTestImportText("");
      setLoadTestError(`Imported ${added} load-test record(s). Save profile changes to persist the evidence.`);
    } catch (error) { setLoadTestError(error.message || "Could not import load-test evidence."); }
  };
  const removeLoadTestRecord = (recordId) => {
    if (!canEdit || !draftProfile) return;
    const next = deepClone(draftProfile);
    next.loadTestEvidence = { schemaVersion: 1, records: (next.loadTestEvidence?.records || []).filter((record) => record.id !== recordId) };
    setDraftProfile(next);
    setProfileEditorOpen(true);
    setLoadTestError("");
  };
  const updateLoadTestDraftField = (section, field, value) => {
    setLoadTestDraft((current) => section
      ? { ...current, [section]: { ...current[section], [field]: value } }
      : { ...current, [field]: value });
  };
  const applyServiceTimeCalibration = (proposal) => {
    if (!canEdit || !draftProfile) return;
    const next = deepClone(draftProfile);
    const profileEntry = next.profilesByEntityId?.[proposal.entityId];
    if (!profileEntry || !isFiniteNumber(proposal.proposedValue) || proposal.proposedValue <= 0) {
      setLoadTestError("The proposed service-time calibration no longer matches a supported component.");
      return;
    }
    profileEntry.parameters.meanServiceMs = proposal.proposedValue;
    profileEntry.assumptions ||= {};
    profileEntry.assumptions.meanServiceMs = {
      status: "proposed",
      source: "repeated-component-load-test-measurements",
      note: `Reviewable proposal from ${proposal.testCount} load tests and ${proposal.sampleCount} component service-time samples in environment '${proposal.environment}' across offered-load levels ${proposal.workloadLevelsRps.join(", ")} req/s. This updates only the synthetic mean service-time parameter and is not a calibrated production-capacity guarantee. ${proposal.note}`,
    };
    next.profileKind = "illustrative-synthetic";
    setDraftProfile(next);
    setAcknowledged(false);
    setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
    setLoadTestError(`Applied a proposed mean service-time value to ${proposal.entityName}. Save the profile, review the changed assumption, then rerun the same workload to compare it with measured evidence.`);
    setProfileError("");
  };

  const runExperiments = () => {
    setTrafficSweepResults(null); setTrafficSweepError("");
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

  const runTrafficSweepExperiment = () => {
    setTrafficSweepError("");
    setTrafficSweepResults(null);
    if (missingTrafficSource) { setTrafficSweepError("Switch to a view containing the React application before running a traffic sweep."); return; }
    if (!draftProfile) { setTrafficSweepError("Prepare a simulation profile first."); return; }
    if (!acknowledged) { setTrafficSweepError("Review and confirm the illustrative assumptions before running."); return; }
    if (unsaved) { setTrafficSweepError("Save profile changes before running a traffic sweep."); return; }
    if (simulationScope.scoped && simulationScope.seedEntityIds.length === 0) { setTrafficSweepError("No Workbench components are placed in the active view."); return; }
    try {
      const confirmed = simulationScope.scoped
        ? confirmProfileAssumptionsForEntityIds(draftProfile, simulationScope.entityIds)
        : confirmAllProfileAssumptions(draftProfile);
      confirmed.sourceModelRevision = workbench?.modelRevision ?? null;
      const maxP95LatencyMs = operatingEnvelopeLatencyTarget.trim() === "" ? undefined : Number(operatingEnvelopeLatencyTarget);
      const maxErrorRatePercent = operatingEnvelopeErrorTarget.trim() === "" ? undefined : Number(operatingEnvelopeErrorTarget);
      const sweep = runTrafficSweep({
        workbench,
        simulationProfile: confirmed,
        multipliers: [1, 2, 3, 5, 8, 10],
        maxP95LatencyMs,
        maxErrorRatePercent,
        scopeEntityIds: scopeSeeds ?? undefined,
      });
      setTrafficSweepResults({ ...sweep, sourceModelSnapshot: createSimulationModelSnapshot(workbench), profileUsed: deepClone(draftProfile) });
      if (sweep.status === "blocked") setTrafficSweepError(sweep.diagnostics?.find((item) => item.severity === "blocker")?.message || "The traffic sweep could not be run.");
    } catch (error) { setTrafficSweepError(error.message || "The traffic sweep could not be run."); }
  };

  const runResilienceMatrixExperiment = () => {
    setResilienceMatrixError("");
    setResilienceMatrixResults(null);
    if (!canEdit) { setResilienceMatrixError("Edit permission is required to run resilience experiments."); return; }
    if (missingTrafficSource) { setResilienceMatrixError("Switch to a view containing the React application before running a resilience matrix."); return; }
    if (!draftProfile) { setResilienceMatrixError("Prepare a simulation profile first."); return; }
    if (!acknowledged) { setResilienceMatrixError("Review and confirm the illustrative assumptions before running."); return; }
    if (unsaved) { setResilienceMatrixError("Save profile changes before running a resilience matrix."); return; }
    if (simulationScope.scoped && simulationScope.seedEntityIds.length === 0) { setResilienceMatrixError("No Workbench components are placed in the active view."); return; }
    try {
      const confirmed = profileForEntityIds(draftProfile, simulationScope.entityIds);
      const matrix = runResilienceMatrix({ workbench, simulationProfile: confirmed, trafficMultiplier: 1, scopeEntityIds: scopeSeeds ?? undefined });
      setResilienceMatrixResults({ ...matrix, sourceModelSnapshot: createSimulationModelSnapshot(workbench), profileUsed: deepClone(draftProfile) });
      if (matrix.status === "blocked") setResilienceMatrixError(matrix.diagnostics?.find((item) => item.severity === "blocker")?.message || "The resilience matrix could not be run.");
    } catch (error) { setResilienceMatrixError(error.message || "The resilience matrix could not be run."); }
  };

  const runFailureChainExperiment = () => {
    setFailureChainError("");
    setFailureChainResults(null);
    if (!canEdit) { setFailureChainError("Edit permission is required to run failure-chain experiments."); return; }
    if (missingTrafficSource) { setFailureChainError("Switch to a view containing the React application before running failure-chain experiments."); return; }
    if (!draftProfile) { setFailureChainError("Prepare a simulation profile first."); return; }
    if (!acknowledged) { setFailureChainError("Review and confirm the illustrative assumptions before running."); return; }
    if (unsaved) { setFailureChainError("Save profile changes before running failure-chain experiments."); return; }
    if (simulationScope.scoped && simulationScope.seedEntityIds.length === 0) { setFailureChainError("No Workbench components are placed in the active view."); return; }
    try {
      const confirmed = profileForEntityIds(draftProfile, simulationScope.entityIds);
      const matrix = runFailureChainMatrix({ workbench, simulationProfile: confirmed, trafficMultiplier: 1, scopeEntityIds: scopeSeeds ?? undefined });
      setFailureChainResults({ ...matrix, sourceModelSnapshot: createSimulationModelSnapshot(workbench), profileUsed: deepClone(draftProfile) });
      if (matrix.status === "blocked") setFailureChainError(matrix.diagnostics?.find((item) => item.severity === "blocker")?.message || "Failure-chain experiments could not be run.");
    } catch (error) { setFailureChainError(error.message || "Failure-chain experiments could not be run."); }
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

  const handleEvidenceReportFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    setEvidenceComparison(null);
    setEvidenceComparisonError("");
    if (files.length !== 2) {
      setEvidenceComparisonError("Select exactly two exported evidence JSON files to compare.");
      return;
    }
    try {
      const [leftText, rightText] = await Promise.all(files.map((file) => file.text()));
      const left = parseSimulationEvidenceReport(leftText);
      const right = parseSimulationEvidenceReport(rightText);
      setEvidenceComparison(compareSimulationEvidenceReports(left, right));
    } catch (error) {
      setEvidenceComparisonError(error instanceof Error ? error.message : "Unable to compare evidence reports.");
    } finally {
      event.target.value = "";
    }
  };

  const rerunSavedExperiment = (entry) => {
    setHistoryActionError(""); setHistoryRerunComparison(null); setHistoryRerunBusyId(entry.id);
    try {
      if (!entry?.profileSnapshot || !workbench) throw new Error("This saved experiment does not contain enough profile/model context to rerun.");
      const rawMultiplier = Number(entry.runs?.trafficSurge?.overrides?.trafficMultiplier ?? 5);
      const multiplier = Number.isFinite(rawMultiplier) && rawMultiplier > 0 && rawMultiplier !== 1 ? rawMultiplier : 5;
      const replayProfile = markSimulationAssumptionsConfirmed(ensureInfrastructureProfileDefaults(ensureDatabaseIndexProfileDefaults(deepClone(entry.profileSnapshot)), workbench));
      const scopeSeedsForReplay = Array.isArray(entry.scopeSeedEntityIds) ? entry.scopeSeedEntityIds : undefined;
      const suite = runWorkbenchExperiments({ workbench, simulationProfile: replayProfile, trafficMultiplier: multiplier, scopeEntityIds: scopeSeedsForReplay });
      if (suite.runs?.baseline?.result?.status !== "completed") {
        const message = suite.diagnostics?.find((item) => item.severity === "blocker")?.message;
        throw new Error(message || "The saved experiment could not be rerun against the current model.");
      }
      suite.name = `Re-run: ${entry.name || "Saved experiment"}`;
      suite.experimentMetadata = { kind: "reproducibility-rerun", originalHistoryEntryId: entry.id, originalCreatedAt: entry.createdAt, note: "Saved assumptions rerun against the current semantic model; original evidence remains unchanged." };
      const rerunEntry = createSimulationHistoryEntry(suite, { workbench, simulationProfile: replayProfile });
      rerunEntry.experimentMetadata = deepClone(suite.experimentMetadata);
      const comparison = compareSimulationHistoryEntries(entry, rerunEntry);
      const reproducibility = assessSimulationReproducibility(entry, rerunEntry);
      const metricRegressions = comparison.rows.flatMap((row) => row.metrics.filter((metric) => metric.delta != null && ((metric.key === "throughputRps" && metric.delta < 0) || (metric.key === "p95LatencyMs" && metric.delta > 0) || (metric.key === "failedRatePercent" && metric.delta > 0))).map((metric) => ({ scenario: row.label, ...metric })));
      const warnings = [...comparison.warnings];
      if (entry.modelFingerprint !== rerunEntry.modelFingerprint) warnings.push("The current model differs from the original saved model. Treat this as a changed-model replay, not a bit-for-bit reproduction.");
      setHistoryRerunComparison({ originalName: entry.name, rerunName: rerunEntry.name, reproducibility, comparison: { ...comparison, warnings: [...new Set([...warnings, ...reproducibility.warnings])] }, metricRegressions });
      onUpdateSimulationHistory?.(appendSimulationHistory(simulationHistory, rerunEntry));
      setResults({ ...suite, trafficMultiplier: multiplier, sourceModelSnapshot: createSimulationModelSnapshot(workbench), profileUsed: deepClone(replayProfile), runScopeEntityIds: suite.provenance?.scopeEntityIds || [] });
      setProfileEditorOpen(false); setActiveRunKey("baseline");
    } catch (error) { setHistoryActionError(`Could not rerun saved experiment: ${error.message || "Unknown error"}`); }
    finally { setHistoryRerunBusyId(""); }
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
      <details className="sim-infrastructure-editor">
        <summary><span>Infrastructure &amp; capacity profiles</span><small>{availableInfrastructureEntities.length} runtime components · deployment facts</small></summary>
        <p className="sim-infrastructure-intro">Record the actual hosting and resource settings for the REST service and PostgreSQL. Every value has an evidence source. Blank or Unknown means Sketchizi does not know it. These fields are saved with the document and run provenance, but they do not change the synthetic capacity calculation in this release.</p>
        {availableInfrastructureEntities.length === 0 && <p className="sim-profile-assumption-note">No REST or PostgreSQL infrastructure profile is in the current simulation scope.</p>}
        {availableInfrastructureEntities.map(({ entity, entityId, infrastructure }) => {
          const definitions = INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS[entity.kind] || [];
          const summary = summarizeInfrastructureProfile(infrastructure);
          return <section className="sim-infrastructure-component" key={entityId}>
            <div className="sim-infrastructure-component-heading"><strong>{entity.name || entity.id}</strong><span>{summary.populated}/{summary.total} values entered · {summary.unknown} unknown</span></div>
            <div className="sim-infrastructure-field-grid">
              {definitions.map((field) => {
                const saved = infrastructure.fields?.[field.key] || { value: field.type === "select" ? "unknown" : field.type === "text" ? "" : null, evidence: "unknown" };
                const hasValue = saved.value !== null && saved.value !== undefined && saved.value !== "" && saved.value !== "unknown";
                return <div className="sim-infrastructure-field" key={field.key}>
                  <label><span>{field.label}</span>
                    {field.type === "select" ? <select value={saved.value ?? "unknown"} disabled={!canEdit} onChange={(event) => {
                      const value = event.target.value;
                      setDraftProfile((current) => updateInfrastructureField(current, entityId, field.key, "value", value));
                      setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
                    }}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> :
                    <input type={field.type === "number" ? "number" : "text"} min={field.min} max={field.max} step={field.step} placeholder={field.placeholder || "Not specified"} value={saved.value ?? ""} disabled={!canEdit} onChange={(event) => {
                      const raw = event.target.value;
                      const value = field.type === "number" ? (raw === "" ? null : Number(raw)) : raw;
                      setDraftProfile((current) => updateInfrastructureField(current, entityId, field.key, "value", value));
                      setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
                    }} />}
                  </label>
                  <label className="sim-infrastructure-evidence"><span>Evidence source</span><select value={saved.evidence || "unknown"} disabled={!canEdit || !hasValue} onChange={(event) => {
                    setDraftProfile((current) => updateInfrastructureField(current, entityId, field.key, "evidence", event.target.value));
                    setResults(null); setImprovementResult(null); setImprovementError(""); setInvestigation(null);
                  }}>{INFRASTRUCTURE_EVIDENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                </div>;
              })}
            </div>
            <p className="sim-profile-assumption-note">Infrastructure data is descriptive only until the capacity model is calibrated. Enter exact configuration where available; do not guess to satisfy every field.</p>
          </section>;
        })}
        <div className="sim-infrastructure-evidence-summary">
          <strong>Evidence definitions</strong>
          <span><b>Deployment config</b> — copied from a hosting, container or database configuration.</span>
          <span><b>Measured</b> — confirmed through monitoring, metrics or a load test.</span>
          <span><b>Estimate</b> — a human estimate, not verified.</span>
          <span><b>Defaulted</b> — provider or platform default, not independently checked.</span>
          <span><b>Unknown</b> — value or its evidence source has not been established.</span>
        </div>
        <div className="sim-profile-actions"><button type="button" className="workbench-secondary" disabled={!canEdit || !unsaved} onClick={saveProfile}>Save infrastructure profile</button></div>
      </details>
      {externalApprox && <p className="sim-profile-warning">External APIs use a generic approximation. This warning does not block a run after you confirm assumptions; results are not provider measurements.</p>}
      <div className="sim-traffic-control">
        <label htmlFor="sim-traffic-multiplier"><span>Traffic-surge scenario</span><strong>{trafficMultiplier}× offered load</strong></label>
        <input id="sim-traffic-multiplier" aria-label="Traffic-surge multiplier" type="range" min="2" max="10" step="1" value={trafficMultiplier} disabled={!canEdit} onChange={(event) => setTrafficMultiplier(Number(event.target.value))}/>
        <div className="sim-traffic-range-labels"><span>2×</span><span>10×</span></div>
        <small>Baseline uses the configured traffic rate. This multiplier applies only to the surge scenario.</small>
      </div>
      <button type="button" className="workbench-primary sim-run-button" disabled={!canEdit || missingTrafficSource || unsaved || missingProfileEntityIds.length > 0 || typedCallMissing || (simulationScope.scoped && simulationScope.seedEntityIds.length === 0)} onClick={runExperiments}>{missingTrafficSource ? "Switch to System view to run" : typedCallMissing ? "Create Calls relationship to run" : "Run experiments"}</button>
      <button type="button" className="workbench-secondary sim-run-button" disabled={!canEdit || missingTrafficSource || unsaved || missingProfileEntityIds.length > 0 || typedCallMissing || (simulationScope.scoped && simulationScope.seedEntityIds.length === 0)} onClick={runTrafficSweepExperiment}>Run 6-point traffic sweep</button>
      <button type="button" className="workbench-secondary sim-run-button" disabled={!canEdit || missingTrafficSource || unsaved || missingProfileEntityIds.length > 0 || typedCallMissing || (simulationScope.scoped && simulationScope.seedEntityIds.length === 0)} onClick={runResilienceMatrixExperiment}>Run resilience matrix</button>
      {resilienceMatrixError && <p className="sim-profile-warning" role="alert">{resilienceMatrixError}</p>}
      <button type="button" className="workbench-secondary sim-run-button" disabled={!canEdit || missingTrafficSource || unsaved || missingProfileEntityIds.length > 0 || typedCallMissing || (simulationScope.scoped && simulationScope.seedEntityIds.length === 0)} onClick={runFailureChainExperiment}>Run failure-chain matrix</button>
      {failureChainError && <p className="sim-profile-warning" role="alert">{failureChainError}</p>}
      <section className="sim-traffic-sweep" aria-label="Saved experiment comparison">
        <div className="workbench-section-heading"><span>SAVED EXPERIMENT COMPARISON</span><span className="workbench-count">JSON evidence</span></div>
        <p className="sim-capacity-target">Select two JSON reports exported by Sketchizi Workbench. The second report is treated as the newer/current run; differing model, profile, engine, assumptions, or scenario sets are called out explicitly.</p>
        <label className="workbench-secondary sim-run-button" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          Compare two evidence files
          <input type="file" accept="application/json,.json" multiple onChange={handleEvidenceReportFiles} style={{ display: "none" }} />
        </label>
        {evidenceComparisonError && <p className="sim-inline-error" role="alert">{evidenceComparisonError}</p>}
        {evidenceComparison && <>
          <div className="sim-provenance"><strong>Earlier report</strong><dl><dt>Experiment</dt><dd>{evidenceComparison.left.experimentType}</dd><dt>Model revision</dt><dd>{evidenceComparison.left.modelRevision ?? "unknown"}</dd><dt>Model fingerprint</dt><dd>{evidenceComparison.left.modelFingerprint || "unavailable"}</dd><dt>Profile fingerprint</dt><dd>{evidenceComparison.left.profileFingerprint || "unavailable"}</dd><dt>Engine</dt><dd>{evidenceComparison.left.engineVersion || "unknown"}</dd></dl><strong>Later report</strong><dl><dt>Experiment</dt><dd>{evidenceComparison.right.experimentType}</dd><dt>Model revision</dt><dd>{evidenceComparison.right.modelRevision ?? "unknown"}</dd><dt>Model fingerprint</dt><dd>{evidenceComparison.right.modelFingerprint || "unavailable"}</dd><dt>Profile fingerprint</dt><dd>{evidenceComparison.right.profileFingerprint || "unavailable"}</dd><dt>Engine</dt><dd>{evidenceComparison.right.engineVersion || "unknown"}</dd></dl></div>
          {evidenceComparison.warnings.length > 0 && <div className="sim-advisory-results"><strong>Comparability warnings</strong>{evidenceComparison.warnings.map((warning) => <div className="sim-diagnostic warning" key={warning}><small>{warning}</small></div>)}</div>}
          <div className="sim-suite-table-wrap"><table className="sim-suite-table"><thead><tr><th>Scenario</th><th>Match</th><th>Throughput Δ (req/s)</th><th>p95 latency Δ (ms)</th><th>Failure rate Δ (pp)</th></tr></thead><tbody>
            {evidenceComparison.rows.map((row) => <tr key={row.key}><td>{row.name}</td><td>{row.matched ? "Matched" : "Missing in later report"}</td><td>{row.throughputDeltaRps == null ? "—" : `${row.throughputDeltaRps > 0 ? "+" : ""}${formatDecimal(row.throughputDeltaRps)}`}</td><td>{row.p95DeltaMs == null ? "—" : `${row.p95DeltaMs > 0 ? "+" : ""}${formatDecimal(row.p95DeltaMs)}`}</td><td>{row.failedRateDeltaPercentagePoints == null ? "—" : `${row.failedRateDeltaPercentagePoints > 0 ? "+" : ""}${formatDecimal(row.failedRateDeltaPercentagePoints)}`}</td></tr>)}
            {evidenceComparison.unmatchedRows.map((row) => <tr key={`unmatched-${row.key}`}><td>{row.name}</td><td>Only in later report</td><td>—</td><td>—</td><td>—</td></tr>)}
          </tbody></table></div>
          <p className="sim-capacity-target">Deltas are later minus earlier. Positive latency or failure-rate deltas indicate worse results; positive throughput delta indicates higher throughput. These are synthetic reports, not live telemetry.</p>
          <button type="button" className="workbench-secondary sim-run-button" onClick={() => setEvidenceComparison(null)}>Clear comparison</button>
        </>}
      </section>
      {failureChainResults && <section className="sim-traffic-sweep" aria-label="Failure-chain experiment results">
        <div className="workbench-section-heading"><span>FAILURE-CHAIN MATRIX</span><span className="workbench-count">{failureChainResults.evaluatedPairCount} / {failureChainResults.totalPairCount} pairs</span></div>
        <button type="button" className="workbench-secondary sim-run-button" onClick={() => downloadSimulationEvidence("failure-chain-matrix", failureChainResults)}>Export evidence JSON</button>
        {failureChainStale && <p className="sim-profile-warning" role="status">The model, profile or active scope changed since this matrix was run. Rerun it before using these results.</p>}
        <p className="sim-capacity-target">Pairwise outages are compared with the stronger of the two individual outages. {failureChainResults.truncated ? "The pair limit was reached; not every possible pair was evaluated." : "All available component pairs were evaluated."}</p>
        <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Combined outage</th><th>Outcome</th><th>Combined throughput loss</th><th>Strongest individual loss</th><th>Additional loss</th><th>Interpretation</th></tr></thead><tbody>
          {failureChainResults.scenarios.map((scenario) => <tr key={scenario.id}><td><strong>{scenario.name}</strong><small>{scenario.targets.map((target) => target.kind).join(" + ")}</small></td><td>{scenario.status === "completed" ? "Completed" : scenario.status}</td><td>{scenario.throughputLossPercent == null ? "—" : `${formatDecimal(scenario.throughputLossPercent)}%`}</td><td>{scenario.strongestIndividualLossPercent == null ? "—" : `${formatDecimal(scenario.strongestIndividualLossPercent)}%`}</td><td>{scenario.additionalLossPercent == null ? "—" : `${formatDecimal(scenario.additionalLossPercent)} percentage points`}</td><td>{scenario.interaction === "worse-than-either-alone" ? "Worse than either alone" : scenario.interaction === "less-impact-than-strongest-alone" ? "Less impact than strongest alone" : scenario.interaction === "similar-to-strongest-alone" ? "Similar to strongest alone" : "Not comparable"}</td></tr>)}
        </tbody></table></div>
        <p className="sim-capacity-target">{failureChainResults.interpretation}</p>
      </section>}
      {resilienceMatrixResults && <section className="sim-traffic-sweep" aria-label="Resilience matrix results">
        <div className="workbench-section-heading"><span>RESILIENCE MATRIX</span><span className="workbench-count">{resilienceMatrixResults.scenarios.length} outage scenarios</span></div>
        <button type="button" className="workbench-secondary sim-run-button" onClick={() => downloadSimulationEvidence("resilience-matrix", resilienceMatrixResults)}>Export evidence JSON</button>
        {resilienceMatrixStale && <p className="sim-profile-warning" role="status">The model, profile or active scope changed since this matrix was run. Rerun it before using these results.</p>}
        <p className="sim-capacity-target">Baseline: {formatDecimal(resilienceMatrixResults.baseline?.metrics?.throughputRps)} successful requests/sec. Each row disables one supported runtime component at a time.</p>
        <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Component outage</th><th>Outcome</th><th>Throughput</th><th>Throughput loss</th><th>p95 latency</th><th>Failed requests</th></tr></thead><tbody>
          {resilienceMatrixResults.scenarios.map((scenario) => <tr key={scenario.id}><td><strong>{scenario.name}</strong><small>{scenario.kind}</small></td><td>{scenario.status === "completed" ? "Completed" : scenario.status}</td><td>{formatDecimal(scenario.metrics?.throughputRps)} req/s</td><td>{scenario.throughputLossPercent == null ? "—" : `${formatDecimal(scenario.throughputLossPercent)}%`}</td><td>{scenario.p95LatencyMs == null ? "—" : `${formatDecimal(scenario.p95LatencyMs)} ms`}</td><td>{scenario.failedRatePercent == null ? "—" : `${formatDecimal(scenario.failedRatePercent)}%`}</td></tr>)}
        </tbody></table></div>
        <p className="sim-capacity-target">{resilienceMatrixResults.interpretation}</p>
      </section>}
      {trafficSweepError && <p className="sim-profile-warning" role="alert">{trafficSweepError}</p>}
      {trafficSweepResults && <section className="sim-traffic-sweep" aria-label="Traffic sweep results">
        <div className="workbench-section-heading"><span>TRAFFIC SWEEP</span><span className="workbench-count">{trafficSweepResults.points.length} points</span></div>
        <button type="button" className="workbench-secondary sim-run-button" onClick={() => downloadSimulationEvidence("traffic-sweep", trafficSweepResults)}>Export evidence JSON</button>
        {trafficSweepStale && <p className="sim-profile-warning" role="status">The model, profile or SLO targets have changed since this sweep. Rerun it before using these results.</p>}
        <p className="sim-capacity-target">Six deterministic what-if runs use the same model, profile and seed. These are synthetic outputs, not production capacity measurements.</p>
        <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Load</th><th>Offered</th><th>Throughput</th><th>p95 latency</th><th>Failed requests</th><th>SLO</th></tr></thead><tbody>
          {trafficSweepResults.points.map((point) => <tr key={point.multiplier}><td>{point.label}</td><td>{formatInteger(point.metrics?.offeredRequests)}</td><td>{formatDecimal(point.metrics?.throughputRps)}</td><td>{formatDecimal(point.p95LatencyMs)} ms</td><td>{point.failedRatePercent == null ? "—" : `${formatDecimal(point.failedRatePercent)}%`}</td><td><span className={`sim-repeat-slo-outcome ${point.sloStatus === "pass" ? "all-pass" : point.sloStatus === "fail" ? "all-fail" : "single-observation"}`}>{point.sloStatus === "pass" ? "Pass" : point.sloStatus === "fail" ? "Fail" : point.sloStatus === "targets-not-set" ? "Set SLOs" : point.status}</span></td></tr>)}
        </tbody></table></div>
        <p className="sim-capacity-target">{trafficSweepResults.interpretation}</p>
      </section>}
    </>}
    {draftProfile && <details className="sim-load-test-calibration" open={loadTestRecords.length > 0 || Boolean(results)}>
      <summary><span>Load-test evidence &amp; calibration</span><small>{loadTestRecords.length} saved measurement set(s)</small></summary>
      <p className="sim-load-test-intro">Enter actual measurements from k6, JMeter, an APM tool or monitoring. JSON import accepts the Sketchizi template and k6 summary JSON when a top-level sketchizi metadata object supplies the test name, date, environment, duration and offered RPS. Raw JMeter CSV/JTL and provider-specific exports still need mapping. Keep the environment identifier consistent for tests against the same deployment. Measurements are evidence—not live telemetry automatically discovered by Sketchizi.</p>
      <div className={`sim-load-test-readiness ${loadTestAssessment.readyForCrossLoadAssessment ? "ready" : "incomplete"}`} role="status">
        <strong>{loadTestAssessment.readyForCrossLoadAssessment ? "Cross-load assessment is possible" : "Calibration evidence is incomplete"}</strong>
        <span>{loadTestAssessment.message}</span>
        <small>This status indicates evidence coverage only. It does not certify model accuracy or production capacity.</small>
      </div>
      <section className="sim-operating-envelope" aria-labelledby="sim-operating-envelope-title">
        <strong id="sim-operating-envelope-title">Measured operating envelope</strong>
        <p>Set your service-level targets to identify the highest offered load that actually passed in recorded tests. This uses observed evidence only; it does not predict untested capacity.</p>
        <div className="sim-load-test-field-grid">
          <label><span>Maximum end-to-end p95 latency (ms)</span><input type="number" min="0.1" step="1" value={operatingEnvelopeLatencyTarget} placeholder="Enter your latency SLO" onChange={(event) => setOperatingEnvelopeLatencyTarget(event.target.value)} /></label>
          <label><span>Maximum failed-request rate (%)</span><input type="number" min="0" max="100" step="0.1" value={operatingEnvelopeErrorTarget} placeholder="Enter your error budget" onChange={(event) => setOperatingEnvelopeErrorTarget(event.target.value)} /></label>
        </div>
        {operatingEnvelope.status === "invalid-thresholds" ? <small>{operatingEnvelope.reason}</small> : operatingEnvelope.status === "insufficient-evidence" ? <small>{operatingEnvelope.reason}</small> : <>
          {operatingEnvelope.environments.map((environment) => <div className="sim-operating-envelope-result" key={environment.environment}>
            <div><strong>{environment.environment}</strong><small>{environment.testedPointCount} complete test(s) · {environment.distinctLoadLevelCount} distinct offered-load level(s)</small></div>
            {environment.highestPassing ? <div><span>Highest observed passing load: <b>{formatDecimal(environment.highestPassing.offeredRps)} req/s</b></span><small>p95 {formatDecimal(environment.highestPassing.p95LatencyMs)} ms · errors {formatDecimal(environment.highestPassing.errorRatePercent)}%</small></div> : <span>No recorded test in this environment meets both targets.</span>}
            {environment.nextFailing && <small>Next higher failing point: {formatDecimal(environment.nextFailing.offeredRps)} req/s ({environment.nextFailing.p95LatencyMs > operatingEnvelope.maxP95LatencyMs ? "p95 latency exceeded" : "error rate exceeded"}).</small>}
            <div className="sim-operating-envelope-points">{environment.points.map((point) => <span key={point.id} className={point.meetsTargets ? "pass" : "fail"} title={`${point.name}: ${point.p95LatencyMs} ms p95, ${point.errorRatePercent}% errors`}>{formatDecimal(point.offeredRps)} req/s · {point.meetsTargets ? "pass" : "fail"}</span>)}</div>
            <div className="sim-operating-repeatability" aria-label={`Repeat-run summaries for ${environment.environment}`}>
              <strong>Repeat-run evidence</strong>
              <small>{environment.repeatedLoadLevelCount} load level(s) have repeat runs · {environment.singleObservationLoadLevelCount} have only one observation. Ranges describe recorded variation; they do not certify statistical stability.</small>
              {environment.repeatabilityByLoad.map((level) => <div className="sim-operating-repeatability-row" key={`${environment.environment}-${level.offeredRps}`}>
                <b>{formatDecimal(level.offeredRps)} req/s</b>
                <span>{level.runCount} run(s)</span>
                <span className={`sim-repeat-slo-outcome ${level.sloOutcomeStatus}`} title={`${level.passingRunCount} passing and ${level.failingRunCount} failing run(s)`}>{level.sloOutcomeStatus === "all-pass" ? "All runs pass SLOs" : level.sloOutcomeStatus === "all-fail" ? "All runs fail SLOs" : level.sloOutcomeStatus === "mixed-outcome" ? "Mixed SLO outcomes" : "Single observation"} ({level.passingRunCount} pass / {level.failingRunCount} fail)</span>
                {level.runCount >= 2 ? <small>p95 {formatDecimal(level.p95LatencyMs.min)}–{formatDecimal(level.p95LatencyMs.max)} ms (spread {level.p95LatencyMs.spreadPercentOfMedian == null ? "n/a" : `${formatDecimal(level.p95LatencyMs.spreadPercentOfMedian)}% of median`}) · errors {formatDecimal(level.errorRatePercent.min)}–{formatDecimal(level.errorRatePercent.max)}% (spread {level.errorRatePercent.spreadPercentOfMedian == null ? "n/a" : `${formatDecimal(level.errorRatePercent.spreadPercentOfMedian)}% of median`}) · throughput {formatDecimal(level.throughputRps.min)}–{formatDecimal(level.throughputRps.max)} req/s (spread {level.throughputRps.spreadPercentOfMedian == null ? "n/a" : `${formatDecimal(level.throughputRps.spreadPercentOfMedian)}% of median`})</small> : <small>Repeat this load level to observe run-to-run variation.</small>}
              </div>)}
            </div>
          </div>)}
          <small>{operatingEnvelope.reason}</small>
        </>}
      </section>
      <details className="sim-load-test-add-form">
        <summary>Add measured load-test result</summary>
        <div className="sim-load-test-field-grid">
          <label><span>Test name</span><input value={loadTestDraft.name} disabled={!canEdit} placeholder="e.g. 50 req/s sustained load" onChange={(event) => updateLoadTestDraftField(null, "name", event.target.value)} /></label>
          <label><span>Test date</span><input type="date" value={loadTestDraft.testedAt} disabled={!canEdit} onChange={(event) => updateLoadTestDraftField(null, "testedAt", event.target.value)} /></label>
          <label><span>Target environment ID</span><input value={loadTestDraft.targetEnvironment} disabled={!canEdit} placeholder="e.g. prod-eu-west-api-tier-a" onChange={(event) => updateLoadTestDraftField(null, "targetEnvironment", event.target.value)} /></label>
          <label><span>Measurement source</span><input value={loadTestDraft.source} disabled={!canEdit} placeholder="e.g. k6 + Prometheus" onChange={(event) => updateLoadTestDraftField(null, "source", event.target.value)} /></label>
          <label><span>Test duration (seconds)</span><input type="number" min="1" max="604800" value={loadTestDraft.workload.durationSeconds ?? ""} disabled={!canEdit} onChange={(event) => updateLoadTestDraftField("workload", "durationSeconds", event.target.value === "" ? null : Number(event.target.value))} /></label>
          <label><span>Offered load (req/s)</span><input type="number" min="0.001" max="100000000" step="0.1" value={loadTestDraft.workload.offeredRps ?? ""} disabled={!canEdit} onChange={(event) => updateLoadTestDraftField("workload", "offeredRps", event.target.value === "" ? null : Number(event.target.value))} /></label>
          <label><span>Concurrent virtual users / clients</span><input type="number" min="1" step="1" value={loadTestDraft.workload.concurrency ?? ""} disabled={!canEdit} onChange={(event) => updateLoadTestDraftField("workload", "concurrency", event.target.value === "" ? null : Number(event.target.value))} /></label>
        </div>
        <div className="sim-load-test-metric-groups">
          <section><strong>Request-level measurements</strong><div className="sim-load-test-field-grid">
            {LOAD_TEST_MEASUREMENT_FIELDS.filter((field) => field.group === "request").map((field) => <label key={field.key}><span>{field.label}</span><input type="number" min={field.min} max={field.max} step={field.step} value={loadTestDraft.observed[field.key] ?? ""} disabled={!canEdit} onChange={(event) => updateLoadTestDraftField("observed", field.key, event.target.value === "" ? null : Number(event.target.value))} /></label>)}
          </div></section>
          <section><strong>Resource and database observations</strong><div className="sim-load-test-field-grid">
            {LOAD_TEST_MEASUREMENT_FIELDS.filter((field) => field.group === "resource").map((field) => <label key={field.key}><span>{field.label}</span><input type="number" min={field.min} max={field.max} step={field.step} value={loadTestDraft.observed[field.key] ?? ""} disabled={!canEdit} onChange={(event) => updateLoadTestDraftField("observed", field.key, event.target.value === "" ? null : Number(event.target.value))} /></label>)}
          </div></section>
          <section><strong>Optional component service-time evidence for a reviewable calibration proposal</strong><p>Use per-component means from server-side/APM or database measurements—not end-to-end p95. Exclude queue waits and downstream waiting so the same time is not counted twice.</p><div className="sim-load-test-field-grid">
            {LOAD_TEST_MEASUREMENT_FIELDS.filter((field) => field.group === "service").map((field) => <label key={field.key}><span>{field.label}</span><input type="number" min={field.min} max={field.max} step={field.step} value={loadTestDraft.observed[field.key] ?? ""} disabled={!canEdit} onChange={(event) => updateLoadTestDraftField("observed", field.key, event.target.value === "" ? null : Number(event.target.value))} /></label>)}
          </div></section>
        </div>
        <label className="sim-load-test-notes"><span>Notes / collection details</span><textarea rows="2" maxLength={4000} value={loadTestDraft.notes} disabled={!canEdit} placeholder="Include workload mix, environment details, test tool settings, and metric definitions." onChange={(event) => updateLoadTestDraftField(null, "notes", event.target.value)} /></label>
        <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={addLoadTestRecord}>Add load-test evidence</button>
      </details>
      <details className="sim-load-test-import">
        <summary>Import load-test evidence</summary>
        <label className="sim-load-test-import-format"><span>Source format</span><select value={loadTestImportFormat} disabled={!canEdit} onChange={(event) => { setLoadTestImportFormat(event.target.value); setLoadTestError(""); }}><option value="json">Sketchizi / k6 summary JSON</option><option value="jmeter-csv">Apache JMeter sample CSV / JTL</option><option value="jmeter-xml">Apache JMeter XML JTL</option></select></label>
        {loadTestImportFormat === "json" ? <p>Paste a record formatted with the Sketchizi template, an array of records, an object with a <code>records</code> array, or a k6 summary JSON export enriched with a top-level <code>sketchizi</code> object. k6 summaries need explicit test date, target environment, duration and offered RPS because those details cannot be reliably inferred from the summary.</p> : <>
          <p>Paste a raw sample-level JMeter CSV or XML JTL export. JMeter Aggregate Report CSV is not accepted because percentiles from sampler groups cannot be combined into a trustworthy global p95. Export sample results with timestamps, elapsed time and success flags. With CSV, avoid exporting transaction-controller parent rows alongside the same underlying samplers; XML JTL excludes parent samples when nested sample elements are present.</p>
          <div className="sim-load-test-field-grid sim-jmeter-metadata-grid">
            <label><span>Test name</span><input value={loadTestImportMetadata.name} disabled={!canEdit} placeholder="e.g. checkout load test" onChange={(event) => setLoadTestImportMetadata((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>Test date</span><input type="date" value={loadTestImportMetadata.testedAt} disabled={!canEdit} onChange={(event) => setLoadTestImportMetadata((current) => ({ ...current, testedAt: event.target.value }))} /></label>
            <label><span>Target environment</span><input value={loadTestImportMetadata.targetEnvironment} disabled={!canEdit} placeholder="e.g. staging-api-a" onChange={(event) => setLoadTestImportMetadata((current) => ({ ...current, targetEnvironment: event.target.value }))} /></label>
            <label><span>Configured offered load (req/s)</span><input type="number" min="0.001" step="0.1" value={loadTestImportMetadata.offeredRps} disabled={!canEdit} placeholder="Enter configured load" onChange={(event) => setLoadTestImportMetadata((current) => ({ ...current, offeredRps: event.target.value }))} /></label>
            <label><span>Configured test duration (seconds)</span><input type="number" min="1" step="1" value={loadTestImportMetadata.durationSeconds} disabled={!canEdit} placeholder="e.g. 300" onChange={(event) => setLoadTestImportMetadata((current) => ({ ...current, durationSeconds: event.target.value }))} /></label>
            <label><span>Concurrent users / threads (optional override)</span><input type="number" min="1" step="1" value={loadTestImportMetadata.concurrency} disabled={!canEdit} placeholder="Use JTL allThreads when available" onChange={(event) => setLoadTestImportMetadata((current) => ({ ...current, concurrency: event.target.value }))} /></label>
          </div>
          <p>Offered RPS and configured duration must be supplied explicitly. Completed sample rows do not reveal requests that the load generator intended to send but never issued or dropped.</p>
        </>}
        <textarea rows="8" spellCheck="false" value={loadTestImportText} disabled={!canEdit} placeholder={loadTestImportFormat === "json" ? "Paste Sketchizi or k6 summary JSON here" : loadTestImportFormat === "jmeter-xml" ? "Paste JMeter XML JTL here" : "Paste JMeter sample CSV / JTL here"} onChange={(event) => setLoadTestImportText(event.target.value)} />
        <div className="sim-load-test-actions">{loadTestImportFormat === "json" && <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => setLoadTestImportText(createLoadTestJsonTemplate())}>Insert JSON template</button>}<button type="button" className="workbench-secondary" disabled={!canEdit || !loadTestImportText.trim()} onClick={importLoadTestEvidence}>Validate &amp; import {loadTestImportFormat === "json" ? "JSON" : "JMeter results"}</button></div>
      </details>
      {loadTestRecords.length > 0 && <div className="sim-load-test-record-list">
        <strong>Saved measurement records <small>{loadTestRecords.length}/25</small></strong>
        {loadTestRecords.map((record) => <div className="sim-load-test-record" key={record.id}>
          <div><strong>{record.name}</strong><small>{record.testedAt} · {record.targetEnvironment} · {record.source}</small><small>{formatDecimal(record.workload.offeredRps)} offered req/s · {formatDecimal(record.observed.throughputRps)} measured throughput · {formatDecimal(record.observed.p95LatencyMs)} ms p95</small></div>
          <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => removeLoadTestRecord(record.id)} aria-label={`Remove ${record.name}`}>Remove</button>
        </div>)}
        <button type="button" className="workbench-secondary" disabled={!canEdit || !unsaved} onClick={saveProfile}>Save measurement evidence</button>
      </div>}
      {loadTestError && <p className="sim-inline-note" role="status">{loadTestError}</p>}
      {loadTestRecords.length > 0 && <section className="sim-load-test-comparison">
        <strong>Compare a recorded test with the current simulation</strong>
        <label><span>Measurement record</span><select value={selectedLoadTestRecord?.id || ""} onChange={(event) => setSelectedLoadTestId(event.target.value)}>{loadTestRecords.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.testedAt}</option>)}</select></label>
        {!activeRun?.result?.result ? <p>Run a scenario or open a saved experiment to compare its recorded result against these measurements.</p> : calibrationComparison && <>
          <div className={`sim-load-test-comparison-status ${calibrationComparison.status}`}><strong>{calibrationComparison.status === "comparable" ? "Workload setup is aligned" : calibrationComparison.status === "workload-mismatch" ? "Workloads / observation windows are not comparable" : calibrationComparison.status === "incomplete" ? "Measurement fields are incomplete" : "Simulation result unavailable"}</strong><span>{calibrationComparison.reason}</span></div>
          <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Metric</th><th>Simulation</th><th>Measured</th><th>Δ model − measured</th></tr></thead><tbody>{calibrationComparison.rows.map((row) => <tr key={row.key}><td>{row.label}</td><td>{formatCalibrationValue(row.simulated, row.unit)}</td><td>{formatCalibrationValue(row.measured, row.unit)}</td><td>{isFiniteNumber(row.delta) ? formatCalibrationValue(row.delta, row.unit) : "—"}</td></tr>)}</tbody></table></div>
          <div className="sim-load-test-resource-context"><strong>Measured resource context — not simulated</strong><span>REST CPU: {formatCalibrationValue(calibrationComparison.measuredContext.appCpuPercent, "%")}</span><span>REST memory: {formatCalibrationValue(calibrationComparison.measuredContext.appMemoryGb, "GB")}</span><span>Database CPU: {formatCalibrationValue(calibrationComparison.measuredContext.dbCpuPercent, "%")}</span><span>Database connections: {formatCalibrationValue(calibrationComparison.measuredContext.dbConnections, "connections")}</span><span>Database query p95: {formatCalibrationValue(calibrationComparison.measuredContext.dbP95QueryMs, "ms")}</span></div>
          <p className="sim-load-test-footnote">The simulator does not generate CPU, RAM, I/O or database-connection telemetry. Resource measurements provide context; only offered load, throughput, p95 latency and failed-request rate are compared here. Simulated drops remain a separate signal and are not treated as measured HTTP errors.</p>
        </>}
      </section>}
      <section className="sim-load-test-proposals">
        <strong>Reviewable service-time calibration proposals</strong>
        <p>Sketchizi only proposes mean-service-time changes from repeated component-level measurements for the same target environment across multiple load levels. Aggregate throughput or end-to-end p95 alone is not enough to infer REST or database service time.</p>
        {serviceTimeProposals.length === 0 ? <small>No service-time proposal is eligible yet. Capture REST exclusive mean processing time and/or PostgreSQL mean query execution time, including sample counts, in at least three tests at two distinct offered-load levels for the same environment.</small> : serviceTimeProposals.map((proposal) => <div className="sim-load-test-proposal" key={proposal.entityId}>
          <div><strong>{proposal.entityName} · {proposal.label}</strong><small>{formatDecimal(proposal.currentValue)} ms current → {formatDecimal(proposal.proposedValue)} ms measured weighted mean</small><small>{proposal.testCount} tests · {formatInteger(proposal.sampleCount)} samples · environment {proposal.environment} · offered levels {proposal.workloadLevelsRps.join(", ")} req/s</small><span>{proposal.note}</span></div>
          <button type="button" className="workbench-secondary" disabled={!canEdit || !proposal.changed || unsaved || staleModel} onClick={() => applyServiceTimeCalibration(proposal)}>{proposal.changed ? "Apply proposal" : "Already aligned"}</button>
        </div>)}
        <small>Applying a proposal changes only the selected synthetic meanServiceMs assumption. The assumption remains proposed until reviewed and explicitly confirmed; it does not alter vCPU/RAM-derived capacity, queue limits or live infrastructure.</small>
      </section>
      <div className="sim-profile-actions"><button type="button" className="workbench-secondary" disabled={!canEdit || !unsaved} onClick={saveProfile}>Save profile &amp; evidence</button></div>
    </details>}
    {profileError && <p className="sim-inline-note" role="status">{profileError}</p>}
    {runError && <p className="workbench-inspector-error" role="alert">{runError}</p>}
    {simulationHistory.length > 0 && <details className="sim-history-list">
      <summary><span>Saved experiment library</span><small>{simulationHistory.length} saved · latest 5 retained</small></summary>
      <div className="sim-history-library-controls">
        <input aria-label="Search saved experiments" type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search names, scenarios, fingerprints…" />
        <button type="button" className="workbench-secondary" disabled={historyCompareIds.length !== 2} onClick={() => {
          try {
            const left = simulationHistory.find((entry) => entry.id === historyCompareIds[0]);
            const right = simulationHistory.find((entry) => entry.id === historyCompareIds[1]);
            if (!left || !right) throw new Error("Select two retained experiments to compare.");
            setHistoryComparison(compareSimulationHistoryEntries(left, right)); setHistoryActionError("");
          } catch (error) { setHistoryActionError(error.message); setHistoryComparison(null); }
        }}>Compare selected ({historyCompareIds.length}/2)</button>
      </div>
      {historyActionError && <p className="sim-inline-note" role="alert">{historyActionError}</p>}
      <div className="sim-history-items">
        {searchSimulationHistory(simulationHistory, historySearch).map((entry) => <div className="sim-history-item" key={entry.id}>
          <label className="sim-history-select"><input type="checkbox" aria-label={`Select ${entry.name || "saved experiment"} for comparison`} checked={historyCompareIds.includes(entry.id)} onChange={(event) => {
            setHistoryCompareIds((current) => event.target.checked ? [...current.filter((id) => id !== entry.id).slice(-1), entry.id] : current.filter((id) => id !== entry.id));
            setHistoryComparison(null); setHistoryActionError("");
          }} /></label>
          <div className="sim-history-details">
            <input aria-label={`Name saved experiment ${entry.name || entry.id}`} className="sim-history-name" defaultValue={entry.name || `Experiment ${new Date(entry.createdAt).toLocaleString()}`} maxLength={120} disabled={!canEdit} onBlur={(event) => {
              const nextName = event.currentTarget.value.trim();
              if (!nextName || nextName === (entry.name || `Experiment ${new Date(entry.createdAt).toLocaleString()}`)) return;
              try { onUpdateSimulationHistory?.(renameSimulationHistoryEntry(simulationHistory, entry.id, nextName)); setHistoryActionError(""); }
              catch (error) { setHistoryActionError(error.message); event.currentTarget.value = entry.name || `Experiment ${new Date(entry.createdAt).toLocaleString()}`; }
            }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            <small>{new Date(entry.createdAt).toLocaleString()} · {entry.status} · {entry.engineVersion || "engine version unavailable"}</small>
            <small>Model {entry.modelFingerprint ? `${entry.modelFingerprint.slice(0, 12)}…` : "fingerprint unavailable"}</small>
          </div>
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
          <button type="button" className="workbench-secondary" disabled={!canEdit || Boolean(historyRerunBusyId)} onClick={() => rerunSavedExperiment(entry)}>{historyRerunBusyId === entry.id ? "Rerunning…" : "Rerun on current model"}</button>
        </div>)}
        {searchSimulationHistory(simulationHistory, historySearch).length === 0 && <p className="workbench-findings-empty">No saved experiments match this search.</p>}
      </div>
      {historyRerunComparison && <section className="sim-history-comparison" aria-label="Saved experiment rerun regression report">
        <strong>Rerun regression report</strong>
        <small>{historyRerunComparison.originalName || "Original run"} → {historyRerunComparison.rerunName}</small>
        <p><strong>Reproducibility assessment: </strong>{({ "exact-match": "Exact match — provenance, scenario fingerprints, and recorded metrics match.", "metrics-match-inputs-differ": "Metrics match, but provenance or run fingerprints differ.", "metrics-differ": "Replay metrics differ from saved evidence.", incomplete: "Inconclusive — one or more scenarios are missing or incomplete." })[historyRerunComparison.reproducibility?.status] || "Assessment unavailable."}</p>
        {historyRerunComparison.comparison.warnings.map((warning) => <p className="sim-inline-note" key={warning}>{warning}</p>)}
        <p>{historyRerunComparison.metricRegressions.length === 0 ? "No worsening metric deltas were detected among comparable completed scenarios. This does not prove production behavior." : `${historyRerunComparison.metricRegressions.length} worsening metric delta(s) detected.`}</p>
        <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Scenario</th><th>Metric</th><th>Original</th><th>Rerun</th><th>Delta</th><th>Assessment</th></tr></thead><tbody>{historyRerunComparison.comparison.rows.flatMap((row) => row.metrics.map((metric) => {
          const regression = historyRerunComparison.metricRegressions.some((item) => item.scenario === row.label && item.key === metric.key);
          return <tr key={`${row.key}-${metric.key}`}><td>{row.label}{!row.matched ? " (not matched)" : ""}</td><td>{metric.label}</td><td>{metric.before == null ? "—" : `${formatDecimal(metric.before)} ${metric.unit}`}</td><td>{metric.after == null ? "—" : `${formatDecimal(metric.after)} ${metric.unit}`}</td><td>{metric.delta == null ? "—" : `${metric.delta > 0 ? "+" : ""}${formatDecimal(metric.delta)} ${metric.unit}`}</td><td>{metric.delta == null ? "Not comparable" : regression ? "Worsened" : "No worsening"}</td></tr>;
        }))}</tbody></table></div>
        <small>The original saved evidence was not overwritten. This rerun uses recorded synthetic assumptions against the current model; it is not production measurement.</small>
        <button type="button" className="workbench-secondary" onClick={() => setHistoryRerunComparison(null)}>Close regression report</button>
      </section>}
      {historyComparison && <section className="sim-history-comparison" aria-label="Saved experiment comparison">
        <strong>Saved run comparison</strong>
        <small>{simulationHistory.find((entry) => entry.id === historyComparison.leftId)?.name || "Earlier selection"} → {simulationHistory.find((entry) => entry.id === historyComparison.rightId)?.name || "Later selection"}</small>
        {historyComparison.warnings.map((warning) => <p className="sim-inline-note" key={warning}>{warning}</p>)}
        <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Scenario</th><th>Metric</th><th>Earlier</th><th>Later</th><th>Delta</th></tr></thead><tbody>{historyComparison.rows.flatMap((row) => row.metrics.map((metric) => <tr key={`${row.key}-${metric.key}`}><td>{row.label}{!row.matched ? " (not matched)" : ""}</td><td>{metric.label}</td><td>{metric.before == null ? "—" : `${formatDecimal(metric.before)} ${metric.unit}`}</td><td>{metric.after == null ? "—" : `${formatDecimal(metric.after)} ${metric.unit}`}</td><td>{metric.delta == null ? "—" : `${metric.delta > 0 ? "+" : ""}${formatDecimal(metric.delta)} ${metric.unit}`}</td></tr>))}</tbody></table></div>
        <button type="button" className="workbench-secondary" onClick={() => setHistoryComparison(null)}>Close comparison</button>
      </section>}
    </details>}
    {results && <div className="sim-results-area">
      {results.historyCreatedAt && <>
        <p className="sim-inline-note">Viewing saved results from {new Date(results.historyCreatedAt).toLocaleString()}. These are recorded synthetic outputs; opening them does not rerun the engine.{results.experimentMetadata?.kind === "one-variable-improvement" ? ` Controlled experiment: ${results.experimentMetadata.title}.` : ""}</p>
        <details className="sim-history-assumptions"><summary>Recorded assumptions ({Object.keys(results.historyProfileSnapshot?.profilesByEntityId || {}).length} components)</summary>
          <div className="sim-history-assumption-list">{Object.entries(results.historyProfileSnapshot?.profilesByEntityId || {}).filter(([entityId]) => !Array.isArray(results.provenance?.scopeEntityIds) || results.provenance.scopeEntityIds.includes(entityId)).map(([entityId, profile]) => <div key={entityId}><strong>{resultsEntitiesById.get(entityId)?.name || entityId}</strong><small>{profile.kind}</small><code>{JSON.stringify(profile.parameters || {})}</code></div>)}</div>
          <small>These are the values recorded for this historical run. They are not live telemetry and do not imply the current model uses the same values.</small>
        </details>
        {Object.keys(results.historyProfileSnapshot?.infrastructureByEntityId || {}).length > 0 && <details className="sim-history-assumptions">
          <summary>Recorded infrastructure evidence ({Object.keys(results.historyProfileSnapshot.infrastructureByEntityId).length} components)</summary>
          <div className="sim-history-assumption-list">{Object.entries(results.historyProfileSnapshot.infrastructureByEntityId).filter(([entityId]) => !Array.isArray(results.provenance?.scopeEntityIds) || results.provenance.scopeEntityIds.includes(entityId)).map(([entityId, infrastructure]) => {
            const definitions = INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS[infrastructure.entityKind] || [];
            const recorded = definitions.map((field) => {
              const item = infrastructure.fields?.[field.key];
              const value = item?.value;
              if (value === null || value === undefined || value === "" || value === "unknown") return null;
              const evidence = INFRASTRUCTURE_EVIDENCE_OPTIONS.find((option) => option.value === item.evidence)?.label || "Unknown source";
              return `${field.label}: ${value} [${evidence}]`;
            }).filter(Boolean);
            return <div key={entityId}><strong>{resultsEntitiesById.get(entityId)?.name || entityId}</strong><small>Deployment context · not used to calculate capacity in this release</small><code>{recorded.length ? recorded.join(" · ") : "No infrastructure values recorded; actual machine capacity remains unknown."}</code></div>;
          })}</div>
          <small>These values and evidence labels were saved with the historical run. They are not live telemetry and do not establish production capacity.</small>
        </details>}
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
          <div className="sim-model-assumption-note" role="note"><strong>Uncalibrated synthetic model</strong><span>Machine size, instance count and live resource usage are not discovered by Sketchizi. Throughput, latency, drops and failures depend on the displayed concurrency, service-time, queue and scenario assumptions. Treat them as what-if results, not production capacity guarantees.</span><small>In-flight at the observation boundary is a point-in-time subset; those requests may later appear in the final outcomes during post-window drain. Do not add the in-flight figure to the final success, failure and drop totals.</small><small>Final outcome totals and success rate include post-window drain; successful throughput uses only completions within the observation window, while p95 latency includes successful requests completed during the drain.</small><small>Non-zero timeout or retry settings are blocked because timeout/cancellation and retry semantics are not modeled yet.</small></div>
          <ObservationBoundaryTable run={activeRun} />
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
