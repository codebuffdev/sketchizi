import { useEffect, useMemo, useRef, useState } from "react";
import { runWorkbenchExperiments } from "../runWorkbenchExperiments.js";
import { getTypedRequestGuidance } from "./typedRequestGuidance.js";
import { partitionSimulationDiagnostics } from "./diagnosticPresentation.js";
import { deriveSimulationScope } from "../adapter/deriveSimulationScope.js";
import { appendSimulationHistory, createSimulationHistoryEntry, createSimulationModelSnapshot, restoreSimulationHistoryEntry, simulationResultsAreStale } from "./simulationHistory.js";
import {
  compareSimulationRuns,
  buildScenarioComparisonOverview,
  chooseCapacityImprovementScenarioKey,
  getCapacityPressureRows,
  createCapacityImprovementProfile,
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

function SimulationTrendChart({ title, points, series, unit }) {
  const allValues = series.flatMap((item) => points.map((point) => point[item.key])).filter(isFiniteNumber);
  const hasSamples = allValues.length > 0;
  const actualPeak = hasSamples ? Math.max(0, ...allValues) : null;
  const scaleMaximum = Math.max(1, actualPeak ?? 0);
  const chartHeight = 86;
  return <section className="sim-time-chart" aria-label={`${title} time series`}>
    <div className="sim-time-chart-heading"><strong>{title}</strong><small>{hasSamples ? `Peak ${formatDecimal(actualPeak)}${unit ? ` ${unit}` : ""}` : "No samples in this interval"}</small></div>
    <div className="sim-time-chart-legend">{series.map((item) => <span key={item.key}><i className={item.className} aria-hidden="true"/>{item.label}</span>)}</div>
    <svg className="sim-time-chart-svg" viewBox={`0 0 320 ${chartHeight}`} role="img" aria-label={`${title}; ${points.length} event-derived time buckets`}>
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

function SimulationTimeSeries({ run }) {
  const timeSeries = run?.result?.result?.timeSeries;
  const points = timeSeries?.points;
  if (!Array.isArray(points) || !points.length) return null;
  const drain = timeSeries.postWindowDrain || {};
  const drainTotal = (drain.successfulRequests || 0) + (drain.failedRequests || 0) + (drain.droppedRequests || 0);
  return <details className="sim-time-series">
    <summary><span>Performance over time</span><small>{points.length} event-derived intervals</small></summary>
    <p>Each point is calculated from simulated request-arrival and completion timestamps. Outcomes after the observation window are reported separately as drain results.</p>
    <SimulationTrendChart title="Offered load and successful throughput" points={points} unit="req/s" series={[
      { key: "offeredRps", label: "Offered", className: "series-offered" },
      { key: "successfulRps", label: "Succeeded", className: "series-success" },
    ]}/>
    <SimulationTrendChart title="Successful p95 latency" points={points} unit="ms" series={[
      { key: "latencyP95Ms", label: "p95 latency", className: "series-latency" },
    ]}/>
    <SimulationTrendChart title="Failures and capacity drops" points={points} unit="requests" series={[
      { key: "failedRequests", label: "Failed", className: "series-failed" },
      { key: "droppedRequests", label: "Dropped", className: "series-dropped" },
    ]}/>
    {drainTotal > 0 && <p className="sim-time-drain-note">After-window drain: {formatInteger(drain.successfulRequests || 0)} succeeded, {formatInteger(drain.failedRequests || 0)} failed, {formatInteger(drain.droppedRequests || 0)} dropped while already offered work finished. These outcomes are included in aggregate totals but not plotted inside the observation window.</p>}
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

export default function SimulationExperimentPanel({ workbench, simulationProfile, onUpdateSimulationProfile, simulationHistory = [], onUpdateSimulationHistory, onCreateTypedRelation, onFocusEntity, visibleEntityIds = null, activeViewId = "system", onSwitchView, onSwitchToAdd, canEdit = true }) {
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
  const [draftProfile, setDraftProfile] = useState(simulationProfile ? deepClone(simulationProfile) : null);
  const draftProfileRef = useRef(draftProfile);
  draftProfileRef.current = draftProfile;
  const [acknowledged, setAcknowledged] = useState(() => profileIsConfirmed(profileForEntityIds(simulationProfile, simulationScope.entityIds)));
  const [results, setResults] = useState(null);
  const [activeRunKey, setActiveRunKey] = useState("baseline");
  const [profileError, setProfileError] = useState("");
  const [runError, setRunError] = useState("");
  const [improvementResult, setImprovementResult] = useState(null);
  const [improvementError, setImprovementError] = useState("");
  const [profileEditorOpen, setProfileEditorOpen] = useState(true);
  const [showAllExplanations, setShowAllExplanations] = useState(false);
  const [trafficMultiplier, setTrafficMultiplier] = useState(5);

  useEffect(() => {
    // The controller may clone Workbench metadata after an autosave or an unrelated
    // model update. If profile values are unchanged, preserve current results and
    // run-local assumption acknowledgement; modelRevision still marks stale results.
    if (profileIsSame(draftProfileRef.current, simulationProfile)) return;
    const next = simulationProfile ? deepClone(simulationProfile) : null;
    setDraftProfile(next);
    setAcknowledged(profileIsConfirmed(profileForEntityIds(next, simulationScope.entityIds)));
    setResults(null); setImprovementResult(null); setImprovementError("");
    setProfileError("");
    setRunError("");
  }, [simulationProfile, effectiveScopeSignature, scopeSignature]);

  // Changing the active-view scope requires reviewing that scope's assumptions
  // again. Saved history remains available and is marked stale where appropriate.
  useEffect(() => {
    setAcknowledged(false);
    setResults(null); setImprovementResult(null); setImprovementError("");
    setRunError("");
  }, [effectiveScopeSignature]);

  // Typed relationships alter the compiled request topology even when the
  // active-view placement set and profile values stay the same. Clear results
  // from the previous model revision and require fresh assumption review.
  const modelRevision = workbench?.modelRevision ?? null;
  useEffect(() => {
    setResults(null); setImprovementResult(null); setImprovementError("");
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

  const prepareProfile = () => {
    try {
      const profile = createIllustrativeSimulationProfile(simulationScope.scoped ? simulationScope.workbench : workbench);
      setDraftProfile(profile);
      setProfileEditorOpen(true);
      setAcknowledged(false);
      setResults(null); setImprovementResult(null); setImprovementError("");
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
      setResults(null); setImprovementResult(null); setImprovementError("");
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
    setResults(null); setImprovementResult(null); setImprovementError("");
    onUpdateSimulationProfile?.(next);
    setProfileError("");
  };
  const runExperiments = () => {
    setImprovementResult(null);
    setImprovementError("");
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

  const runCapacityImprovement = () => {
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
        throw new Error("No completed load scenario is available for a capacity comparison. Run the baseline and traffic-surge scenarios first.");
      }
      const pressureRows = getCapacityPressureRows(originalScenario);
      const improvement = createCapacityImprovementProfile({
        profile: draftProfile,
        workbench,
        scopeEntityIds: simulationScope.entityIds,
        componentRows: pressureRows,
      });
      const suite = runWorkbenchExperiments({ workbench, simulationProfile: improvement.profile, trafficMultiplier: results.trafficMultiplier ?? trafficMultiplier, scopeEntityIds: scopeSeeds ?? undefined });
      const improvedScenario = suite.runs?.[comparisonScenarioKey];
      if (improvedScenario?.result?.status !== "completed") {
        const blocking = (improvedScenario?.result?.diagnostics || suite.diagnostics || []).filter((item) => item.severity === "blocker").map((item) => item.message || item.title);
        throw new Error(blocking[0] || `The improved ${originalScenario.label || comparisonScenarioKey} scenario did not complete.`);
      }
      const comparisonResult = compareSimulationRuns(originalScenario.result, improvedScenario.result);
      if (comparisonResult.status !== "ready") throw new Error(comparisonResult.reason || "The improved scenario could not be compared against the same original scenario.");

      const displayImprovement = {
        ...improvement,
        comparison: comparisonResult,
        comparisonScenarioKey,
        comparisonScenarioLabel: originalScenario.label || comparisonScenarioKey,
        baselineRunFingerprint: results.runs?.baseline?.result?.result?.simulation?.runFingerprint || null,
        comparisonRunFingerprint: originalScenario.result?.result?.simulation?.runFingerprint || null,
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
          title: improvement.label,
          changedEntityId: improvement.entityId,
          field: improvement.field,
          comparisonScenarioKey,
          comparisonScenarioLabel: originalScenario.label || comparisonScenarioKey,
          comparisonRunFingerprint: originalScenario.result?.result?.simulation?.runFingerprint || null,
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
          <label><span>Observation window (seconds)</span><input type="number" min="1" max="3600" value={(draftProfile.defaultScenario?.durationMs || 15000) / 1000} disabled={!canEdit} onChange={(event) => { const next = deepClone(draftProfile); next.defaultScenario ||= {}; next.defaultScenario.durationMs = Math.round(Number(event.target.value) * 1000); next.profileKind = "illustrative-synthetic"; setDraftProfile(next); setAcknowledged(false); setResults(null); setImprovementResult(null); setImprovementError(""); }} /></label>
          <label><span>Random seed</span><input type="number" step="1" value={draftProfile.defaultScenario?.seed ?? 211} disabled={!canEdit} onChange={(event) => { const next = deepClone(draftProfile); next.defaultScenario ||= {}; next.defaultScenario.seed = Number(event.target.value); next.profileKind = "illustrative-synthetic"; setDraftProfile(next); setAcknowledged(false); setResults(null); setImprovementResult(null); setImprovementError(""); }} /></label>
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
                setResults(null); setImprovementResult(null); setImprovementError("");
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
          <p>Tests a higher concurrency assumption on the highest-pressure component from the selected scenario. If Baseline is selected, Sketchizi picks the most pressured completed load scenario (normally {results.runs?.trafficSurge?.label || "the traffic-surge scenario"}). Outage runs are excluded because adding capacity cannot restore an unavailable dependency.</p>
          {capacityScenario && <p className="sim-capacity-target">Comparison target: <strong>{capacityScenario.label}</strong>. The before/after comparison reruns this same scenario with the same seed, duration, model, and traffic multiplier.</p>}
          <button type="button" className="workbench-secondary" disabled={!canEdit || unsaved || staleModel || !capacityScenarioKey} onClick={runCapacityImprovement}>Test a capacity improvement</button>
          {improvementError && <p className="workbench-inspector-error" role="alert">{improvementError}</p>}
          {improvementResult && <div className="sim-improvement-result" role="status">
            <strong>{improvementResult.label}</strong>
            <p>Concurrency changed from {improvementResult.before} to {improvementResult.after} for this experiment only.</p>
            <p className="sim-capacity-target">Compared under <strong>{improvementResult.comparisonScenarioLabel}</strong>, not against an unstressed baseline.</p>
            <div className="sim-improvement-metrics"><div><span>Success rate</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "successRate"))}</strong></div><div><span>Throughput (req/sec)</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "throughputRps"))}</strong></div><div><span>p95 latency (ms)</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "p95LatencyMs"))}</strong></div><div><span>Dropped requests</span><strong>{compareValue(improvementResult.comparison.metrics.find((item) => item.key === "droppedRequests"))}</strong></div></div>
            <small>Original scenario → improved version of that same scenario. These are synthetic model outputs, not production measurements. The trial was added to Saved experiment history.</small>
          </div>}
        </section>}
        {results.status === "partial" && <p className="sim-profile-warning">One or more scenarios were blocked. Completed scenarios remain available below.</p>}
        <div className="sim-run-tabs" role="tablist" aria-label="Simulation scenarios">
          {Object.entries(results.runs).map(([key, run]) => <button type="button" role="tab" aria-selected={activeRunKey === key} className={activeRunKey === key ? "active" : ""} key={key} onClick={() => setActiveRunKey(key)}>{run.label}</button>)}
        </div>
        {activeRun?.result?.status === "completed" ? <>
          <RunMetrics run={activeRun} />
          <SimulationTimeSeries run={activeRun} />
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
