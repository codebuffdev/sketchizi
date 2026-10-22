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
import { buildOptimizationPortfolio } from "./optimizationPortfolio.js";
import { architectureSnapshotsMatch, buildArchitectureChangeImpact } from "./architectureChangeImpact.js";
import { buildArchitectureDecisionReport, formatArchitectureDecisionReportMarkdown } from "./architectureDecisionReport.js";
import { ARCHITECTURE_DECISION_STATUSES, createArchitectureDecisionRecord, formatArchitectureDecisionRecordMarkdown, updateArchitectureDecisionRecords } from "./architectureDecisionRecord.js";
import { buildRolloutReadiness, normalizeRolloutChecks } from "./rolloutReadiness.js";
import { buildReleaseEvidenceBundle } from "./releaseEvidenceBundle.js";
import { reviewReleaseEvidenceBundle } from "./releaseEvidenceBundleReview.js";
import { buildRemediationEffectivenessSummary, buildReviewFindingObservationTimeline, confirmRemediationVerification, mergeReleaseBundleReviewFindings, normalizeDecisionReviewFindings, recordRemediationSourceDriftResolution, recordRemediationVerificationRun, reopenTrackedReviewFinding, REMEDIATION_VERIFICATION_OUTCOME_OPTIONS, REMEDIATION_VERIFICATION_RUN_TYPE_OPTIONS, REVIEW_FINDING_STATUS_OPTIONS, summarizeDecisionReviewFindings, updateTrackedReviewFinding } from "./reviewFindingTracking.js";
import { getRemediationAcceptanceMetricDefinitions } from "./remediationAcceptanceCriteria.js";
import { captureRemediationMeasurementSources, evaluateRemediationMeasurementSourceDrift, getLoadTestSourceMetric, REMEDIATION_MEASUREMENT_SOURCE_OPTIONS } from "./remediationEvidenceMapping.js";
import { REMEDIATION_SOURCE_DRIFT_DISPOSITION_OPTIONS, summarizeRemediationSourceDriftResolution } from "./remediationSourceDriftResolution.js";
import { buildRemediationWorkQueue, filterRemediationWorkQueue, REMEDIATION_WORK_QUEUE_FILTERS } from "./remediationWorkQueue.js";
import { acknowledgeRemediationWorkQueueEscalation, getRemediationTaskMetadata, recordRemediationWorkQueueFollowUpNote, reopenRemediationWorkQueueTask, resolveRemediationWorkQueueTask, updateRemediationWorkQueueTask } from "./remediationWorkQueueMetadata.js";
import { appendRemediationHandoffNote, createRemediationHandoffActions, formatRemediationHandoffMarkdown, normalizeRemediationHandoffNotes, recordRemediationHandoffReceipt, reconcileRemediationHandoff, updateRemediationHandoffAction } from "./remediationHandoff.js";
import {
  compareSimulationRuns,
  buildScenarioComparisonOverview,
  chooseCapacityImprovementScenarioKey,
  getCapacityPressureRows,
  createCapacityImprovementProfile,
  createServiceTimeImprovementProfile,
  createDatabaseContentionImprovementProfile,
  getDatabaseIndexCandidates,
  recommendSimulationImprovements,
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

function downloadArchitectureDecisionReport(report) {
  if (!report || typeof document === "undefined") return;
  const markdown = formatArchitectureDecisionReportMarkdown(report);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sketchizi-architecture-decision-report.md";
  anchor.rel = "noopener";
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 1000);
}

function downloadArchitectureDecisionRecord(record, loadTestRecords = []) {
  if (!record || typeof document === "undefined") return;
  const markdown = formatArchitectureDecisionRecordMarkdown(record, { loadTestRecords });
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sketchizi-decision-record-${String(record.id || "decision").replace(/[^a-zA-Z0-9_-]/g, "-")}.md`;
  anchor.rel = "noopener";
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 1000);
}

function downloadRemediationHandoff(queue, decisionRecords) {
  if (!queue || typeof document === "undefined") return;
  const markdown = formatRemediationHandoffMarkdown({ queue, decisionRecords });
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sketchizi-escalation-handoff-${queue.evaluatedDate || "current"}.md`;
  anchor.rel = "noopener";
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 1000);
}

function downloadReleaseEvidenceBundle(record, loadTestRecords) {
  if (!record || typeof document === "undefined") return;
  const bundle = buildReleaseEvidenceBundle({ record, loadTestRecords });
  const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sketchizi-release-evidence-${String(record.id || "decision").replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
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

function sourceDriftSnapshotRows(snapshot) {
  if (!snapshot) return [["Snapshot", "Source record is currently missing"]];
  const metadata = snapshot.recordMetadata || {};
  const workload = snapshot.workload || {};
  const definition = snapshot.fieldDefinition || {};
  const present = (value) => value === null || value === undefined || value === "" ? "not recorded" : String(value);
  return [
    ["Record / schema", `${present(snapshot.recordId)} · schema ${present(snapshot.schemaVersion)}`],
    ["Field / value", `${present(snapshot.sourceField)} = ${present(snapshot.sourceValue)}${snapshot.transformation ? ` · ${snapshot.transformation}` : ""}`],
    ["Metadata", `name ${present(metadata.name)} · tested ${present(metadata.testedAt)} · env ${present(metadata.targetEnvironment)} · source ${present(metadata.source)}`],
    ["Workload", `duration ${present(workload.durationSeconds)}s · offered ${present(workload.offeredRps)} RPS · concurrency ${present(workload.concurrency)}`],
    ["Field definition", definition.key ? `${definition.label || definition.key} · ${definition.key} · min ${present(definition.min)} · max ${present(definition.max)} · step ${present(definition.step)} · group ${present(definition.group)}` : "Definition unavailable in original snapshot"],
  ];
}

export default function SimulationExperimentPanel({ workbench, simulationProfile, onUpdateSimulationProfile, simulationHistory = [], onUpdateSimulationHistory, onUpdateArchitectureDecisionRecords, onCreateTypedRelation, onFocusEntity, onUpdateEntity, visibleEntityIds = null, activeViewId = "system", onSwitchView, onSwitchToAdd, onRuntimeOverlayChange, canEdit = true }) {
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
  const [architectureBaselineId, setArchitectureBaselineId] = useState("");
  const [historyCompareIds, setHistoryCompareIds] = useState([]);
  const [historyComparison, setHistoryComparison] = useState(null);
  const [historyActionError, setHistoryActionError] = useState("");
  const [decisionRecordActionError, setDecisionRecordActionError] = useState("");
  const [releaseBundleReview, setReleaseBundleReview] = useState(null);
  const [releaseBundleReviewError, setReleaseBundleReviewError] = useState("");
  const [releaseBundleTrackingMessage, setReleaseBundleTrackingMessage] = useState("");
  const [reviewFindingDrafts, setReviewFindingDrafts] = useState({});
  const [remediationVerificationDrafts, setRemediationVerificationDrafts] = useState({});
  const [sourceDriftReviewDrafts, setSourceDriftReviewDrafts] = useState({});
  const [remediationWorkQueueFilter, setRemediationWorkQueueFilter] = useState("all");
  const [remediationWorkQueueTaskDrafts, setRemediationWorkQueueTaskDrafts] = useState({});
  const [remediationHandoffDraft, setRemediationHandoffDraft] = useState({ author: "", handedTo: "", note: "" });
  const [remediationHandoffReceiptDraft, setRemediationHandoffReceiptDraft] = useState({ reviewer: "", status: "received", note: "" });
  const [remediationHandoffReconciliation, setRemediationHandoffReconciliation] = useState(null);
  const [remediationHandoffActionDraft, setRemediationHandoffActionDraft] = useState({ owner: "", dueDate: "", closureCriteria: "", actor: "" });
  const [remediationHandoffClosureEvidence, setRemediationHandoffClosureEvidence] = useState("");
  const [focusedRemediationWorkItem, setFocusedRemediationWorkItem] = useState(null);
  const [selectedDecisionRecordId, setSelectedDecisionRecordId] = useState(() => workbench?.decisionRecords?.[0]?.id || "");
  const [decisionRecordDraft, setDecisionRecordDraft] = useState({ title: "", owner: "", status: "proposed", rationale: "" });
  const [rolloutEvidenceDrafts, setRolloutEvidenceDrafts] = useState({});
  const [historyRerunComparison, setHistoryRerunComparison] = useState(null);
  const [historyRerunBusyId, setHistoryRerunBusyId] = useState("");
  const [activeRunKey, setActiveRunKey] = useState("baseline");
  const [profileError, setProfileError] = useState("");
  const [runError, setRunError] = useState("");
  const [improvementResult, setImprovementResult] = useState(null);
  const [optimizationPortfolioTrials, setOptimizationPortfolioTrials] = useState([]);
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
  const architectureDecisionRecords = Array.isArray(workbench?.decisionRecords) ? workbench.decisionRecords : [];
  const selectedDecisionRecord = architectureDecisionRecords.find((record) => record.id === selectedDecisionRecordId) || null;
  const selectedRolloutReadiness = useMemo(() => buildRolloutReadiness(selectedDecisionRecord, { loadTestRecords: draftProfile?.loadTestEvidence?.records || [] }), [selectedDecisionRecord, draftProfile?.loadTestEvidence?.records]);
  const selectedRolloutChecks = useMemo(() => normalizeRolloutChecks(selectedDecisionRecord?.rolloutChecks), [selectedDecisionRecord]);

  useEffect(() => {
    if (!selectedDecisionRecordId && architectureDecisionRecords.length) {
      setSelectedDecisionRecordId(architectureDecisionRecords[0].id);
      return;
    }
    if (selectedDecisionRecordId && !architectureDecisionRecords.some((record) => record.id === selectedDecisionRecordId)) {
      setSelectedDecisionRecordId(architectureDecisionRecords[0]?.id || "");
    }
  }, [architectureDecisionRecords, selectedDecisionRecordId]);

  useEffect(() => {
    if (!selectedDecisionRecord) {
      setDecisionRecordDraft({ title: "", owner: "", status: "proposed", rationale: "" });
      return;
    }
    setDecisionRecordDraft({
      title: selectedDecisionRecord.title || "",
      owner: selectedDecisionRecord.owner || "",
      status: selectedDecisionRecord.status || "proposed",
      rationale: selectedDecisionRecord.rationale || "",
    });
    setDecisionRecordActionError("");
  }, [selectedDecisionRecordId]);

  useEffect(() => {
    if (!selectedDecisionRecord) {
      setRolloutEvidenceDrafts({});
      return;
    }
    setRolloutEvidenceDrafts(Object.fromEntries(normalizeRolloutChecks(selectedDecisionRecord.rolloutChecks).map((check) => [`${selectedDecisionRecord.id}:${check.id}`, check.evidence])));
  }, [selectedDecisionRecordId]);

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
  const remediationWorkQueue = useMemo(() => buildRemediationWorkQueue(architectureDecisionRecords, { loadTestRecords }), [architectureDecisionRecords, loadTestRecords]);
  const visibleRemediationWorkItems = filterRemediationWorkQueue(remediationWorkQueue.items, remediationWorkQueueFilter, { upcomingDeadlines: remediationWorkQueue.upcomingDeadlines, resolvedItems: remediationWorkQueue.resolvedItems });
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
  const currentArchitectureSnapshot = useMemo(() => createSimulationModelSnapshot(workbench), [workbench]);
  const selectedArchitectureBaseline = simulationHistory.find((entry) => entry.id === architectureBaselineId) || simulationHistory[0] || null;
  const currentResultsMatchArchitecture = Boolean(results?.sourceModelSnapshot && architectureSnapshotsMatch(results.sourceModelSnapshot, currentArchitectureSnapshot));
  const architectureImpact = useMemo(() => buildArchitectureChangeImpact({
    baselineSnapshot: selectedArchitectureBaseline?.sourceModelSnapshot,
    proposedSnapshot: currentArchitectureSnapshot,
    baselineMetrics: selectedArchitectureBaseline?.runs?.baseline?.result?.metrics || null,
    proposedMetrics: currentResultsMatchArchitecture ? results?.runs?.baseline?.result?.result?.metrics || null : null,
    proposedResultsMatchModel: currentResultsMatchArchitecture,
    baselineProfileFingerprint: selectedArchitectureBaseline?.profileFingerprint || null,
    proposedProfileFingerprint: results?.provenance?.profileFingerprint || null,
    baselineScopeEntityIds: selectedArchitectureBaseline?.scopeEntityIds ?? null,
    proposedScopeEntityIds: results?.runScopeEntityIds ?? results?.provenance?.scopeEntityIds ?? null,
  }), [selectedArchitectureBaseline, currentArchitectureSnapshot, currentResultsMatchArchitecture, results]);
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
  const optimizationRecommendations = useMemo(() => recommendSimulationImprovements({
    run: capacityScenario,
    profile: draftProfile,
    workbench,
    scopeEntityIds: simulationScope.entityIds,
  }), [capacityScenario, draftProfile, workbench, simulationScope]);
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
  const architectureDecisionReport = useMemo(() => {
    const pressureRows = getCapacityPressureRows(capacityScenario)
      .filter((row) => row.hasPressure || row.maxDropped > 0 || row.maxFailed > 0 || (row.queueWaitP95Ms ?? 0) > 0)
      .sort((left, right) => (right.maxDropped - left.maxDropped)
        || (right.maxFailed - left.maxFailed)
        || ((right.peakUtilization ?? 0) - (left.peakUtilization ?? 0))
        || ((right.queueWaitP95Ms ?? 0) - (left.queueWaitP95Ms ?? 0)))
      .slice(0, 4)
      .map((row) => ({ ...row, label: entitiesById.get(row.entityId)?.name || row.entityId }));
    return buildArchitectureDecisionReport({
      baselineName: selectedArchitectureBaseline?.name || selectedArchitectureBaseline?.id || "Saved experiment baseline",
      proposedName: "Current architecture",
      architectureImpact,
      bottlenecks: pressureRows,
      traceEvidence: activeInvestigation ? {
        ...activeInvestigation,
        label: activeInvestigation.componentLabel,
        scenarioLabel: results?.runs?.[activeInvestigation.scenarioKey]?.label || activeInvestigation.scenarioKey,
      } : null,
      optimizationRecommendations,
      optimizationTrials: optimizationPortfolioTrials,
      loadTestRecordsCount: loadTestRecords.length,
      profileConfirmed: profileIsConfirmed(resultsProfile),
      selectedScenarioLabel: capacityScenario?.label || null,
    });
  }, [capacityScenario, entitiesById, selectedArchitectureBaseline, architectureImpact, activeInvestigation, results, optimizationRecommendations, optimizationPortfolioTrials, loadTestRecords.length, resultsProfile]);
  const createDecisionRecord = () => {
    try {
      const record = createArchitectureDecisionRecord({ report: architectureDecisionReport });
      const nextRecords = [...architectureDecisionRecords, record].slice(-50);
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setSelectedDecisionRecordId(record.id);
      setDecisionRecordDraft({ title: record.title, owner: record.owner, status: record.status, rationale: record.rationale });
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not create a decision record.");
    }
  };
  const openRemediationWorkItem = (item) => {
    if (!item) return;
    setFocusedRemediationWorkItem({
      recordId: item.recordId,
      findingId: item.findingId,
      runId: item.runId,
      metricKey: item.metricKey,
      side: item.side,
    });
    setSelectedDecisionRecordId(item.recordId);
    setDecisionRecordActionError("");
  };

  useEffect(() => {
    const target = focusedRemediationWorkItem;
    if (!target || target.recordId !== selectedDecisionRecordId || typeof document === "undefined") return;
    const findingNodes = Array.from(document.querySelectorAll("[data-review-finding-id]"));
    const article = findingNodes.find((node) => node.dataset.reviewFindingId === target.findingId
      && node.dataset.decisionRecordId === target.recordId);
    if (!article) return;
    let focusNode = article;
    if (target.runId && target.metricKey && target.side) {
      const driftTargets = Array.from(article.querySelectorAll("[data-remediation-drift-target]"));
      focusNode = driftTargets.find((node) => node.dataset.remediationRunId === target.runId
        && node.dataset.remediationMetricKey === target.metricKey
        && node.dataset.remediationSide === target.side) || article.querySelector(".sim-remediation-effectiveness") || article;
    } else {
      focusNode = article.querySelector(".sim-remediation-effectiveness") || article;
    }
    if (typeof focusNode.scrollIntoView === "function") focusNode.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedRemediationWorkItem, selectedDecisionRecordId]);

  const saveRemediationWorkQueueTaskMetadata = (item) => {
    if (!canEdit || !item?.recordId || !item?.id) return;
    const record = architectureDecisionRecords.find((entry) => entry.id === item.recordId);
    if (!record) {
      setDecisionRecordActionError("The decision record for this queue task is no longer available.");
      return;
    }
    const saved = getRemediationTaskMetadata(record, item.id);
    const draft = remediationWorkQueueTaskDrafts[item.id] || { assignee: saved?.assignee || "", dueDate: saved?.dueDate || "" };
    try {
      const result = updateRemediationWorkQueueTask(record.workQueueTasks, item.id, {
        assignee: draft.assignee ?? saved?.assignee ?? "",
        dueDate: draft.dueDate ?? saved?.dueDate ?? "",
      });
      if (!result.changed) {
        setDecisionRecordActionError("");
        return;
      }
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, record.id, { workQueueTasks: result.tasks });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), assignee: result.task?.assignee || "", dueDate: result.task?.dueDate || "" } }));
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not save remediation task ownership and due date.");
    }
  };

  const saveRemediationTaskOperation = (item, operation, errorFallback = "Could not save remediation task follow-up.") => {
    if (!canEdit || !item?.recordId || !item?.id) return;
    const record = architectureDecisionRecords.find((entry) => entry.id === item.recordId);
    if (!record) {
      setDecisionRecordActionError("The decision record for this queue task is no longer available.");
      return;
    }
    try {
      const result = operation(record.workQueueTasks || []);
      if (!result.changed) {
        setDecisionRecordActionError("");
        return;
      }
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, record.id, { workQueueTasks: result.tasks });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError("");
      return result.task;
    } catch (error) {
      setDecisionRecordActionError(error?.message || errorFallback);
      return null;
    }
  };

  const acknowledgeRemediationEscalation = (item) => {
    if (!item?.isEscalationCandidate || item.isEscalationAcknowledged) return;
    const draft = remediationWorkQueueTaskDrafts[item.id] || {};
    saveRemediationTaskOperation(item, (tasks) => acknowledgeRemediationWorkQueueEscalation(tasks, item.id, {
      acknowledgedBy: draft.acknowledgedBy,
      note: draft.acknowledgementNote,
      fingerprint: item.escalationFingerprint,
      dueDateSnapshot: item.dueDate,
    }));
  };

  const addRemediationTaskFollowUpNote = (item) => {
    const draft = remediationWorkQueueTaskDrafts[item.id] || {};
    const result = saveRemediationTaskOperation(item, (tasks) => recordRemediationWorkQueueFollowUpNote(tasks, item.id, {
      author: draft.followUpAuthor,
      note: draft.followUpNote,
    }));
    if (result) setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), followUpNote: "" } }));
  };

  const resolveRemediationTask = (item) => {
    const draft = remediationWorkQueueTaskDrafts[item.id] || {};
    if (item.isEscalationCandidate && !item.isEscalationAcknowledged) {
      setDecisionRecordActionError("Acknowledge the overdue blocker escalation before resolving its queue task.");
      return;
    }
    const result = saveRemediationTaskOperation(item, (tasks) => resolveRemediationWorkQueueTask(tasks, item.id, {
      resolvedBy: draft.resolvedBy,
      note: draft.resolutionNote,
      evidenceReference: draft.resolutionEvidenceReference,
      fingerprint: item.lifecycleFingerprint,
    }));
    if (result) setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), resolutionNote: "", resolutionEvidenceReference: "" } }));
  };

  const reopenRemediationTask = (item) => {
    const draft = remediationWorkQueueTaskDrafts[item.id] || {};
    saveRemediationTaskOperation(item, (tasks) => reopenRemediationWorkQueueTask(tasks, item.id, {
      reopenedBy: draft.reopenedBy,
      note: draft.reopenNote,
    }));
  };

  const saveRemediationHandoffNote = () => {
    if (!canEdit || !selectedDecisionRecord) {
      setDecisionRecordActionError("Select a saved decision record before recording handoff notes.");
      return;
    }
    try {
      const draft = remediationHandoffDraft || {};
      const result = appendRemediationHandoffNote(selectedDecisionRecord.handoffNotes, {
        author: draft.author || selectedDecisionRecord.owner || "",
        handedTo: draft.handedTo,
        note: draft.note,
        handoffSummary: remediationWorkQueue.handoffSummary,
      });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { handoffNotes: result.notes });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setRemediationHandoffDraft((current) => ({ ...current, note: "" }));
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not save the escalation handoff note.");
    }
  };

  const saveRemediationHandoffReceipt = (handoffNoteId) => {
    if (!canEdit || !selectedDecisionRecord) return;
    try {
      const result = recordRemediationHandoffReceipt(selectedDecisionRecord.handoffNotes, handoffNoteId, remediationHandoffReceiptDraft, {});
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { handoffNotes: result.notes });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not record the handoff receipt.");
    }
  };

  const reconcileSavedRemediationHandoff = (handoffNote) => {
    setRemediationHandoffReconciliation(reconcileRemediationHandoff(handoffNote, remediationWorkQueue));
  };

  const saveRemediationHandoffCarryForwardActions = () => {
    if (!canEdit || !selectedDecisionRecord || !remediationHandoffReconciliation) return;
    try {
      const note = normalizeRemediationHandoffNotes(selectedDecisionRecord.handoffNotes).find((entry) => entry.id === remediationHandoffReconciliation.handoffNoteId);
      const result = createRemediationHandoffActions(note, remediationHandoffReconciliation, remediationHandoffActionDraft, { actor: remediationHandoffActionDraft.actor || remediationHandoffActionDraft.owner });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { handoffNotes: normalizeRemediationHandoffNotes(selectedDecisionRecord.handoffNotes).map((entry) => entry.id === note.id ? result.note : entry) });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError(result.createdCount ? `Created ${result.createdCount} carry-forward action(s).` : "No new actions were needed; matching task/category actions already exist.");
    } catch (error) { setDecisionRecordActionError(error?.message || "Could not create carry-forward actions."); }
  };

  const updateSavedRemediationHandoffAction = (handoffNoteId, actionId, patch) => {
    if (!canEdit || !selectedDecisionRecord) return;
    try {
      const notes = normalizeRemediationHandoffNotes(selectedDecisionRecord.handoffNotes);
      const note = notes.find((entry) => entry.id === handoffNoteId);
      const result = updateRemediationHandoffAction(note, actionId, patch, { actor: remediationHandoffActionDraft.actor || remediationHandoffActionDraft.owner, updatedAt: new Date().toISOString() });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { handoffNotes: notes.map((entry) => entry.id === note.id ? result.note : entry) });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError("");
    } catch (error) { setDecisionRecordActionError(error?.message || "Could not update the carry-forward action."); }
  };

  const saveDecisionRecordDraft = () => {
    if (!selectedDecisionRecord || !canEdit) return;
    if (!decisionRecordDraft.title.trim()) {
      setDecisionRecordActionError("Enter a title before saving this decision record.");
      return;
    }
    if (["accepted", "rejected"].includes(decisionRecordDraft.status)
      && (!decisionRecordDraft.owner.trim() || !decisionRecordDraft.rationale.trim())) {
      setDecisionRecordActionError("Record an owner and rationale before accepting or rejecting this proposal.");
      return;
    }
    try {
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, decisionRecordDraft);
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not save the decision record.");
    }
  };
  const toggleDecisionValidationGate = (gateId, done) => {
    if (!selectedDecisionRecord || !canEdit) return;
    try {
      const validationGates = (selectedDecisionRecord.validationGates || []).map((gate) => gate.id === gateId ? { ...gate, done } : gate);
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { validationGates });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not update the validation gate.");
    }
  };
  const reviewReleaseEvidenceFile = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setReleaseBundleReview(null);
    setReleaseBundleReviewError("");
    setReleaseBundleTrackingMessage("");
    if (file.size > 2 * 1024 * 1024) {
      setReleaseBundleReviewError("The selected file exceeds the 2 MB review limit. Export a bounded Sketchizi release evidence bundle and try again.");
      return;
    }
    try {
      const source = await file.text();
      setReleaseBundleReview(reviewReleaseEvidenceBundle(source, { sourceName: file.name }));
    } catch (error) {
      setReleaseBundleReviewError(error?.message || "Could not read the selected release evidence file.");
    }
  };
  const clearReleaseEvidenceReview = () => {
    setReleaseBundleReview(null);
    setReleaseBundleReviewError("");
    setReleaseBundleTrackingMessage("");
  };

  const trackReleaseBundleFindings = () => {
    if (!selectedDecisionRecord || !releaseBundleReview || !canEdit) return;
    try {
      const merged = mergeReleaseBundleReviewFindings(selectedDecisionRecord.reviewFindings, releaseBundleReview, {
        sourceName: releaseBundleReview.sourceName,
        importedAt: new Date().toISOString(),
      });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { reviewFindings: merged.findings });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setReleaseBundleTrackingMessage(`${merged.added} new finding(s) tracked; ${merged.reobserved} existing finding(s) matched; ${merged.reoccurrencesDetected || 0} previously closed finding(s) reappeared and need reviewer action. Existing dispositions were preserved.`);
      setDecisionRecordActionError("");
    } catch (error) {
      setReleaseBundleTrackingMessage("");
      setReleaseBundleReviewError(error?.message || "Could not add release review findings to the selected decision record.");
    }
  };

  const saveTrackedReviewFinding = (findingId) => {
    if (!selectedDecisionRecord || !canEdit) return;
    const finding = normalizeDecisionReviewFindings(selectedDecisionRecord.reviewFindings).find((entry) => entry.id === findingId);
    if (!finding) return;
    const key = `${selectedDecisionRecord.id}:${findingId}`;
    const draft = reviewFindingDrafts[key] || finding;
    try {
      const currentFinding = selectedDecisionRecord.reviewFindings.find((entry) => entry.id === findingId);
      const updatedFindingSet = updateTrackedReviewFinding(selectedDecisionRecord.reviewFindings, findingId, {
        owner: draft.owner,
        status: draft.status,
        rationale: draft.rationale,
        evidence: draft.evidence,
        acceptanceCriteria: draft.acceptanceCriteria ?? currentFinding?.acceptanceCriteria ?? {},
      });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { reviewFindings: updatedFindingSet.findings });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setReviewFindingDrafts((current) => ({ ...current, [key]: {
        owner: updatedFindingSet.finding.owner,
        status: updatedFindingSet.finding.status,
        rationale: updatedFindingSet.finding.rationale,
        evidence: updatedFindingSet.finding.evidence,
        acceptanceCriteria: updatedFindingSet.finding.acceptanceCriteria,
      } }));
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not save the review finding.");
    }
  };

  const saveRemediationVerificationRun = (findingId) => {
    if (!selectedDecisionRecord || !canEdit) return;
    const key = `${selectedDecisionRecord.id}:${findingId}`;
    const draft = remediationVerificationDrafts[key] || {};
    try {
      const result = recordRemediationVerificationRun(selectedDecisionRecord.reviewFindings, findingId, {
        runType: draft.runType || "regression-test",
        outcome: draft.outcome || "inconclusive",
        beforeState: draft.beforeState,
        afterState: draft.afterState,
        summary: draft.summary,
        evidence: draft.evidence,
        recordedBy: draft.recordedBy,
        measurements: draft.measurements || {},
        measurementSources: draft.measurementSources || {},
      }, { loadTestRecords });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { reviewFindings: result.findings });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setRemediationVerificationDrafts((current) => ({ ...current, [key]: {
        runType: draft.runType || "regression-test", outcome: draft.outcome || "inconclusive",
        beforeState: "", afterState: "", summary: "", evidence: "", measurements: {}, measurementSources: {}, recordedBy: draft.recordedBy || selectedDecisionRecord.owner || "",
        verifiedBy: draft.verifiedBy || "", verificationRationale: draft.verificationRationale || "",
      } }));
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not record the remediation verification run.");
    }
  };

  const saveRemediationSourceDriftReview = (findingId, runId, metricKey, side, fingerprint) => {
    if (!selectedDecisionRecord || !canEdit) return;
    const draftKey = `${selectedDecisionRecord.id}:${findingId}:${runId}:${metricKey}:${side}:${fingerprint}`;
    const draft = sourceDriftReviewDrafts[draftKey] || {};
    try {
      const result = recordRemediationSourceDriftResolution(selectedDecisionRecord.reviewFindings, findingId, runId, metricKey, side, {
        disposition: draft.disposition || "requires-reverification",
        reviewer: draft.reviewer,
        rationale: draft.rationale,
      }, { loadTestRecords });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { reviewFindings: result.findings });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not record the source drift review.");
    }
  };

  const confirmFindingRemediationVerification = (findingId, runId) => {
    if (!selectedDecisionRecord || !canEdit) return;
    const key = `${selectedDecisionRecord.id}:${findingId}`;
    const draft = remediationVerificationDrafts[key] || {};
    try {
      const result = confirmRemediationVerification(selectedDecisionRecord.reviewFindings, findingId, runId, {
        verifiedBy: draft.verifiedBy,
        rationale: draft.verificationRationale,
        loadTestRecords,
      });
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { reviewFindings: result.findings });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not confirm remediation effectiveness.");
    }
  };

  const reopenRecurringReviewFinding = (findingId) => {
    if (!selectedDecisionRecord || !canEdit) return;
    const key = `${selectedDecisionRecord.id}:${findingId}`;
    try {
      const reopened = reopenTrackedReviewFinding(selectedDecisionRecord.reviewFindings, findingId);
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { reviewFindings: reopened.findings });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setReviewFindingDrafts((current) => ({ ...current, [key]: {
        ...reopened.finding,
        status: "open",
      } }));
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not reopen the recurring review finding.");
    }
  };

  const saveRolloutCheck = (checkId, patch) => {
    if (!selectedDecisionRecord || !canEdit) return;
    try {
      const currentChecks = normalizeRolloutChecks(selectedDecisionRecord.rolloutChecks);
      const currentCheck = currentChecks.find((check) => check.id === checkId);
      if (!currentCheck) throw new Error("That rollout check is not recognized.");
      const evidenceKey = `${selectedDecisionRecord.id}:${checkId}`;
      const evidence = Object.hasOwn(patch, "evidence")
        ? String(patch.evidence ?? "").trim()
        : String(rolloutEvidenceDrafts[evidenceKey] ?? currentCheck.evidence).trim();
      let done = Object.hasOwn(patch, "done") ? patch.done === true : currentCheck.done;
      if (Object.hasOwn(patch, "evidence") && !evidence) done = false;
      if (done && !evidence) {
        setDecisionRecordActionError("Add an evidence note or reference before marking a rollout check complete.");
        return;
      }
      const rolloutChecks = currentChecks.map((check) => check.id === checkId ? { ...check, evidence, done } : check);
      const nextRecords = updateArchitectureDecisionRecords(architectureDecisionRecords, selectedDecisionRecord.id, { rolloutChecks });
      onUpdateArchitectureDecisionRecords?.(nextRecords);
      setRolloutEvidenceDrafts((current) => ({ ...current, [evidenceKey]: evidence }));
      setDecisionRecordActionError("");
    } catch (error) {
      setDecisionRecordActionError(error?.message || "Could not update the rollout checklist.");
    }
  };
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

  const runImprovementExperiment = (interventionKind = "capacity", recommendation = null) => {
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
      const indexRecommendation = isDatabaseIndex && recommendation?.interventionKind === "database-index" ? recommendation : null;
      const indexCandidate = indexRecommendation || selectedDatabaseIndexCandidate;
      const preferredEntityId = recommendation?.entityId || (isDatabaseIndex
        ? indexCandidate?.entityId
        : isWriteContention ? databaseContentionTraceTargetEntityId
          : isServiceTime ? serviceTimeTraceTargetEntityId : capacityTraceTargetEntityId);
      const improvement = isDatabaseIndex
        ? createDatabaseIndexImprovementProfile({
          profile: draftProfile,
          workbench,
          scopeEntityIds: simulationScope.entityIds,
          componentRows: pressureRows,
          preferredEntityId,
          preferredTableId: indexCandidate?.tableEntityId,
          preferredColumnName: indexCandidate?.columnName,
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
      setOptimizationPortfolioTrials((current) => [...current, { ...displayImprovement, id: `${displayImprovement.interventionKind}-${displayImprovement.createdAt}` }].slice(-12));
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
    <details className="sim-release-bundle-review">
      <summary><span>Review exported release evidence bundle</span><small>Inspect structure, consistency, missing evidence and open requirements</small></summary>
      <p>Import a previously exported Sketchizi release evidence JSON file for a read-only review. This checks the bundle's structure and internal consistency; it does not verify signatures, source authenticity, external references, or production safety.</p>
      <label className="sim-release-bundle-file"><span>Choose release evidence bundle (.json)</span><input aria-label="Choose release evidence bundle JSON file" type="file" accept=".json,application/json" onChange={reviewReleaseEvidenceFile} /></label>
      {releaseBundleReviewError && <p className="sim-release-bundle-error" role="alert">{releaseBundleReviewError}</p>}
      {releaseBundleReview && <section className={`sim-release-bundle-result is-${releaseBundleReview.status}`} aria-live="polite" aria-label="Release evidence review results">
        <div className="sim-architecture-decision-heading"><strong>{releaseBundleReview.label}</strong><span>{releaseBundleReview.sourceName}</span></div>
        <p className="sim-release-bundle-identity">{releaseBundleReview.bundleMetadata.title || "No decision title"}{releaseBundleReview.bundleMetadata.recordId ? ` · ${releaseBundleReview.bundleMetadata.recordId}` : ""}</p>
        <p className="sim-release-bundle-disposition">Decision: {releaseBundleReview.bundleMetadata.decisionStatus || "unavailable"} · Readiness: {releaseBundleReview.bundleMetadata.readinessStatus || "unavailable"} · Bundle disposition: {releaseBundleReview.bundleMetadata.disposition || "unavailable"}</p>
        <div className="sim-release-bundle-summary-grid">
          <div><strong>{releaseBundleReview.counts.errors}</strong><span>Structural errors</span></div>
          <div><strong>{releaseBundleReview.counts.warnings}</strong><span>Findings to review</span></div>
          <div><strong>{releaseBundleReview.counts.openChecks}</strong><span>Open readiness checks</span></div>
          <div><strong>{releaseBundleReview.counts.loadTestRecords}/{releaseBundleReview.counts.loadTestRecordsAtExport ?? "?"}</strong><span>Load-test records included / at export</span></div>
        </div>
        {releaseBundleReview.counts.trackedReviewFindings > 0 && <p className="sim-release-bundle-disposition">Decision-record remediation status: {releaseBundleReview.counts.openReviewFindings} open · {releaseBundleReview.counts.blockingReviewFindings} open error blocker(s) · {releaseBundleReview.counts.acceptedRiskFindings} accepted risk(s) · {releaseBundleReview.counts.resolvedReviewFindings} resolved.</p>}
        <div className="sim-release-bundle-findings"><strong>Review findings ({releaseBundleReview.findings.length})</strong>
          {releaseBundleReview.findings.length === 0 ? <p>No structural or consistency findings were detected. This is not proof of evidence authenticity.</p> : <ul>{releaseBundleReview.findings.slice(0, 24).map((finding, index) => <li className={`is-${finding.severity}`} key={`${finding.code}-${index}`}><strong>{finding.title}</strong><small>{finding.detail}</small></li>)}</ul>}
          {releaseBundleReview.findings.length > 24 && <small>Showing the first 24 findings. The summary counts include all findings.</small>}
        </div>
        <p className="sim-release-bundle-disclaimer">{releaseBundleReview.interpretation}</p>
        {releaseBundleTrackingMessage && <p className="sim-inline-note" role="status">{releaseBundleTrackingMessage}</p>}
        <div className="sim-release-bundle-actions">
          <button type="button" className="workbench-primary" disabled={!canEdit || !selectedDecisionRecord || releaseBundleReview.findings.length === 0} onClick={trackReleaseBundleFindings}>{selectedDecisionRecord ? `Track findings in “${selectedDecisionRecord.title}”` : "Select a decision record to track findings"}</button>
          <button type="button" className="workbench-secondary" onClick={clearReleaseEvidenceReview}>Clear review</button>
        </div>
      </section>}
    </details>
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
        <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Load</th><th>Offered</th><th>Throughput</th><th>p95 latency</th><th>p95 headroom</th><th>Failed requests</th><th>Error budget remaining</th><th>SLO</th></tr></thead><tbody>
          {trafficSweepResults.points.map((point) => <tr key={point.multiplier}><td>{point.label}</td><td>{formatInteger(point.metrics?.offeredRequests)}</td><td>{formatDecimal(point.metrics?.throughputRps)}</td><td>{formatDecimal(point.p95LatencyMs)} ms</td><td>{point.sloBudget?.latencyHeadroomMs == null ? "—" : `${formatDecimal(point.sloBudget.latencyHeadroomMs)} ms (${formatDecimal(point.sloBudget.latencyHeadroomPercent)}%)`}</td><td>{point.failedRatePercent == null ? "—" : `${formatDecimal(point.failedRatePercent)}%`}</td><td>{point.sloBudget?.errorBudgetRemainingPercent == null ? (trafficSweepResults.targets?.maxErrorRatePercent === 0 ? (point.sloBudget?.errorBudgetStatus === "within-budget" ? "0% target met" : point.sloBudget?.errorBudgetStatus === "exhausted" ? "Zero budget exceeded" : "—") : "—") : `${formatDecimal(point.sloBudget.errorBudgetRemainingPercent)}%`}</td><td><span className={`sim-repeat-slo-outcome ${point.sloStatus === "pass" ? "all-pass" : point.sloStatus === "fail" ? "all-fail" : "single-observation"}`}>{point.sloStatus === "pass" ? "Pass" : point.sloStatus === "fail" ? "Fail" : point.sloStatus === "targets-not-set" ? "Set SLOs" : point.status}</span></td></tr>)}
        </tbody></table></div>
        <p className="sim-capacity-target">p95 headroom is target minus observed p95; negative values exceed the latency target. Error budget remaining is relative to the configured error-rate allowance; negative values mean the allowance was exceeded. A zero-percent error target has no meaningful percentage budget, so the UI reports whether it was met without dividing by zero.</p>
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
    {simulationHistory.length > 0 && <details className="sim-architecture-impact">
      <summary><span>Architecture change impact</span><small>{architectureImpact.changeCount} semantic change(s) · compare current model with a saved baseline</small></summary>
      <p>Select a saved experiment as the baseline, then compare its semantic component and typed-relationship snapshot with the current architecture. This analysis ignores canvas layout and highlights which components are directly changed or connected to a changed relationship.</p>
      <label className="sim-architecture-baseline"><span>Saved architecture baseline</span><select aria-label="Saved architecture baseline" value={selectedArchitectureBaseline?.id || ""} onChange={(event) => setArchitectureBaselineId(event.target.value)}>
        {simulationHistory.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || entry.id} · {new Date(entry.createdAt).toLocaleDateString()}</option>)}
      </select></label>
      <div className={`sim-architecture-impact-status ${architectureImpact.status}`} role="status"><strong>{architectureImpact.status === "changed" ? `${architectureImpact.changeCount} change(s) detected` : architectureImpact.status === "identical" ? "No semantic changes detected" : "Impact analysis unavailable"}</strong><span>{architectureImpact.reason}</span></div>
      {architectureImpact.status !== "unavailable" && <div className="sim-architecture-change-summary">
        <div><strong>{architectureImpact.entityChanges.added.length}</strong><span>Components added</span></div>
        <div><strong>{architectureImpact.entityChanges.removed.length}</strong><span>Components removed</span></div>
        <div><strong>{architectureImpact.entityChanges.modified.length}</strong><span>Components modified</span></div>
        <div><strong>{architectureImpact.relationChanges.added.length + architectureImpact.relationChanges.removed.length + architectureImpact.relationChanges.modified.length}</strong><span>Relationships changed</span></div>
      </div>}
      {architectureImpact.changes.length > 0 && <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Type</th><th>Change</th><th>Element</th><th>Details</th><th>Navigation</th></tr></thead><tbody>
        {architectureImpact.changes.map((change) => <tr key={change.id}><td>{change.subjectType}</td><td>{change.action}</td><td><strong>{change.label}</strong><small>{change.subjectId}</small></td><td>{change.detail}</td><td>{change.entityIds?.some((id) => workbench?.entities?.some((entity) => entity.id === id)) ? <button type="button" className="sim-scenario-link" onClick={() => onFocusEntity?.(change.entityIds.find((id) => workbench?.entities?.some((entity) => entity.id === id)))}>Focus component</button> : "—"}</td></tr>)}
      </tbody></table></div>}
      <section className="sim-architecture-simulation-impact" aria-label="Simulation outcome comparison for architecture changes">
        <strong>Simulation impact</strong>
        <p>{architectureImpact.simulation.reason}</p>
        {architectureImpact.simulation.status === "comparable" && <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Metric</th><th>Saved baseline</th><th>Current architecture</th><th>Δ</th><th>Direction</th></tr></thead><tbody>
          {architectureImpact.simulation.metrics.map((metric) => <tr key={metric.key}><td>{metric.label}</td><td>{metric.before == null ? "—" : metric.key === "successRate" ? formatPercent(metric.before) : `${formatDecimal(metric.before)}${metric.key === "throughputRps" ? " req/s" : metric.key === "p95LatencyMs" ? " ms" : ""}`}</td><td>{metric.after == null ? "—" : metric.key === "successRate" ? formatPercent(metric.after) : `${formatDecimal(metric.after)}${metric.key === "throughputRps" ? " req/s" : metric.key === "p95LatencyMs" ? " ms" : ""}`}</td><td>{metric.delta == null ? "—" : metric.key === "successRate" ? `${metric.delta > 0 ? "+" : ""}${formatPercent(metric.delta)} pp` : `${metric.delta > 0 ? "+" : ""}${formatDecimal(metric.delta)}${metric.key === "throughputRps" ? " req/s" : metric.key === "p95LatencyMs" ? " ms" : ""}`}</td><td>{metric.direction === "improved" ? "Improved" : metric.direction === "regressed" ? "Regressed" : metric.direction === "unchanged" ? "Unchanged" : "Unavailable"}</td></tr>)}
        </tbody></table></div>}
        <small>Architecture comparison is semantic, not visual. Relationship changes also mark their endpoint components as affected. Metric deltas are shown only when the current run matches the proposed model and profile fingerprints and component scopes match. Even then, simulation values are synthetic, not live production measurements.</small>
      </section>
      <section className="sim-architecture-decision-report" aria-label="Architecture decision report">
        <div className="sim-architecture-decision-heading"><strong>Architecture decision report</strong><span>{architectureDecisionReport.confidence}</span></div>
        <p className="sim-architecture-decision-verdict">{architectureDecisionReport.decision}</p>
        <p>{architectureDecisionReport.rationale}</p>
        <div className="sim-architecture-decision-grid">
          <div><strong>{architectureDecisionReport.counts.addedComponents + architectureDecisionReport.counts.removedComponents + architectureDecisionReport.counts.modifiedComponents}</strong><span>Component changes</span></div>
          <div><strong>{architectureDecisionReport.counts.addedRelationships + architectureDecisionReport.counts.removedRelationships + architectureDecisionReport.counts.modifiedRelationships}</strong><span>Relationship changes</span></div>
          <div><strong>{architectureDecisionReport.bottlenecks.length}</strong><span>Pressure signals</span></div>
          <div><strong>{architectureDecisionReport.portfolio.length}</strong><span>Ranked portfolio trials</span></div>
        </div>
        {architectureDecisionReport.recommendations.length > 0 && <div className="sim-architecture-decision-list"><strong>Experiments to consider</strong><ul>{architectureDecisionReport.recommendations.map((item, index) => <li key={`${item.interventionKind}-${item.entityId || index}`}><span>{item.label}</span><small>{item.reason}</small></li>)}</ul></div>}
        {architectureDecisionReport.risks.length > 0 && <div className="sim-architecture-decision-list"><strong>Risks and evidence gaps</strong><ul>{architectureDecisionReport.risks.slice(0, 4).map((risk) => <li key={risk}>{risk}</li>)}</ul></div>}
        <button type="button" className="workbench-secondary" onClick={() => downloadArchitectureDecisionReport(architectureDecisionReport)}>Export decision report (.md)</button>
        <small>The report combines semantic change detection, matched simulation deltas when available, current bottleneck signals, trace investigation, and this panel session's optimization portfolio. It does not automatically approve a change or claim production validation.</small>
      </section>
      <section className="sim-decision-records" aria-label="Architecture decision record lifecycle">
        <div className="sim-architecture-decision-heading"><strong>Decision records</strong><span>{architectureDecisionRecords.length} saved in this document</span></div>
        <p>Capture a review decision against a point-in-time report. The record and its evidence snapshot are saved with the Sketchizi Workbench document.</p>
        <section className="sim-remediation-handoff" aria-label="Escalation review and handoff">
          <div className="sim-architecture-decision-heading"><strong>Escalation review &amp; handoff</strong><span>{remediationWorkQueue.handoffSummary.acknowledgedBlockers.count} acknowledged blocker(s) · {remediationWorkQueue.handoffSummary.overdueTasks.count} overdue task(s) · {remediationWorkQueue.handoffSummary.resolvedTasksWithOpenFindings.count} resolved task(s) with open findings</span></div>
          <p>Review the current cross-record queue state before handing work to another engineer or shift. Queue counts are derived from the active task set, while handoff notes are manually recorded and saved to the selected decision record. Neither action changes canonical findings or original evidence.</p>
          <div className="sim-remediation-handoff-categories">
            {[
              { key: "acknowledgedBlockers", label: "Acknowledged blockers", description: "Overdue rollout blockers with a current acknowledgement." },
              { key: "unresolvedFollowUps", label: "Unresolved follow-ups", description: "Active tasks that are not currently overdue." },
              { key: "overdueTasks", label: "Overdue tasks", description: "All active tasks past their due date, including blockers." },
              { key: "resolvedTasksWithOpenFindings", label: "Resolved tasks · findings still open", description: "Task follow-up was completed, but the underlying finding disposition remains open." },
            ].map(({ key, label, description }) => {
              const category = remediationWorkQueue.handoffSummary[key];
              return <section className="sim-remediation-handoff-category" key={key} aria-label={label}>
                <div className="sim-remediation-work-queue-subheading"><strong>{label}</strong><span>{category.count}</span></div>
                <p>{description}</p>
                {category.items.length ? <ul>{category.items.slice(0, 4).map((item) => <li key={item.id}><div><strong>{item.findingTitle}</strong><small>{item.recordTitle} · {item.assignee || "Unassigned"}{item.dueDate ? ` · due ${item.dueDate}` : " · no due date"}{item.blocksRollout ? " · rollout blocker" : ""}{item.findingStatus === "open" ? " · finding open" : ""}</small></div><button type="button" className="workbench-secondary" onClick={() => openRemediationWorkItem(item)}>Open task</button></li>)}</ul> : <small>No items in this category as of {remediationWorkQueue.handoffSummary.asOfDate}.</small>}
                {category.truncated && <small>Showing {category.items.length} of {category.count} tasks in this category.</small>}
              </section>;
            })}
          </div>
          <section className="sim-remediation-handoff-note-editor" aria-label="Record handoff note">
            <strong>Record handoff note</strong>
            <p>Saved with the selected decision record: {selectedDecisionRecord?.title || "No decision record selected"}. The note includes a point-in-time snapshot of these queue categories.</p>
            <div className="sim-remediation-handoff-note-fields">
              <label><span>Author</span><input maxLength={120} disabled={!canEdit || !selectedDecisionRecord} value={remediationHandoffDraft.author || ""} onChange={(event) => setRemediationHandoffDraft((current) => ({ ...current, author: event.target.value }))} placeholder={selectedDecisionRecord?.owner || "Name or team"} /></label>
              <label><span>Hand off to (optional)</span><input maxLength={120} disabled={!canEdit || !selectedDecisionRecord} value={remediationHandoffDraft.handedTo || ""} onChange={(event) => setRemediationHandoffDraft((current) => ({ ...current, handedTo: event.target.value }))} placeholder="Next shift or responsible team" /></label>
            </div>
            <label><span>Handoff notes</span><textarea maxLength={1800} rows={3} disabled={!canEdit || !selectedDecisionRecord} value={remediationHandoffDraft.note || ""} onChange={(event) => setRemediationHandoffDraft((current) => ({ ...current, note: event.target.value }))} placeholder="What must the next owner know, what is still blocked, and what should happen next?" /></label>
            <div className="sim-remediation-handoff-actions"><button type="button" className="workbench-primary" disabled={!canEdit || !selectedDecisionRecord || !remediationHandoffDraft.note?.trim()} onClick={saveRemediationHandoffNote}>Save handoff note</button><button type="button" className="workbench-secondary" onClick={() => downloadRemediationHandoff(remediationWorkQueue, architectureDecisionRecords)}>Export escalation handoff (.md)</button></div>
            {selectedDecisionRecord && normalizeRemediationHandoffNotes(selectedDecisionRecord.handoffNotes).length > 0 && <details className="sim-remediation-work-queue-history"><summary>Saved handoff notes ({normalizeRemediationHandoffNotes(selectedDecisionRecord.handoffNotes).length})</summary><ol>{normalizeRemediationHandoffNotes(selectedDecisionRecord.handoffNotes).slice().reverse().map((entry) => <li key={entry.id}>{entry.createdAt} — <strong>{entry.author}</strong>{entry.handedTo ? ` → ${entry.handedTo}` : ""}: {entry.note}{entry.summarySnapshot && <small> Snapshot {entry.summarySnapshot.asOfDate}: {entry.summarySnapshot.activeTaskCount} active, {entry.summarySnapshot.resolvedTaskCount} resolved, {entry.summarySnapshot.openRolloutBlockerCount} open blockers.</small>}<div className="sim-remediation-handoff-actions"><button type="button" className="workbench-secondary" onClick={() => reconcileSavedRemediationHandoff(entry)}>Compare snapshot with current queue</button></div>{entry.receipt ? <small>Receipt: {entry.receipt.status} · {entry.receipt.reviewer} · {entry.receipt.recordedAt}. Manual attestation only.</small> : <div className="sim-remediation-handoff-note-fields"><label><span>Receipt reviewer</span><input maxLength={120} disabled={!canEdit} value={remediationHandoffReceiptDraft.reviewer} onChange={(event) => setRemediationHandoffReceiptDraft((current) => ({ ...current, reviewer: event.target.value }))} placeholder="Reviewer name or team" /></label><label><span>Receipt status</span><select disabled={!canEdit} value={remediationHandoffReceiptDraft.status} onChange={(event) => setRemediationHandoffReceiptDraft((current) => ({ ...current, status: event.target.value }))}><option value="received">Received</option><option value="received-with-follow-up">Received — follow-up required</option><option value="not-received">Not received</option></select></label><label><span>Receipt note (optional)</span><input maxLength={1200} disabled={!canEdit} value={remediationHandoffReceiptDraft.note} onChange={(event) => setRemediationHandoffReceiptDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Manual reviewer note" /></label><button type="button" className="workbench-secondary" disabled={!canEdit || !remediationHandoffReceiptDraft.reviewer.trim()} onClick={() => saveRemediationHandoffReceipt(entry.id)}>Record receipt</button></div>}{entry.followUpActions?.length > 0 && <section className="sim-remediation-handoff-reconciliation"><strong>Carry-forward action ledger ({entry.followUpActions.length})</strong><ul>{entry.followUpActions.map((action) => <li key={action.id}><strong>{action.status.toUpperCase()} · {action.findingTitle || action.taskId}</strong><small>Owner: {action.owner} · Due: {action.dueDate}</small><small>Closure criteria: {action.closureCriteria}</small>{action.closureEvidence && <small>Closure evidence: {action.closureEvidence}</small>}<small>{action.history.length} immutable history event(s). Manual workflow metadata only.</small>{action.status !== "closed" && <div className="sim-remediation-handoff-actions"><button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => updateSavedRemediationHandoffAction(entry.id, action.id, { status: "in-progress" })}>Mark in progress</button><input aria-label={`Closure evidence for ${action.findingTitle || action.taskId}`} maxLength={1200} disabled={!canEdit} value={remediationHandoffClosureEvidence} onChange={(event) => setRemediationHandoffClosureEvidence(event.target.value)} placeholder="Closure evidence reference" /><button type="button" className="workbench-secondary" disabled={!canEdit || !remediationHandoffClosureEvidence.trim()} onClick={() => { updateSavedRemediationHandoffAction(entry.id, action.id, { status: "closed", closureEvidence: remediationHandoffClosureEvidence }); setRemediationHandoffClosureEvidence(""); }}>Close with evidence</button></div>}</li>)}</ul></section>}</li>)}</ol></details>}{remediationHandoffReconciliation && <section className="sim-remediation-handoff-reconciliation" aria-live="polite"><strong>Snapshot reconciliation</strong><p>Compared {remediationHandoffReconciliation.comparedReferenceCount} bounded snapshot reference(s): {remediationHandoffReconciliation.unchangedCount} unchanged, {remediationHandoffReconciliation.carryForwardCount} needing follow-up.</p>{remediationHandoffReconciliation.carryForward.length > 0 ? <ul>{remediationHandoffReconciliation.carryForward.map((entry) => <li key={`${entry.category}:${entry.taskId}`}><strong>{entry.findingTitle || entry.findingCode || entry.taskId}</strong><small>{entry.reason}</small></li>)}</ul> : <small>No changes detected in the saved preview references.</small>}{remediationHandoffReconciliation.carryForward.length > 0 && <div className="sim-remediation-handoff-note-fields"><label><span>Action owner (required)</span><input maxLength={120} disabled={!canEdit} value={remediationHandoffActionDraft.owner} onChange={(event) => setRemediationHandoffActionDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="Responsible person or team" /></label><label><span>Action due date (required)</span><input type="date" disabled={!canEdit} value={remediationHandoffActionDraft.dueDate} onChange={(event) => setRemediationHandoffActionDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label><label><span>Closure criteria (required)</span><input maxLength={1200} disabled={!canEdit} value={remediationHandoffActionDraft.closureCriteria} onChange={(event) => setRemediationHandoffActionDraft((current) => ({ ...current, closureCriteria: event.target.value }))} placeholder="Define what must be true to close these actions" /></label><label><span>Recorded by</span><input maxLength={120} disabled={!canEdit} value={remediationHandoffActionDraft.actor} onChange={(event) => setRemediationHandoffActionDraft((current) => ({ ...current, actor: event.target.value }))} placeholder="Reviewer" /></label><button type="button" className="workbench-secondary" disabled={!canEdit || !remediationHandoffActionDraft.owner.trim() || !remediationHandoffActionDraft.dueDate || !remediationHandoffActionDraft.closureCriteria.trim()} onClick={saveRemediationHandoffCarryForwardActions}>Create carry-forward actions</button></div>}<small>{remediationHandoffReconciliation.disclaimer}</small></section>}
          </section>
          <small>Handoff notes are manual coordination context, not evidence verification, notification delivery, a change in finding disposition, or deployment approval.</small>
        </section>
        <section className="sim-remediation-work-queue" aria-label="Remediation work queue">
          <div className="sim-architecture-decision-heading"><strong>Remediation work queue</strong><span>{remediationWorkQueue.totalCount} active · {remediationWorkQueue.totalResolvedCount} task(s) resolved · {remediationWorkQueue.blockingCount} active rollout blocker task(s) · {remediationWorkQueue.overdueCount} overdue</span></div>
          <p>Prioritized follow-up across tracked findings in all saved decision records. Task acknowledgement and resolution are workflow metadata only: completing a task does not change the canonical finding disposition, erase historical evidence, or remove a still-open error finding from rollout readiness.</p>
          <div className="sim-remediation-work-queue-toolbar">
            <label><span>Show</span><select aria-label="Filter remediation work queue" value={remediationWorkQueueFilter} onChange={(event) => setRemediationWorkQueueFilter(event.target.value)}>{REMEDIATION_WORK_QUEUE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label>
            <small>{remediationWorkQueue.sourceDriftReviewCount} source review(s) · {remediationWorkQueue.reVerificationCount} re-verification task(s) · {remediationWorkQueue.recurrenceReviewCount} recurrence review(s) · {remediationWorkQueue.unassignedCount} unassigned task(s) · {remediationWorkQueue.upcomingDeadlineCount} deadline(s) through {remediationWorkQueue.upcomingDeadlineThrough}</small>
          </div>
          <section className={`sim-remediation-work-queue-escalation ${remediationWorkQueue.escalationSummary.overdueBlockerCount ? "is-active" : ""}`} aria-label="Overdue blocker escalation">
            <div className="sim-remediation-work-queue-subheading"><strong>Escalation summary — overdue rollout blockers</strong><span>{remediationWorkQueue.escalationSummary.overdueBlockerCount} task(s)</span></div>
            {remediationWorkQueue.escalationSummary.overdueBlockerCount ? <>
              <p role="alert">{remediationWorkQueue.escalationSummary.overdueBlockerCount} overdue blocking task(s) across {remediationWorkQueue.escalationSummary.affectedDecisionRecordCount} decision record(s); {remediationWorkQueue.escalationSummary.unassignedOverdueBlockerCount} unassigned. {remediationWorkQueue.escalationSummary.acknowledgedCount} acknowledged · {remediationWorkQueue.escalationSummary.unacknowledgedCount} not acknowledged. {remediationWorkQueue.escalationSummary.oldestDueDate ? `Oldest due date ${remediationWorkQueue.escalationSummary.oldestDueDate} (${remediationWorkQueue.escalationSummary.oldestDaysOverdue} day(s) overdue).` : ""}</p>
              <div className="sim-remediation-work-queue-escalation-items">{remediationWorkQueue.escalationSummary.items.map((item) => <div className="sim-remediation-work-queue-escalation-item" key={item.id}><div><strong>{item.findingTitle}</strong><small>{item.recordTitle} · {item.assignee || "Unassigned"} · due {item.dueDate} · {item.daysOverdue} day(s) overdue · {item.isEscalationAcknowledged ? `Acknowledged by ${item.escalationAcknowledgement?.acknowledgedBy || "reviewer"}` : "Not acknowledged"}</small></div><button type="button" className="workbench-secondary" onClick={() => { setRemediationWorkQueueFilter(item.isEscalationAcknowledged ? "overdue-blockers" : "unacknowledged-escalations"); openRemediationWorkItem(item); }}>Open blocker task</button></div>)}</div>
              {remediationWorkQueue.escalationSummary.truncated && <small>Showing the five oldest overdue blocker tasks in this escalation preview.</small>}
              <button type="button" className="workbench-secondary" onClick={() => setRemediationWorkQueueFilter("overdue-blockers")}>View overdue blockers</button>
            </> : <p role="status">No overdue rollout-blocking tasks were detected as of {remediationWorkQueue.evaluatedDate}.</p>}
          </section>
          <div className="sim-remediation-work-queue-accountability-grid">
            <section className="sim-remediation-work-queue-workload" aria-label="Workload by assignee">
              <div className="sim-remediation-work-queue-subheading"><strong>Workload by assignee</strong><span>{remediationWorkQueue.totalAssigneeCount} assignee group(s)</span></div>
              {remediationWorkQueue.assigneeWorkloads.length ? <div className="sim-remediation-work-queue-workloads" role="list">{remediationWorkQueue.assigneeWorkloads.slice(0, 12).map((summary) => <div className="sim-remediation-work-queue-workload-row" role="listitem" key={summary.key}>
                <strong>{summary.assignee}</strong><span>{summary.taskCount} task(s) · {summary.blockingCount} blocker(s)</span><small>{summary.overdueCount} overdue · {summary.overdueBlockerCount} overdue blocker(s) · {summary.upcomingDeadlineCount} deadline(s) in next 7 days · {summary.affectedDecisionRecordCount} decision record(s)</small>
              </div>)}</div> : <p>No derived remediation tasks currently require assignment.</p>}
              {remediationWorkQueue.assigneeWorkloadsTruncated && <small>Showing the 100 highest-priority assignee summaries. Counts cover all derived tasks.</small>}
            </section>
            <section className="sim-remediation-work-queue-upcoming" aria-label="Upcoming deadlines">
              <div className="sim-remediation-work-queue-subheading"><strong>Upcoming deadlines</strong><span>{remediationWorkQueue.upcomingDeadlineCount} in next 7 days</span></div>
              {remediationWorkQueue.upcomingDeadlines.length ? <ol className="sim-remediation-work-queue-upcoming-list">{remediationWorkQueue.upcomingDeadlines.slice(0, 8).map((item) => <li key={item.id}><div><strong>{item.dueDate}{item.dueState === "due-today" ? " · Due today" : ""}</strong><small>{item.findingTitle} · {item.assignee || "Unassigned"} · {item.blocksRollout ? "Rollout blocker" : item.priority === "high" ? "High priority" : "Normal priority"}</small></div><button type="button" className="workbench-secondary" onClick={() => openRemediationWorkItem(item)}>Open task</button></li>)}</ol> : <p>No tasks are due between {remediationWorkQueue.evaluatedDate} and {remediationWorkQueue.upcomingDeadlineThrough}.</p>}
              {remediationWorkQueue.upcomingDeadlinesTruncated && <small>Showing the ten soonest deadline previews.</small>}
              <button type="button" className="workbench-secondary" onClick={() => setRemediationWorkQueueFilter("upcoming")}>View upcoming deadlines</button>
            </section>
          </div>
          {(remediationWorkQueueFilter === "resolved" ? remediationWorkQueue.resolvedItems.length === 0 : remediationWorkQueue.items.length === 0) ? <p className="workbench-findings-empty">{remediationWorkQueueFilter === "resolved" ? "No queue tasks have a current resolved status." : "No active remediation follow-up tasks were detected across the saved decision records."}</p>
            : visibleRemediationWorkItems.length === 0 ? <p className="workbench-findings-empty">No tasks match this queue filter.</p>
              : <ol className="sim-remediation-work-queue-list">{visibleRemediationWorkItems.map((item) => <li className={`sim-remediation-work-queue-item priority-${item.priority} ${focusedRemediationWorkItem?.recordId === item.recordId && focusedRemediationWorkItem?.findingId === item.findingId && focusedRemediationWorkItem?.runId === item.runId && focusedRemediationWorkItem?.metricKey === item.metricKey && focusedRemediationWorkItem?.side === item.side ? "is-focused" : ""}`} key={item.id}>
                <div className="sim-remediation-work-queue-item-heading"><strong>{item.kindLabel}</strong><span className={`sim-remediation-work-queue-priority is-${item.priority}`}>{item.priority === "blocking" ? "Rollout blocker" : item.priority === "high" ? "High priority" : "Normal"}</span></div>
                <p><strong>{item.findingTitle}</strong> · {item.severity.toUpperCase()} · {item.findingCode}</p>
                <small>Decision: {item.recordTitle} · status {item.decisionStatus} · finding {item.findingStatus} · finding owner {item.owner || "unassigned"}</small>
                <p>{item.reason}</p>
                {item.taskResolutionStale && <p className="sim-remediation-work-queue-stale-resolution" role="alert">The earlier task resolution no longer matches the current task state. It remains in history; this item is active again and needs review.</p>}
                {item.isTaskResolved && <div className="sim-remediation-work-queue-task-resolved" role="status"><strong>Queue task resolved</strong><small>{item.taskResolution?.resolvedAt} · {item.taskResolution?.resolvedBy}</small><p>{item.taskResolution?.note}</p>{item.taskResolution?.evidenceReference && <small>Reference: {item.taskResolution.evidenceReference}</small>}{item.blocksRollout && item.findingStatus === "open" && <p role="alert">This queue task is complete, but the underlying error finding remains open and still blocks rollout readiness.</p>}</div>}
                <div className="sim-remediation-work-queue-schedule">
                  <label><span>Task assignee</span><input aria-label={`Task assignee for ${item.findingTitle}`} maxLength={120} value={remediationWorkQueueTaskDrafts[item.id]?.assignee ?? item.assignee ?? ""} disabled={!canEdit} placeholder="Assign a person or team" onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || { assignee: item.assignee || "", dueDate: item.dueDate || "" }), assignee: event.target.value } }))} /></label>
                  <label><span>Task due date</span><input aria-label={`Task due date for ${item.findingTitle}`} type="date" value={remediationWorkQueueTaskDrafts[item.id]?.dueDate ?? item.dueDate ?? ""} disabled={!canEdit} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || { assignee: item.assignee || "", dueDate: item.dueDate || "" }), dueDate: event.target.value } }))} /></label>
                  <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => saveRemediationWorkQueueTaskMetadata(item)}>Save task details</button>
                </div>
                {item.isEscalationCandidate && <section className="sim-remediation-work-queue-acknowledgement" aria-label={`Escalation acknowledgement for ${item.findingTitle}`}>
                  <strong>Overdue blocker escalation</strong>
                  {item.isEscalationAcknowledged ? <p role="status">Acknowledged by {item.escalationAcknowledgement?.acknowledgedBy} on {item.escalationAcknowledgement?.acknowledgedAt}. {item.escalationAcknowledgement?.note}</p> : <>
                    {item.isEscalationAcknowledgementStale && <p role="alert">The previous acknowledgement refers to a different overdue state and no longer applies.</p>}
                    <label><span>Acknowledged by</span><input maxLength={120} aria-label={`Escalation acknowledged by for ${item.findingTitle}`} disabled={!canEdit} value={remediationWorkQueueTaskDrafts[item.id]?.acknowledgedBy || ""} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), acknowledgedBy: event.target.value } }))} placeholder="Reviewer or escalation owner" /></label>
                    <label><span>Follow-up / acknowledgement note</span><textarea maxLength={1200} rows={2} aria-label={`Escalation acknowledgement note for ${item.findingTitle}`} disabled={!canEdit} value={remediationWorkQueueTaskDrafts[item.id]?.acknowledgementNote || ""} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), acknowledgementNote: event.target.value } }))} placeholder="Who is following up and what happens next?" /></label>
                    <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => acknowledgeRemediationEscalation(item)}>Acknowledge escalation</button>
                  </>}
                </section>}
                <section className="sim-remediation-work-queue-follow-up" aria-label={`Follow-up notes for ${item.findingTitle}`}>
                  <strong>Follow-up notes</strong>
                  <label><span>Note author</span><input maxLength={120} aria-label={`Follow-up note author for ${item.findingTitle}`} disabled={!canEdit} value={remediationWorkQueueTaskDrafts[item.id]?.followUpAuthor || ""} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), followUpAuthor: event.target.value } }))} placeholder="Name or team" /></label>
                  <label><span>Follow-up note</span><textarea maxLength={1200} rows={2} aria-label={`Follow-up note for ${item.findingTitle}`} disabled={!canEdit} value={remediationWorkQueueTaskDrafts[item.id]?.followUpNote || ""} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), followUpNote: event.target.value } }))} placeholder="Next step, dependency, or review context" /></label>
                  <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => addRemediationTaskFollowUpNote(item)}>Add follow-up note</button>
                  {item.followUpNotes?.length > 0 && <details className="sim-remediation-work-queue-history"><summary>Follow-up note history ({item.followUpNotes.length})</summary><ol>{item.followUpNotes.slice().reverse().map((note) => <li key={note.id}>{note.at} — <strong>{note.author}</strong> ({note.type}): {note.note}</li>)}</ol></details>}
                </section>
                {item.isTaskResolved ? <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => reopenRemediationTask(item)}>Reopen queue task</button> : <section className="sim-remediation-work-queue-task-resolution" aria-label={`Task resolution for ${item.findingTitle}`}>
                  <strong>Task-level resolution</strong><p>Resolution closes only this follow-up task. It does not change the finding's status or remove independent rollout blockers.</p>
                  <label><span>Resolved by</span><input maxLength={120} aria-label={`Task resolved by for ${item.findingTitle}`} disabled={!canEdit} value={remediationWorkQueueTaskDrafts[item.id]?.resolvedBy || ""} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), resolvedBy: event.target.value } }))} placeholder="Name or team" /></label>
                  <label><span>Resolution note</span><textarea maxLength={1200} rows={2} aria-label={`Task resolution note for ${item.findingTitle}`} disabled={!canEdit} value={remediationWorkQueueTaskDrafts[item.id]?.resolutionNote || ""} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), resolutionNote: event.target.value } }))} placeholder="What follow-up action is complete?" /></label>
                  <label><span>Evidence / reference (optional)</span><input maxLength={600} aria-label={`Task resolution evidence for ${item.findingTitle}`} disabled={!canEdit} value={remediationWorkQueueTaskDrafts[item.id]?.resolutionEvidenceReference || ""} onChange={(event) => setRemediationWorkQueueTaskDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), resolutionEvidenceReference: event.target.value } }))} placeholder="Ticket, test run, or follow-up reference" /></label>
                  <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => resolveRemediationTask(item)}>Mark task resolved</button>
                </section>}
                {item.dueState !== "not-set" && <p className={`sim-remediation-work-queue-due-state is-${item.dueState}`} role={item.isOverdue ? "alert" : "status"}>{item.isOverdue ? `OVERDUE — due ${item.dueDate}` : item.dueState === "due-today" ? `Due today — ${item.dueDate}` : `Due ${item.dueDate}`}</p>}
                {item.taskMetadataUpdatedAt && <small>Task details updated {item.taskMetadataUpdatedAt}. Task-level history is separate from the finding audit.</small>}
                {item.taskAuditTrail?.length > 0 && <details className="sim-remediation-work-queue-history"><summary>Task audit history ({item.taskAuditTrail.length})</summary><ol>{item.taskAuditTrail.slice().reverse().map((event) => <li key={event.id}>{event.at} — {event.message}</li>)}</ol></details>}
                <button type="button" className="workbench-secondary" onClick={() => openRemediationWorkItem(item)}>{item.actionLabel}</button>
              </li>)}</ol>}
          {remediationWorkQueueFilter === "upcoming" && remediationWorkQueue.upcomingDeadlinesTruncated && <small>Showing the ten soonest deadlines out of {remediationWorkQueue.upcomingDeadlineCount}; the filter uses a bounded preview to keep the queue responsive.</small>}
          {remediationWorkQueue.truncated && remediationWorkQueueFilter !== "upcoming" && <small>Only the first 300 prioritized tasks are shown. Review findings and audit history remain stored in their individual decision records.</small>}
          <small className="sim-rollout-readiness-disclaimer">{remediationWorkQueue.disclaimer}</small>
        </section>
        <div className="sim-decision-record-toolbar">
          <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={createDecisionRecord}>Create decision record from report</button>
          {architectureDecisionRecords.length > 0 && <label><span>Open record</span><select aria-label="Open architecture decision record" value={selectedDecisionRecordId || ""} onChange={(event) => { setSelectedDecisionRecordId(event.target.value); setDecisionRecordActionError(""); }}>
            {architectureDecisionRecords.slice().reverse().map((record) => <option key={record.id} value={record.id}>{record.title || record.id} · {record.status}</option>)}
          </select></label>}
        </div>
        {decisionRecordActionError && <p className="sim-inline-note" role="alert">{decisionRecordActionError}</p>}
        {!selectedDecisionRecord && <p className="workbench-findings-empty">No decision record has been created yet. Create one to preserve the current report as a reviewable decision.</p>}
        {selectedDecisionRecord && <div className="sim-decision-record-editor">
          <div className="sim-decision-record-snapshot"><strong>Evidence snapshot</strong><span>{selectedDecisionRecord.reportSnapshot?.recommendation || "Recommendation unavailable"}</span><small>Baseline: {selectedDecisionRecord.baselineName || "Unavailable"} · Proposed: {selectedDecisionRecord.proposedName || "Unavailable"} · Simulation: {selectedDecisionRecord.reportSnapshot?.simulationStatus || "unavailable"}</small><small>Created {selectedDecisionRecord.createdAt} · Updated {selectedDecisionRecord.updatedAt}</small></div>
          <div className="sim-decision-record-fields">
            <label><span>Record title</span><input maxLength={180} value={decisionRecordDraft.title} disabled={!canEdit} onChange={(event) => setDecisionRecordDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <label><span>Review owner</span><input maxLength={120} value={decisionRecordDraft.owner} disabled={!canEdit} placeholder="Engineering owner" onChange={(event) => setDecisionRecordDraft((current) => ({ ...current, owner: event.target.value }))} /></label>
            <label><span>Decision status</span><select value={decisionRecordDraft.status} disabled={!canEdit} onChange={(event) => setDecisionRecordDraft((current) => ({ ...current, status: event.target.value }))}>{ARCHITECTURE_DECISION_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="sim-decision-record-rationale"><span>Decision rationale</span><textarea maxLength={2000} rows={3} disabled={!canEdit} value={decisionRecordDraft.rationale} placeholder="Why is this proposal accepted, rejected, or deferred?" onChange={(event) => setDecisionRecordDraft((current) => ({ ...current, rationale: event.target.value }))} /></label>
          </div>
          <div className="sim-decision-record-gates"><strong>Validation gates</strong><small>Outstanding gates remain visible even after a decision is accepted. Acceptance is not a production rollout approval.</small>
            {(selectedDecisionRecord.validationGates || []).length === 0 ? <p className="workbench-findings-empty">No validation gates were recorded for this report.</p> : <ul>{selectedDecisionRecord.validationGates.map((gate) => <li key={gate.id}><label><input type="checkbox" checked={gate.done === true} disabled={!canEdit} onChange={(event) => toggleDecisionValidationGate(gate.id, event.target.checked)} /><span>{gate.label}</span></label>{gate.done && gate.completedAt && <small>Completed {gate.completedAt}</small>}</li>)}</ul>}
            <p className="sim-decision-record-open-gates">{(selectedDecisionRecord.validationGates || []).filter((gate) => !gate.done).length} outstanding gate(s)</p>
          </div>
          <section className="sim-rollout-readiness" aria-label="Rollout readiness checklist">
            <div className="sim-architecture-decision-heading"><strong>Rollout readiness</strong><span>{selectedRolloutReadiness.completeCount}/{selectedRolloutReadiness.totalCount} checks complete</span></div>
            <p className={`sim-rollout-readiness-status is-${selectedRolloutReadiness.status}`}>{selectedRolloutReadiness.label}</p>
            <p className="sim-rollout-readiness-intro">Derived from the saved decision, evidence snapshot, validation gates, and required production checks. For each production check, add a short evidence note, ticket, test run, or runbook reference before marking it complete.</p>
            <ul className="sim-rollout-readiness-list">
              {selectedRolloutReadiness.checks.map((check) => {
                const checkId = check.id.startsWith("production-") ? check.id.slice("production-".length) : null;
                const savedCheck = checkId ? selectedRolloutChecks.find((entry) => entry.id === checkId) : null;
                const evidenceKey = `${selectedDecisionRecord.id}:${checkId}`;
                if (savedCheck) return <li className={`sim-rollout-check is-${check.state}`} key={check.id}>
                  <label className="sim-rollout-check-toggle"><input type="checkbox" checked={savedCheck.done === true && Boolean(savedCheck.evidence.trim())} disabled={!canEdit} onChange={(event) => saveRolloutCheck(savedCheck.id, { done: event.target.checked })} /><span>{check.label}</span><small>{check.state}</small></label>
                  <input className="sim-rollout-evidence-input" aria-label={`Evidence for ${check.label}`} maxLength={600} value={rolloutEvidenceDrafts[evidenceKey] ?? savedCheck.evidence} disabled={!canEdit} placeholder="Evidence note / ticket / test run reference" onChange={(event) => setRolloutEvidenceDrafts((current) => ({ ...current, [evidenceKey]: event.target.value }))} onBlur={(event) => {
                    const value = event.currentTarget.value;
                    if (value !== savedCheck.evidence) saveRolloutCheck(savedCheck.id, { evidence: value });
                  }} />
                  <small className="sim-rollout-check-detail">{check.detail}</small>
                </li>;
                return <li className={`sim-rollout-check is-${check.state}`} key={check.id}><div className="sim-rollout-system-check"><span>{check.label}</span><small>{check.state}</small></div><p>{check.detail}</p></li>;
              })}
            </ul>
            <p className="sim-rollout-readiness-disclaimer">{selectedRolloutReadiness.disclaimer}</p>
          </section>
          {(() => {
            const trackedFindings = normalizeDecisionReviewFindings(selectedDecisionRecord.reviewFindings);
            const findingSummary = summarizeDecisionReviewFindings(trackedFindings, { loadTestRecords });
            return <section className="sim-review-finding-tracker" aria-label="Release review findings and remediation">
              <div className="sim-architecture-decision-heading"><strong>Review findings &amp; remediation</strong><span>{findingSummary.open} open · {findingSummary.blocking} blocking · {findingSummary.reoccurrences} reoccurred · {findingSummary.acceptedRisk} accepted risk · {findingSummary.resolved} resolved · {findingSummary.remediationVerified} effectiveness verified · {findingSummary.resolvedButUnverified} resolved but unverified</span></div>
              <p>Findings imported from release bundles are stored in this decision record. Each imported observation records the source bundle and the observed severity, title, and detail; the latest two observations are compared field by field. A finding seen again after being marked Resolved or Accepted Risk is flagged for review without silently changing its disposition. Reopening requires fresh supporting evidence before the finding can be closed again. Unreviewed recurring error findings block rollout readiness. Accepted Risk and Resolved dispositions require an owner, rationale, and supporting evidence.</p>
              {trackedFindings.length === 0 ? <p className="workbench-findings-empty">No release-bundle findings are tracked yet. Import a release evidence JSON above, then add its findings to this decision record.</p> : <div className="sim-review-finding-list">
                {trackedFindings.map((finding) => {
                  const key = `${selectedDecisionRecord.id}:${finding.id}`;
                  const draft = reviewFindingDrafts[key] || finding;
                  const observationTimeline = buildReviewFindingObservationTimeline(finding);
                  const isQueueFocusedFinding = focusedRemediationWorkItem?.recordId === selectedDecisionRecord.id && focusedRemediationWorkItem?.findingId === finding.id;
                  return <article data-review-finding-id={finding.id} data-decision-record-id={selectedDecisionRecord.id} className={`sim-review-finding is-${finding.severity} status-${finding.status}${isQueueFocusedFinding ? " is-work-queue-focus" : ""}`} key={finding.id}>
                    <div className="sim-review-finding-heading"><strong>{finding.title}</strong><span className={`sim-review-finding-status is-${finding.status}`}>{finding.status === "accepted-risk" ? "Accepted Risk" : finding.status === "resolved" ? "Resolved" : "Open"}</span></div>
                    <div className="sim-review-finding-meta"><span>{finding.severity.toUpperCase()}</span><code>{finding.code}</code><small>Created {finding.createdAt} · Updated {finding.updatedAt}</small></div>
                    <p>{finding.detail || "No additional finding details were recorded."}</p>
                    <small className="sim-review-finding-sources">Source bundle(s): {finding.sourceBundleNames.join(", ") || "Unspecified"}{finding.resolvedAt ? ` · Resolved ${finding.resolvedAt}` : ""}</small>
                    {observationTimeline.timeline.length > 0 && <details className="sim-review-finding-timeline"><summary>Observation timeline ({observationTimeline.timeline.length} bundle observation{observationTimeline.timeline.length === 1 ? "" : "s"})</summary>
                      {observationTimeline.previous && observationTimeline.latest && <div className="sim-review-finding-diff">
                        <strong>{observationTimeline.hasDetailChanges ? "Latest observation differs from its predecessor" : "Latest observation matches its predecessor"}</strong>
                        {observationTimeline.hasDetailChanges ? observationTimeline.changes.map((change) => <p key={change.field}><span>{change.field}</span><small>Previous: {change.previous || "(empty)"}</small><small>Latest: {change.current || "(empty)"}</small></p>) : <p>No severity, title, or detail changes were detected between the latest two recorded observations.</p>}
                      </div>}
                      <ol>{observationTimeline.timeline.map((observation) => <li key={observation.key}><strong>{observation.sourceName || "Release bundle"}</strong><small>Imported {observation.observedAt}{observation.generatedAt ? ` · Bundle generated ${observation.generatedAt}` : ""}</small>{observation.findingSnapshot && <p>{observation.findingSnapshot.severity.toUpperCase()} · {observation.findingSnapshot.title}<br />{observation.findingSnapshot.detail || "No detail recorded."}</p>}</li>)}</ol>
                    </details>}
                    {finding.reoccurrence?.state === "unreviewed" && <div className={`sim-review-finding-reoccurrence is-${finding.severity}`} role="alert">
                      <strong>{finding.severity === "error" ? "Recurring error — rollout blocked" : "Previously closed finding reappeared"}</strong>
                      <p>This finding was previously {finding.reoccurrence.previousStatus === "accepted-risk" ? "Accepted Risk" : "Resolved"} and reappeared in {finding.reoccurrence.sourceBundleName || "a later release bundle"} on {finding.reoccurrence.detectedAt}. The previous disposition is preserved until you review it.</p>
                      <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => reopenRecurringReviewFinding(finding.id)}>Reopen finding</button>
                    </div>}
                    {finding.reoccurrence?.state === "reopened" && <p className="sim-review-finding-reopened">Reopened after reoccurrence review on {finding.reoccurrence.reviewedAt}. This finding is Open and follows the normal rollout-blocking rules.</p>}
                    {finding.freshEvidenceRequired && <div className={`sim-review-finding-fresh-evidence is-${finding.severity}`} role="alert"><strong>Fresh supporting evidence required</strong><p>This finding was reopened. Earlier evidence is retained for comparison but cannot be reused to close this recurrence. Record a new, distinct test run, report, ticket, or remediation reference before marking it Resolved or Accepted Risk. Workbench timestamps when you enter the reference; it does not independently verify when the underlying artifact was created.</p>{finding.previousEvidence && <small>Previous evidence (historical only): {finding.previousEvidence}</small>}</div>}
                    {(() => {
                      const effectiveness = buildRemediationEffectivenessSummary(finding, { loadTestRecords });
                      const verificationDraft = remediationVerificationDrafts[key] || {
                        runType: "regression-test", outcome: "inconclusive", beforeState: "", afterState: "", summary: "", evidence: "", measurements: {}, measurementSources: {}, recordedBy: finding.owner || "", verifiedBy: "", verificationRationale: "",
                      };
                      const changeVerificationDraft = (field, value) => setRemediationVerificationDrafts((current) => ({ ...current, [key]: { ...(current[key] || verificationDraft), [field]: value } }));
                      const changeVerificationMeasurement = (metricKey, side, value) => changeVerificationDraft("measurements", {
                        ...(verificationDraft.measurements || {}),
                        [metricKey]: { ...((verificationDraft.measurements || {})[metricKey] || {}), [side]: value },
                      });
                      const changeVerificationMeasurementSource = (metricKey, side, field, value) => changeVerificationDraft("measurementSources", {
                        ...(verificationDraft.measurementSources || {}),
                        [metricKey]: {
                          ...((verificationDraft.measurementSources || {})[metricKey] || {}),
                          [side]: { ...(((verificationDraft.measurementSources || {})[metricKey] || {})[side] || {}), [field]: value },
                        },
                      });
                      const setVerificationMeasurementSourceType = (metricKey, side, sourceType) => changeVerificationDraft("measurementSources", {
                        ...(verificationDraft.measurementSources || {}),
                        [metricKey]: { ...((verificationDraft.measurementSources || {})[metricKey] || {}), [side]: { sourceType } },
                      });
                      const measurementSourcePreview = captureRemediationMeasurementSources(verificationDraft.measurementSources || {}, verificationDraft.measurements || {}, loadTestRecords).evaluation;
                      const latestRun = effectiveness.latestRun;
                      const acceptanceMetrics = getRemediationAcceptanceMetricDefinitions();
                      const criteriaConfigured = Object.keys(finding.acceptanceCriteria || {}).length > 0;
                      const acceptedNameOnlySourceDrift = effectiveness.status === "measurement-source-drift-detected"
                        && effectiveness.sourceDriftResolutionSummary?.canUseHistoricalConfirmation === true;
                      const canConfirmLatestRun = latestRun?.outcome === "pass" && !latestRun.verificationSupersededAt && !effectiveness.isVerified
                        && (!(["criteria-not-evaluated", "measurement-sources-inconsistent", "measurement-sources-incomplete", "measurement-source-drift-detected", "measurement-source-snapshot-incomplete"].includes(effectiveness.status)) || acceptedNameOnlySourceDrift)
                        && (!criteriaConfigured || effectiveness.acceptanceEvaluation.status === "pass")
                        && (effectiveness.measurementSourceEvaluation?.measurementCount === 0 || effectiveness.measurementSourceEvaluation?.status === "complete");
                      return <section className={`sim-remediation-effectiveness is-${effectiveness.status}`} aria-label="Remediation effectiveness verification">
                        <div className="sim-remediation-effectiveness-heading"><strong>Remediation effectiveness</strong><span className={`sim-remediation-effectiveness-status is-${effectiveness.status}`}>{effectiveness.label}</span></div>
                        <p>Supporting evidence submitted and remediation verified are separate states. Record the before/after observation and test outcome, then explicitly confirm a passing run as a reviewer. Workbench does not execute or authenticate the external test.</p>
                        <div className="sim-remediation-criteria">
                          <strong>Quantitative acceptance criteria</strong>
                          <p>Set one or more measurable targets. Maximum targets apply to p95 latency and error rate; minimum targets apply to throughput and success rate. Save the finding before recording a run against these targets.</p>
                          <div className="sim-remediation-criteria-fields">
                            {acceptanceMetrics.map((metric) => <label key={metric.key}><span>{metric.label} target ({metric.unit}) · {metric.direction === "max" ? "maximum" : "minimum"}</span><input aria-label={`${metric.label} acceptance target`} type="number" min={metric.min} max={Number.isFinite(metric.max) ? metric.max : undefined} step="any" value={(draft.acceptanceCriteria ?? finding.acceptanceCriteria ?? {})[metric.key] ?? ""} disabled={!canEdit} placeholder="Not configured" onChange={(event) => setReviewFindingDrafts((current) => ({ ...current, [key]: { ...(current[key] || finding), acceptanceCriteria: { ...((current[key] || finding).acceptanceCriteria || finding.acceptanceCriteria || {}), [metric.key]: event.target.value } } }))} /></label>)}
                          </div>
                          {criteriaConfigured && <small>Current saved criteria: {acceptanceMetrics.filter((metric) => finding.acceptanceCriteria?.[metric.key] !== undefined).map((metric) => `${metric.label} ${metric.direction === "max" ? "≤" : "≥"} ${finding.acceptanceCriteria[metric.key]} ${metric.unit}`).join("; ")}. Changing targets invalidates prior verification until a new run passes and is confirmed.</small>}
                        </div>
                        {criteriaConfigured && <div className={`sim-remediation-criteria-result is-${effectiveness.acceptanceEvaluation.status}`}>
                          <strong>Acceptance result: {effectiveness.acceptanceEvaluation.status.replaceAll("-", " ").toUpperCase()}</strong>
                          <p>{effectiveness.acceptanceEvaluation.reason}</p>
                          {effectiveness.acceptanceEvaluation.criteria.map((criterion) => <div key={criterion.key} className={`sim-remediation-criterion is-${criterion.state}`}>
                            <span>{criterion.label}</span><span>Target: {criterion.comparator} {criterion.target} {criterion.unit}</span><span>Before: {criterion.before === null ? "not supplied" : `${criterion.before} ${criterion.unit}`}</span><span>After: {criterion.after === null ? "not supplied" : `${criterion.after} ${criterion.unit}`}</span><strong>{criterion.state.toUpperCase()}</strong>{criterion.delta !== null && <small>Change: {criterion.delta > 0 ? "+" : ""}{criterion.delta} {criterion.unit}</small>}
                          </div>)}
                        </div>}
                        {effectiveness.sourceDriftEvaluation && !["not-evaluated", "not-applicable"].includes(effectiveness.sourceDriftEvaluation.status) && <div className={`sim-remediation-source-drift is-${effectiveness.sourceDriftEvaluation.status}`} role={effectiveness.sourceDriftEvaluation.status === "drift-detected" ? "alert" : "status"}>
                          <strong>Current source drift: {effectiveness.sourceDriftEvaluation.status.replaceAll("-", " ").toUpperCase()}</strong>
                          <p>{effectiveness.sourceDriftEvaluation.reason} The original verification snapshot is retained and is not silently replaced.</p>
                          {effectiveness.sourceDriftResolutionSummary?.status && <p><strong>Reviewer disposition state:</strong> {effectiveness.sourceDriftResolutionSummary.status.replaceAll("-", " ").toUpperCase()}. {effectiveness.sourceDriftResolutionSummary.status === "accepted-context" ? "Only display-name metadata changed; the source measurement value and workload definition remain unchanged." : effectiveness.sourceDriftResolutionSummary.status === "reverification-required" || effectiveness.sourceDriftResolutionSummary.status === "needs-review" ? "This history does not overwrite the measurement snapshot. A new verification run is required for value, field, workload, missing-source, or incomplete-snapshot changes." : "Inspect any changed source snapshots before relying on this verification."}</p>}
                          {(effectiveness.sourceDriftResolutionSummary?.items || []).map((item) => {
                            const driftKey = `${selectedDecisionRecord.id}:${finding.id}:${latestRun?.id}:${item.metricKey}:${item.side}:${item.fingerprint}`;
                            const driftDraft = sourceDriftReviewDrafts[driftKey] || {};
                            const disposition = driftDraft.disposition || (item.canAcceptAsContext ? "acceptable-context" : "requires-reverification");
                            const isQueueFocusedDrift = isQueueFocusedFinding && focusedRemediationWorkItem?.runId === latestRun?.id && focusedRemediationWorkItem?.metricKey === item.metricKey && focusedRemediationWorkItem?.side === item.side;
                            return <div data-remediation-drift-target="" data-remediation-run-id={latestRun?.id || ""} data-remediation-metric-key={item.metricKey} data-remediation-side={item.side} className={`sim-remediation-source-drift-item${isQueueFocusedDrift ? " is-work-queue-focus" : ""}`} key={`${item.metricKey}-${item.side}-${item.sourceRecordId}-${item.fingerprint}`}>
                              <strong>{item.metricLabel} {item.side} · {item.sourceRecordId || "source record missing"} · {item.state}</strong>
                              {item.changes.map((change, changeIndex) => <small key={`${change.type}-${changeIndex}`}>{change.label}: {change.detail}</small>)}
                              <div className="sim-remediation-source-comparison" aria-label={`${item.metricLabel} ${item.side} original and current source comparison`}>
                                <div><strong>Original snapshot</strong>{sourceDriftSnapshotRows(item.originalSnapshot).map(([label, value]) => <p key={label}><span>{label}</span>{value}</p>)}</div>
                                <div><strong>Current source</strong>{sourceDriftSnapshotRows(item.currentSnapshot).map(([label, value]) => <p key={label}><span>{label}</span>{value}</p>)}</div>
                              </div>
                              {item.latestReview && <p className="sim-remediation-source-review-state">Latest review for this exact snapshot: {item.latestReview.disposition.replaceAll("-", " ")} · {item.latestReview.reviewer} · {item.latestReview.reviewedAt}. {item.latestReview.rationale}</p>}
                              <div className="sim-review-finding-fields sim-remediation-source-review-fields">
                                <label><span>Disposition</span><select value={disposition} disabled={!canEdit} onChange={(event) => setSourceDriftReviewDrafts((current) => ({ ...current, [driftKey]: { ...(current[driftKey] || {}), disposition: event.target.value } }))}>{REMEDIATION_SOURCE_DRIFT_DISPOSITION_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value === "acceptable-context" && !item.canAcceptAsContext}>{option.label}</option>)}</select></label>
                                <label><span>Reviewer</span><input maxLength={120} value={driftDraft.reviewer || ""} disabled={!canEdit} placeholder="Reviewer recording this disposition" onChange={(event) => setSourceDriftReviewDrafts((current) => ({ ...current, [driftKey]: { ...(current[driftKey] || {}), reviewer: event.target.value } }))} /></label>
                                <label><span>Rationale</span><textarea maxLength={1200} rows={2} value={driftDraft.rationale || ""} disabled={!canEdit} placeholder={disposition === "acceptable-context" ? "Why is this display-name-only change non-material?" : "Why does the current source require a new verification run?"} onChange={(event) => setSourceDriftReviewDrafts((current) => ({ ...current, [driftKey]: { ...(current[driftKey] || {}), rationale: event.target.value } }))} /></label>
                              </div>
                              <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => saveRemediationSourceDriftReview(finding.id, latestRun.id, item.metricKey, item.side, item.fingerprint)}>Save drift review</button>
                              <small>{item.canAcceptAsContext ? "Acceptable-context is limited to a record display-name-only change. The historical source snapshot remains unchanged." : "This difference cannot be waived as context. The disposition requires a new verification run using the current source mappings below; prior measurements and snapshots remain historical and unchanged."}</small>
                              {item.reviewHistory.length > 0 && <details className="sim-remediation-source-review-history"><summary>Prior review decisions ({item.reviewHistory.length})</summary><ol>{item.reviewHistory.slice().reverse().map((review) => <li key={review.id}>{review.disposition.replaceAll("-", " ")} · {review.reviewer} · {review.reviewedAt}<p>{review.rationale}</p></li>)}</ol></details>}
                            </div>;
                          })}
                          <small>Source drift is a consistency comparison, not independent authentication.</small>
                        </div>}
                        {finding.sourceDriftReviews?.length > 0 && <details className="sim-remediation-source-review-history sim-remediation-source-review-audit"><summary>Saved source drift review history ({finding.sourceDriftReviews.length})</summary><ol>{finding.sourceDriftReviews.slice().reverse().map((review) => <li key={review.id}><strong>{review.metricLabel} {review.side} · {review.sourceRecordId} · {review.disposition.replaceAll("-", " ")}</strong><p>{review.reviewer} · {review.reviewedAt}</p><p>{review.rationale}</p><div className="sim-remediation-source-comparison"><div><strong>Original snapshot at review</strong>{sourceDriftSnapshotRows(review.originalSnapshot).map(([label, value]) => <p key={label}><span>{label}</span>{value}</p>)}</div><div><strong>Current snapshot at review</strong>{sourceDriftSnapshotRows(review.currentSnapshot).map(([label, value]) => <p key={label}><span>{label}</span>{value}</p>)}</div></div></li>)}</ol><small>Saved review snapshots are immutable history. A later source change requires a new review for the changed fingerprint.</small></details>}
                        {effectiveness.isVerified && <div className="sim-remediation-verified-note"><strong>Currently verified by reviewer</strong><span>{effectiveness.verification.verifiedBy} · {effectiveness.verification.verifiedAt}</span><p>{effectiveness.verification.rationale}</p></div>}
                        {effectiveness.verification?.status === "superseded" && <div className="sim-review-finding-reoccurrence"><strong>Prior verification is historical</strong><p>{effectiveness.verification.supersededReason || "A newer observation invalidated the prior verification."} The historic passing run is retained below, but is not current proof.</p></div>}
                        {latestRun && <div className="sim-remediation-comparison"><strong>Latest recorded before / after comparison</strong><p><span>Before remediation</span>{latestRun.beforeState}</p><p><span>After remediation</span>{latestRun.afterState}</p><p><span>Outcome</span>{latestRun.outcome.toUpperCase()} · {latestRun.runType} · recorded by {latestRun.recordedBy} on {latestRun.recordedAt}</p><p><span>Summary</span>{latestRun.summary}</p><p><span>Evidence reference</span>{latestRun.evidence}</p>{latestRun.measurementSourceEvaluation && <p><span>Measurement source traceability</span>{latestRun.measurementSourceEvaluation.status} · {latestRun.measurementSourceEvaluation.linkedCount} linked, {latestRun.measurementSourceEvaluation.unlinkedCount} unlinked, {latestRun.measurementSourceEvaluation.incompleteCount} incomplete, {latestRun.measurementSourceEvaluation.mismatchCount} inconsistent.</p>}{latestRun.reviewerVerifiedAt && <p><span>Reviewer confirmation</span>{latestRun.reviewerVerifiedBy} · {latestRun.reviewerVerifiedAt}: {latestRun.verificationRationale}</p>}{latestRun.verificationSupersededAt && <p><span>Superseded</span>{latestRun.verificationSupersededAt}: {latestRun.verificationSupersededReason}</p>}</div>}
                        <div className="sim-review-finding-fields sim-remediation-verification-fields">
                          <label><span>Verification method</span><select value={verificationDraft.runType} disabled={!canEdit} onChange={(event) => changeVerificationDraft("runType", event.target.value)}>{REMEDIATION_VERIFICATION_RUN_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                          <label><span>Run outcome</span><select value={verificationDraft.outcome} disabled={!canEdit} onChange={(event) => changeVerificationDraft("outcome", event.target.value)}>{REMEDIATION_VERIFICATION_OUTCOME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                          <label><span>Before remediation</span><textarea maxLength={1000} rows={2} value={verificationDraft.beforeState} disabled={!canEdit} placeholder="Observed behavior before the fix" onChange={(event) => changeVerificationDraft("beforeState", event.target.value)} /></label>
                          <label><span>After remediation</span><textarea maxLength={1000} rows={2} value={verificationDraft.afterState} disabled={!canEdit} placeholder="Observed behavior in this verification run" onChange={(event) => changeVerificationDraft("afterState", event.target.value)} /></label>
                          <label><span>Run summary</span><textarea maxLength={1600} rows={2} value={verificationDraft.summary} disabled={!canEdit} placeholder="What was tested and what the result means" onChange={(event) => changeVerificationDraft("summary", event.target.value)} /></label>
                          <label><span>Verification evidence reference</span><input maxLength={1200} value={verificationDraft.evidence} disabled={!canEdit} placeholder="Distinct test run, report, or monitoring reference" onChange={(event) => changeVerificationDraft("evidence", event.target.value)} /></label>
                          <label><span>Recorded by</span><input maxLength={120} value={verificationDraft.recordedBy} disabled={!canEdit} placeholder="Person who ran or recorded the test" onChange={(event) => changeVerificationDraft("recordedBy", event.target.value)} /></label>
                        </div>
                        <div className="sim-remediation-measurements">
                          <strong>Numeric before / after measurements</strong>
                          <p>Enter values using the same metric units for both observations. Only metrics with saved acceptance targets affect the quantitative result.</p>
                          {acceptanceMetrics.map((metric) => <div className="sim-remediation-measurement-group" key={metric.key}>
                            <div className="sim-remediation-measurement-row"><strong>{metric.label} ({metric.unit})</strong><label><span>Before</span><input aria-label={`${metric.label} before measurement`} type="number" min={metric.min} max={Number.isFinite(metric.max) ? metric.max : undefined} step="any" value={verificationDraft.measurements?.[metric.key]?.before ?? ""} disabled={!canEdit} onChange={(event) => changeVerificationMeasurement(metric.key, "before", event.target.value)} /></label><label><span>After</span><input aria-label={`${metric.label} after measurement`} type="number" min={metric.min} max={Number.isFinite(metric.max) ? metric.max : undefined} step="any" value={verificationDraft.measurements?.[metric.key]?.after ?? ""} disabled={!canEdit} onChange={(event) => changeVerificationMeasurement(metric.key, "after", event.target.value)} /></label></div>
                            <div className="sim-remediation-source-mappings">{["before", "after"].map((side) => {
                              const sourceDraft = verificationDraft.measurementSources?.[metric.key]?.[side] || {};
                              const preview = measurementSourcePreview.items.find((item) => item.key === metric.key && item.side === side);
                              const chosenRecord = loadTestRecords.find((record) => record.id === sourceDraft.sourceRecordId) || null;
                              const loadMetric = chosenRecord ? getLoadTestSourceMetric(chosenRecord, metric.key) : null;
                              return <div className={`sim-remediation-source-mapping is-${preview?.state || "unlinked"}`} key={side}>
                                <strong>{side === "before" ? "Before" : "After"} source</strong>
                                <label><span>Origin type</span><select aria-label={`${metric.label} ${side} source type`} value={sourceDraft.sourceType || ""} disabled={!canEdit} onChange={(event) => setVerificationMeasurementSourceType(metric.key, side, event.target.value)}><option value="">Unlinked</option>{REMEDIATION_MEASUREMENT_SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                                {sourceDraft.sourceType === "load-test-record" ? <label><span>Saved load-test record</span><select aria-label={`${metric.label} ${side} source load-test record`} value={sourceDraft.sourceRecordId || ""} disabled={!canEdit} onChange={(event) => changeVerificationMeasurementSource(metric.key, side, "sourceRecordId", event.target.value)}><option value="">Select record</option>{loadTestRecords.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.testedAt} · {record.targetEnvironment}</option>)}</select></label> : null}
                                {["report-field", "evidence-reference"].includes(sourceDraft.sourceType) && <>
                                  <label><span>{sourceDraft.sourceType === "report-field" ? "Report name / reference" : "Evidence reference"}</span><input maxLength={1200} value={sourceDraft.evidenceReference || ""} disabled={!canEdit} placeholder={sourceDraft.sourceType === "report-field" ? "Performance report ID or name" : "URL, ticket, report, or artifact ID"} onChange={(event) => changeVerificationMeasurementSource(metric.key, side, "evidenceReference", event.target.value)} /></label>
                                  <label><span>Source field path</span><input maxLength={240} value={sourceDraft.sourceField || ""} disabled={!canEdit} placeholder="metrics.p95LatencyMs" onChange={(event) => changeVerificationMeasurementSource(metric.key, side, "sourceField", event.target.value)} /></label>
                                  <label><span>Numeric value in source</span><input type="number" min={metric.min} max={Number.isFinite(metric.max) ? metric.max : undefined} step="any" value={sourceDraft.sourceValue ?? ""} disabled={!canEdit} onChange={(event) => changeVerificationMeasurementSource(metric.key, side, "sourceValue", event.target.value)} /></label>
                                </>}
                                {sourceDraft.sourceType === "load-test-record" && <small>{chosenRecord ? loadMetric ? `Field ${loadMetric.fieldPath}${loadMetric.transformation ? ` · derived as ${loadMetric.transformation}` : ""} = ${loadMetric.value} ${metric.unit}; compare it with the measurement above.` : `Record does not include a usable source field for ${metric.label}.` : "Select a saved record to snapshot its actual source field and numeric value."}</small>}
                                <small className={`sim-remediation-source-state is-${preview?.state || "unlinked"}`}>Mapping: {(preview?.state || "unlinked").replaceAll("-", " ").toUpperCase()} — {preview?.detail || "No source mapping selected."}</small>
                              </div>;
                            })}</div>
                          </div>)}
                          <p className={`sim-remediation-source-summary is-${measurementSourcePreview.status}`}><strong>Source traceability: {measurementSourcePreview.status.toUpperCase()}</strong> — {measurementSourcePreview.reason} Numeric acceptance results do not independently verify source authenticity.</p>
                        </div>
                        {effectiveness.measurementSourceEvaluation?.measurementCount > 0 && effectiveness.measurementSourceEvaluation.status !== "complete" && <p className="sim-remediation-source-warning">Latest numeric evidence cannot support reviewer confirmation until every supplied before/after value has a matching source field and value. Record a new run after correcting the mapping.</p>}
                        <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => saveRemediationVerificationRun(finding.id)}>Record verification run</button>
                        {canConfirmLatestRun && <div className="sim-remediation-confirmation">
                          <strong>Passing run needs explicit reviewer confirmation</strong>
                          <div className="sim-review-finding-fields">
                            <label><span>Reviewer</span><input maxLength={120} value={verificationDraft.verifiedBy} disabled={!canEdit} placeholder="Reviewer confirming effectiveness" onChange={(event) => changeVerificationDraft("verifiedBy", event.target.value)} /></label>
                            <label><span>Verification rationale</span><textarea maxLength={1200} rows={2} value={verificationDraft.verificationRationale} disabled={!canEdit} placeholder="Why does this run establish the remediation is effective?" onChange={(event) => changeVerificationDraft("verificationRationale", event.target.value)} /></label>
                          </div>
                          <button type="button" className="workbench-primary" disabled={!canEdit} onClick={() => confirmFindingRemediationVerification(finding.id, latestRun.id)}>Confirm remediation verified</button>
                        </div>}
                        {effectiveness.runs.length > 0 && <details className="sim-remediation-verification-history"><summary>Verification history ({effectiveness.runs.length} run{effectiveness.runs.length === 1 ? "" : "s"})</summary><ol>{effectiveness.runs.slice().reverse().map((run) => <li key={run.id}><strong>{run.outcome.toUpperCase()} · {run.runType}</strong><small>{run.recordedAt} · {run.recordedBy}</small><p>Before: {run.beforeState}</p><p>After: {run.afterState}</p><p>Summary: {run.summary}</p><p>Evidence: {run.evidence}</p>{Object.keys(run.acceptanceCriteriaSnapshot || {}).length > 0 && <p>Quantitative criteria: {run.acceptanceEvaluation.status} · {run.acceptanceEvaluation.passedCount} passed, {run.acceptanceEvaluation.failedCount} failed, {run.acceptanceEvaluation.unevaluatedCount} unevaluated.</p>}{Object.entries(run.measurements || {}).some(([, values]) => values.before !== null || values.after !== null) && <p>Measurements: {Object.entries(run.measurements).filter(([, values]) => values.before !== null || values.after !== null).map(([metric, values]) => `${metric} ${values.before ?? "n/a"} → ${values.after ?? "n/a"}`).join("; ")}</p>}{run.measurementSourceEvaluation && <p>Source traceability: {run.measurementSourceEvaluation.status} · {run.measurementSourceEvaluation.linkedCount} linked, {run.measurementSourceEvaluation.unlinkedCount} unlinked, {run.measurementSourceEvaluation.incompleteCount} incomplete, {run.measurementSourceEvaluation.mismatchCount} inconsistent.</p>}{(() => { const drift = evaluateRemediationMeasurementSourceDrift(run.measurementSources, loadTestRecords); return !["not-evaluated", "not-applicable"].includes(drift.status) ? <p>Current source drift: {drift.status} — {drift.reason}. Original snapshot remains unchanged.</p> : null; })()}{Object.entries(run.measurementSources || {}).flatMap(([metric, sides]) => ["before", "after"].filter((side) => sides[side]?.sourceType).map((side) => <p key={`${metric}-${side}`}>{metric} {side} source: {sides[side].sourceType}; {sides[side].sourceField || "field missing"}; value {sides[side].sourceValue ?? "n/a"}; reference {sides[side].evidenceReference || sides[side].sourceRecordId || "missing"}.</p>))}{run.reviewerVerifiedAt && <p>Reviewer-confirmed by {run.reviewerVerifiedBy} on {run.reviewerVerifiedAt}: {run.verificationRationale}</p>}{run.verificationSupersededAt && <p>Historical only; superseded {run.verificationSupersededAt}: {run.verificationSupersededReason}</p>}</li>)}</ol></details>}
                      </section>;
                    })()}
                    <div className="sim-review-finding-fields">
                      <label><span>Owner</span><input maxLength={120} value={draft.owner ?? finding.owner} disabled={!canEdit} placeholder="Person responsible" onChange={(event) => setReviewFindingDrafts((current) => ({ ...current, [key]: { ...(current[key] || finding), owner: event.target.value } }))} /></label>
                      <label><span>Disposition</span><select value={draft.status ?? finding.status} disabled={!canEdit} onChange={(event) => setReviewFindingDrafts((current) => ({ ...current, [key]: { ...(current[key] || finding), status: event.target.value } }))}>{REVIEW_FINDING_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label><span>Rationale</span><textarea maxLength={1600} rows={2} value={draft.rationale ?? finding.rationale} disabled={!canEdit} placeholder="Why is this accepted risk or considered resolved?" onChange={(event) => setReviewFindingDrafts((current) => ({ ...current, [key]: { ...(current[key] || finding), rationale: event.target.value } }))} /></label>
                      <label><span>Supporting evidence / reference</span><textarea maxLength={1200} rows={2} value={draft.evidence ?? finding.evidence} disabled={!canEdit} placeholder={finding.freshEvidenceRequired ? "Required: fresh evidence from after this recurrence" : "Test run, ticket, log, report, or remediation reference"} onChange={(event) => setReviewFindingDrafts((current) => ({ ...current, [key]: { ...(current[key] || finding), evidence: event.target.value } }))} /></label>
                    </div>
                    <button type="button" className="workbench-secondary" disabled={!canEdit} onClick={() => saveTrackedReviewFinding(finding.id)}>Save finding</button>
                    {finding.auditTrail.length > 0 && <details className="sim-review-finding-history"><summary>Finding audit trail ({finding.auditTrail.length})</summary>{finding.auditTrail.slice().reverse().map((event) => <p key={event.id}><span>{event.at}</span> — {event.message}</p>)}</details>}
                  </article>;
                })}
              </div>}
              <p className="sim-rollout-readiness-disclaimer">Finding dispositions are reviewer-maintained records. They do not independently verify evidence authenticity or grant production approval.</p>
            </section>;
          })()}
          <div className="sim-decision-record-actions"><button type="button" className="workbench-primary" disabled={!canEdit} onClick={saveDecisionRecordDraft}>Save record changes</button><button type="button" className="workbench-secondary" onClick={() => downloadArchitectureDecisionRecord(selectedDecisionRecord, loadTestRecords)}>Export decision record (.md)</button><button type="button" className="workbench-secondary" onClick={() => {
            try { downloadReleaseEvidenceBundle(selectedDecisionRecord, loadTestRecords); setDecisionRecordActionError(""); }
            catch (error) { setDecisionRecordActionError(error?.message || "Could not build the release evidence bundle."); }
          }}>Export release evidence bundle (.json)</button></div>
          <p className="sim-rollout-readiness-disclaimer">The bundle includes the saved decision, simulation comparison, load-test records, validation gates, rollout attestations, readiness assessments and outstanding risks. Machine-derived checks, user-supplied measurements and manual attestations are labeled separately; external references are not independently verified.</p>
          <div className="sim-decision-record-audit"><strong>Audit trail</strong>{(selectedDecisionRecord.auditTrail || []).slice().reverse().map((event) => <p key={event.id}><span>{event.at}</span> — {event.message}</p>)}</div>
        </div>}
        <small>Decision records are stored in the current document, capped at 50 records. Tracked release findings are saved with owners, dispositions, rationales, supporting references, and per-finding audit trails.</small>
      </section>
    </details>}
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
          {optimizationRecommendations.length > 0 && <div className="sim-optimization-recommendations" aria-label="Evidence-guided optimization recommendations">
            <div className="workbench-section-heading"><span>RECOMMENDED NEXT EXPERIMENTS</span><span className="workbench-count">{optimizationRecommendations.length}</span></div>
            <p>Ranked from this scenario's recorded synthetic component metrics and the model's eligible assumptions. These are hypotheses to test, not automatic production fixes.</p>
            {optimizationRecommendations.map((recommendation) => <article className="sim-optimization-recommendation" key={recommendation.id}>
              <div className="sim-optimization-recommendation-copy"><strong>{recommendation.rank}. {recommendation.label}</strong><small>{recommendation.reason}</small></div>
              <button type="button" className="workbench-secondary" disabled={!canEdit || unsaved || staleModel || !capacityScenarioKey} onClick={() => runImprovementExperiment(recommendation.interventionKind, recommendation)}>Run experiment</button>
            </article>)}
          </div>}
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
          {buildOptimizationPortfolio(optimizationPortfolioTrials).length > 0 && <section className="sim-optimization-portfolio" aria-label="Optimization portfolio and trade-off analysis">
            <div className="workbench-section-heading"><span>OPTIMIZATION PORTFOLIO</span><span className="workbench-count">{optimizationPortfolioTrials.length}</span></div>
            <p>Ranked across completed controlled trials in this panel session. The directional score equally averages available relative changes for successful throughput, p95 latency, dropped requests, and success rate. Positive is better; negative is worse. It is a comparison aid, not an SLO or production score.</p>
            <div className="sim-comparison-table-wrap"><table className="sim-comparison-table"><thead><tr><th>Rank / trial</th><th>Trade-off score</th><th>Throughput</th><th>p95 latency</th><th>Dropped requests</th><th>Failure-rate proxy Δ</th><th>Outcome</th></tr></thead><tbody>
              {buildOptimizationPortfolio(optimizationPortfolioTrials).map((trial) => <tr key={trial.id}><td><strong>#{trial.rank} {trial.label}</strong><small>{trial.scenarioLabel} · {trial.interventionKind}</small></td><td>{isFiniteNumber(trial.score) ? `${trial.score > 0 ? "+" : ""}${trial.score}%` : "—"}</td><td>{isFiniteNumber(trial.metrics.throughputDeltaPercent) ? `${trial.metrics.throughputDeltaPercent > 0 ? "+" : ""}${trial.metrics.throughputDeltaPercent}%` : "—"}</td><td>{isFiniteNumber(trial.metrics.p95LatencyDeltaPercent) ? `${trial.metrics.p95LatencyDeltaPercent > 0 ? "+" : ""}${trial.metrics.p95LatencyDeltaPercent}%` : "—"}</td><td>{isFiniteNumber(trial.metrics.droppedRequestsDeltaPercent) ? `${trial.metrics.droppedRequestsDeltaPercent > 0 ? "+" : ""}${trial.metrics.droppedRequestsDeltaPercent}%` : "—"}</td><td>{isFiniteNumber(trial.metrics.errorRateDeltaPercentagePoints) ? `${trial.metrics.errorRateDeltaPercentagePoints > 0 ? "+" : ""}${trial.metrics.errorRateDeltaPercentagePoints} pp` : "—"}</td><td>{trial.outcome}</td></tr>)}
            </tbody></table></div>
            <small>Failure-rate proxy is failed requests divided by the baseline offered-request count; it is not a validated service-level error-budget calculation. Missing metrics are shown as unavailable, not inferred.</small>
            <button type="button" className="workbench-secondary" onClick={() => setOptimizationPortfolioTrials([])}>Clear portfolio</button>
          </section>}
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
