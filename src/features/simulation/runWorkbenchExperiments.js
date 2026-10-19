import { buildSimulationProjection } from "./adapter/buildSimulationProjection.js";
import { runSimulation, SIMULATION_ENGINE_VERSION } from "./engine/runSimulation.js";
import { explainSimulationRun } from "./experiments/simulationExperimentModel.js";

/**
 * The single orchestration path used by the Workbench UI and automated tests.
 * Sketchizi's engineering model remains canonical; this service compiles it to
 * engine-neutral SimIR, then runs only scenarios supported by the current engine.
 *
 * Results are synthetic model outputs, never live-system measurements.
 */
export const WORKBENCH_SIMULATION_RUNNER_VERSION = "0.1.0";

const RUNTIME_CANDIDATE_KINDS = [
  "data.postgresql-database",
  "backend.rest-service",
  "integrations.external-api",
];

/**
 * Run a deterministic offered-load sweep against one compiled model/profile.
 * This is a synthetic what-if analysis, not a prediction of live capacity.
 */
export function runTrafficSweep({
  workbench,
  simulationProfile,
  multipliers = [1, 2, 3, 5, 8, 10],
  maxP95LatencyMs,
  maxErrorRatePercent,
  limits,
  scopeEntityIds,
} = {}) {
  const projection = buildSimulationProjection({ workbench, simulationProfile, scopeEntityIds });
  const diagnostics = [...(projection.diagnostics || [])];
  const provenance = {
    modelRevision: workbench?.modelRevision ?? null,
    modelFingerprint: projection.provenance?.sourceModelFingerprint || null,
    profileFingerprint: projection.provenance?.simulationProfileFingerprint || null,
    adapterVersion: projection.provenance?.adapterVersion || "unknown",
    engineVersion: SIMULATION_ENGINE_VERSION,
    scopeEntityIds: projection.provenance?.scopeEntityIds || null,
  };
  if (projection.status !== "ready") return { status: "blocked", projection, diagnostics, provenance, points: [] };
  if (!Array.isArray(multipliers) || multipliers.length < 2 || multipliers.some((value) => !Number.isFinite(value) || value <= 0) || new Set(multipliers).size !== multipliers.length) {
    return { status: "blocked", projection, diagnostics: [...diagnostics, { code: "TRAFFIC-SWEEP-MULTIPLIERS-INVALID", severity: "blocker", title: "Invalid traffic sweep", message: "Traffic sweep multipliers must be at least two unique, finite, positive numbers.", entityIds: [], relationIds: [] }], provenance, points: [] };
  }
  const hasLatencyTarget = Number.isFinite(maxP95LatencyMs) && maxP95LatencyMs > 0;
  const hasErrorTarget = Number.isFinite(maxErrorRatePercent) && maxErrorRatePercent >= 0 && maxErrorRatePercent <= 100;
  const hasTargets = hasLatencyTarget && hasErrorTarget;
  const points = [...multipliers].sort((a, b) => a - b).map((multiplier) => {
    const scenarioOverrides = multiplier === 1 ? {} : { trafficMultiplier: multiplier };
    const result = runSimulation({ projection, scenarioOverrides, limits });
    const metrics = result?.result?.metrics;
    const offered = metrics?.offeredRequests;
    const failedRatePercent = Number.isFinite(offered) && offered > 0 && Number.isFinite(metrics?.failedRequests)
      ? (metrics.failedRequests / offered) * 100 : null;
    const p95LatencyMs = metrics?.successfulLatencyMs?.p95 ?? null;
    const meetsSlo = hasTargets && result.status === "completed"
      && Number.isFinite(p95LatencyMs) && Number.isFinite(failedRatePercent)
      && p95LatencyMs <= maxP95LatencyMs && failedRatePercent <= maxErrorRatePercent;
    return {
      multiplier,
      label: multiplier === 1 ? "Baseline (1×)" : `${multiplier}× traffic`,
      status: result.status,
      result,
      metrics: metrics || null,
      p95LatencyMs,
      failedRatePercent,
      sloStatus: !hasTargets ? "targets-not-set" : result.status !== "completed" ? "not-evaluated" : meetsSlo ? "pass" : "fail",
    };
  });
  const evaluated = points.filter((point) => point.sloStatus === "pass" || point.sloStatus === "fail");
  const firstFailure = evaluated.find((point) => point.sloStatus === "fail") || null;
  const lastPassBeforeFailure = firstFailure
    ? [...evaluated].filter((point) => point.multiplier < firstFailure.multiplier && point.sloStatus === "pass").at(-1) || null
    : [...evaluated].filter((point) => point.sloStatus === "pass").at(-1) || null;
  return {
    status: points.every((point) => point.status === "completed") ? "completed" : points.some((point) => point.status === "completed") ? "partial" : "blocked",
    projection,
    diagnostics,
    provenance,
    targets: hasTargets ? { maxP95LatencyMs, maxErrorRatePercent } : null,
    points,
    firstFailureMultiplier: firstFailure?.multiplier ?? null,
    lastPassingMultiplier: lastPassBeforeFailure?.multiplier ?? null,
    interpretation: !hasTargets
      ? "Set both SLO targets to classify modeled points. Results are synthetic and do not establish live-system capacity."
      : firstFailure
        ? `First sampled SLO failure occurred at ${firstFailure.multiplier}×. The preceding passing sample is ${lastPassBeforeFailure ? `${lastPassBeforeFailure.multiplier}×` : "not available"}; the actual failure threshold lies somewhere between tested points and has not been measured.`
        : "No sampled point failed both configured SLO checks. This does not prove untested load levels or production capacity are safe.",
  };
}

/**
 * Run a deterministic single-component outage matrix over runtime nodes in the
 * compiled request path. Each scenario is compared with the same baseline.
 * Outputs are synthetic what-if results, not live resilience guarantees.
 */
export function runResilienceMatrix({
  workbench,
  simulationProfile,
  trafficMultiplier = 1,
  limits,
  scopeEntityIds,
} = {}) {
  const projection = buildSimulationProjection({ workbench, simulationProfile, scopeEntityIds });
  const diagnostics = [...(projection.diagnostics || [])];
  const provenance = {
    runnerVersion: WORKBENCH_SIMULATION_RUNNER_VERSION,
    modelRevision: workbench?.modelRevision ?? null,
    modelFingerprint: projection.provenance?.sourceModelFingerprint || null,
    profileFingerprint: projection.provenance?.simulationProfileFingerprint || null,
    scopeEntityIds: projection.provenance?.scopeEntityIds || null,
    adapterVersion: projection.provenance?.adapterVersion || "unknown",
    engineVersion: SIMULATION_ENGINE_VERSION,
  };
  if (projection.status !== "ready") return { status: "blocked", projection, diagnostics, provenance, scenarios: [] };
  if (!Number.isFinite(trafficMultiplier) || trafficMultiplier <= 0) {
    return { status: "blocked", projection, diagnostics: [...diagnostics, { code: "RESILIENCE-MATRIX-TRAFFIC-INVALID", severity: "blocker", title: "Invalid resilience traffic level", message: "Traffic multiplier must be a finite number greater than zero.", entityIds: [], relationIds: [] }], provenance, scenarios: [] };
  }

  const candidates = (workbench?.entities || [])
    .filter((entity) => RUNTIME_CANDIDATE_KINDS.includes(entity.kind) && projection.nodeMap?.[entity.id])
    .map((entity) => ({ id: entity.id, name: entity.name || entity.id, kind: entity.kind }));
  if (!candidates.length) {
    return { status: "blocked", projection, diagnostics: [...diagnostics, { code: "RESILIENCE-MATRIX-NO-TARGETS", severity: "blocker", title: "No supported outage targets", message: "No REST service, PostgreSQL database, or external API in the compiled request path can be tested for an outage.", entityIds: [], relationIds: [] }], provenance, scenarios: [] };
  }

  const overrides = trafficMultiplier === 1 ? {} : { trafficMultiplier };
  const baseline = runSimulation({ projection, scenarioOverrides: overrides, limits });
  const metricsOf = (run) => {
    const metrics = run?.result?.metrics || null;
    const offered = metrics?.offeredRequests;
    const failedRatePercent = Number.isFinite(offered) && offered > 0 && Number.isFinite(metrics?.failedRequests)
      ? (metrics.failedRequests / offered) * 100 : null;
    return { metrics, failedRatePercent, p95LatencyMs: metrics?.successfulLatencyMs?.p95 ?? null };
  };
  const baselineMetrics = metricsOf(baseline);
  const scenarios = candidates.map((target) => {
    const result = runSimulation({
      projection,
      scenarioOverrides: { ...overrides, unavailableNodeIds: [target.id] },
      limits,
    });
    const observed = metricsOf(result);
    const baseThroughput = baselineMetrics.metrics?.throughputRps;
    const scenarioThroughput = observed.metrics?.throughputRps;
    const throughputLossPercent = Number.isFinite(baseThroughput) && baseThroughput > 0 && Number.isFinite(scenarioThroughput)
      ? ((baseThroughput - scenarioThroughput) / baseThroughput) * 100 : null;
    const errorRateDeltaPercent = Number.isFinite(baselineMetrics.failedRatePercent) && Number.isFinite(observed.failedRatePercent)
      ? observed.failedRatePercent - baselineMetrics.failedRatePercent : null;
    const latencyDeltaPercent = Number.isFinite(baselineMetrics.p95LatencyMs) && baselineMetrics.p95LatencyMs > 0 && Number.isFinite(observed.p95LatencyMs)
      ? ((observed.p95LatencyMs - baselineMetrics.p95LatencyMs) / baselineMetrics.p95LatencyMs) * 100 : null;
    return {
      ...target,
      status: result.status,
      result,
      metrics: observed.metrics,
      failedRatePercent: observed.failedRatePercent,
      p95LatencyMs: observed.p95LatencyMs,
      throughputLossPercent,
      errorRateDeltaPercent,
      latencyDeltaPercent,
      impactScore: Number.isFinite(throughputLossPercent) ? throughputLossPercent : null,
    };
  }).sort((a, b) => {
    if (a.status !== "completed" && b.status === "completed") return 1;
    if (b.status !== "completed" && a.status === "completed") return -1;
    return (b.impactScore ?? -Infinity) - (a.impactScore ?? -Infinity) || a.name.localeCompare(b.name);
  });

  return {
    status: baseline.status === "completed" && scenarios.every((scenario) => scenario.status === "completed") ? "completed" : scenarios.some((scenario) => scenario.status === "completed") ? "partial" : "blocked",
    projection,
    diagnostics,
    provenance,
    trafficMultiplier,
    baseline: { status: baseline.status, result: baseline, ...baselineMetrics },
    scenarios,
    interpretation: "Scenarios represent one modeled component unavailable at a time. Ranked impact is based on modeled throughput loss where available; results are synthetic and do not establish real-world fault tolerance.",
  };
}

/**
 * Run pairwise component-outage experiments and compare each pair with the
 * stronger individual outage. This exposes modeled interaction effects without
 * assuming automatic recovery, failover, or real infrastructure behavior.
 */
export function runFailureChainMatrix({
  workbench,
  simulationProfile,
  trafficMultiplier = 1,
  limits,
  scopeEntityIds,
  maxPairs = 45,
} = {}) {
  const projection = buildSimulationProjection({ workbench, simulationProfile, scopeEntityIds });
  const diagnostics = [...(projection.diagnostics || [])];
  const provenance = {
    runnerVersion: WORKBENCH_SIMULATION_RUNNER_VERSION,
    modelRevision: workbench?.modelRevision ?? null,
    modelFingerprint: projection.provenance?.sourceModelFingerprint || null,
    profileFingerprint: projection.provenance?.simulationProfileFingerprint || null,
    scopeEntityIds: projection.provenance?.scopeEntityIds || null,
    adapterVersion: projection.provenance?.adapterVersion || "unknown",
    engineVersion: SIMULATION_ENGINE_VERSION,
  };
  const blocked = (code, title, message) => ({
    status: "blocked", projection, diagnostics: [...diagnostics, { code, severity: "blocker", title, message, entityIds: [], relationIds: [] }], provenance, scenarios: [], individualScenarios: [],
  });
  if (projection.status !== "ready") return { status: "blocked", projection, diagnostics, provenance, scenarios: [], individualScenarios: [] };
  if (!Number.isFinite(trafficMultiplier) || trafficMultiplier <= 0) {
    return blocked("FAILURE-CHAIN-TRAFFIC-INVALID", "Invalid failure-chain traffic level", "Traffic multiplier must be a finite number greater than zero.");
  }
  if (!Number.isInteger(maxPairs) || maxPairs < 1) {
    return blocked("FAILURE-CHAIN-PAIR-LIMIT-INVALID", "Invalid failure-chain pair limit", "Maximum pair count must be a positive integer.");
  }
  const candidates = (workbench?.entities || [])
    .filter((entity) => RUNTIME_CANDIDATE_KINDS.includes(entity.kind) && projection.nodeMap?.[entity.id])
    .map((entity) => ({ id: entity.id, name: entity.name || entity.id, kind: entity.kind }));
  if (candidates.length < 2) {
    return blocked("FAILURE-CHAIN-NEEDS-TWO-TARGETS", "Two outage targets are required", "At least two supported runtime components must be present in the compiled request path to compare combined outages.");
  }
  const overrides = trafficMultiplier === 1 ? {} : { trafficMultiplier };
  const baseline = runSimulation({ projection, scenarioOverrides: overrides, limits });
  const metricsOf = (run) => {
    const metrics = run?.result?.metrics || null;
    const offered = metrics?.offeredRequests;
    const failedRatePercent = Number.isFinite(offered) && offered > 0 && Number.isFinite(metrics?.failedRequests)
      ? (metrics.failedRequests / offered) * 100 : null;
    return { metrics, failedRatePercent, p95LatencyMs: metrics?.successfulLatencyMs?.p95 ?? null };
  };
  const baselineObserved = metricsOf(baseline);
  const measure = (targets) => {
    const result = runSimulation({ projection, scenarioOverrides: { ...overrides, unavailableNodeIds: targets.map((target) => target.id) }, limits });
    const observed = metricsOf(result);
    const baseThroughput = baselineObserved.metrics?.throughputRps;
    const throughput = observed.metrics?.throughputRps;
    return {
      status: result.status,
      result,
      metrics: observed.metrics,
      failedRatePercent: observed.failedRatePercent,
      p95LatencyMs: observed.p95LatencyMs,
      throughputLossPercent: Number.isFinite(baseThroughput) && baseThroughput > 0 && Number.isFinite(throughput)
        ? ((baseThroughput - throughput) / baseThroughput) * 100 : null,
    };
  };
  const individualScenarios = candidates.map((target) => ({ ...target, ...measure([target]) }));
  const individualById = new Map(individualScenarios.map((scenario) => [scenario.id, scenario]));
  const pairs = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) pairs.push([candidates[i], candidates[j]]);
  }
  const scenarios = pairs.slice(0, maxPairs).map(([first, second]) => {
    const combined = measure([first, second]);
    const individualLosses = [individualById.get(first.id)?.throughputLossPercent, individualById.get(second.id)?.throughputLossPercent].filter(Number.isFinite);
    const strongestIndividualLossPercent = individualLosses.length ? Math.max(...individualLosses) : null;
    const combinedLossPercent = combined.throughputLossPercent;
    const additionalLossPercent = Number.isFinite(combinedLossPercent) && Number.isFinite(strongestIndividualLossPercent)
      ? combinedLossPercent - strongestIndividualLossPercent : null;
    return {
      id: `${first.id}::${second.id}`,
      targets: [first, second],
      name: `${first.name} + ${second.name}`,
      ...combined,
      strongestIndividualLossPercent,
      additionalLossPercent,
      interaction: additionalLossPercent == null ? "not-comparable" : additionalLossPercent > 0.01 ? "worse-than-either-alone" : additionalLossPercent < -0.01 ? "less-impact-than-strongest-alone" : "similar-to-strongest-alone",
    };
  }).sort((a, b) => {
    if (a.status !== "completed" && b.status === "completed") return 1;
    if (b.status !== "completed" && a.status === "completed") return -1;
    return (b.additionalLossPercent ?? -Infinity) - (a.additionalLossPercent ?? -Infinity) || a.name.localeCompare(b.name);
  });
  const truncated = pairs.length > scenarios.length;
  const allCompleted = baseline.status === "completed" && individualScenarios.every((item) => item.status === "completed") && scenarios.every((item) => item.status === "completed");
  return {
    status: allCompleted ? "completed" : scenarios.some((item) => item.status === "completed") ? "partial" : "blocked",
    projection, diagnostics, provenance, trafficMultiplier,
    baseline: { status: baseline.status, result: baseline, ...baselineObserved },
    individualScenarios, scenarios, totalPairCount: pairs.length, evaluatedPairCount: scenarios.length, truncated,
    interpretation: `Pairwise synthetic what-if analysis. Combined impact is compared with the stronger individual outage; ${truncated ? `only the first ${scenarios.length} of ${pairs.length} pairs were evaluated due to the pair limit. ` : "all component pairs were evaluated. "}Positive additional loss means the combined scenario loses more throughput than either individual outage in this model. This does not establish real-world cascading failure or failover behavior.`,
  };
}

function chooseOutageTarget(workbench, projection, requestedId) {
  if (requestedId) {
    const entity = (workbench.entities || []).find((item) => item.id === requestedId);
    if (!entity || !projection.nodeMap?.[requestedId]) return null;
    return entity;
  }
  for (const kind of RUNTIME_CANDIDATE_KINDS) {
    const entity = (workbench.entities || []).find((item) => item.kind === kind && projection.nodeMap?.[item.id]);
    if (entity) return entity;
  }
  return null;
}

function addRunnerDiagnostic(diagnostics, code, title, message, entityIds = []) {
  diagnostics.push({ code, severity: "warning", title, message, entityIds, relationIds: [] });
}

/**
 * Compile one Workbench model and run a comparable baseline, traffic-surge and
 * optional component-outage experiment set. Output fields are stable for UI use.
 */
export function runWorkbenchExperiments({
  workbench,
  simulationProfile,
  trafficMultiplier = 5,
  outageTargetEntityId,
  limits,
  scopeEntityIds,
} = {}) {
  const projection = buildSimulationProjection({ workbench, simulationProfile, scopeEntityIds });
  const diagnostics = [...(projection.diagnostics || [])];
  const provenance = {
    runnerVersion: WORKBENCH_SIMULATION_RUNNER_VERSION,
    modelRevision: workbench?.modelRevision ?? null,
    modelFingerprint: projection.provenance?.sourceModelFingerprint || null,
    profileFingerprint: projection.provenance?.simulationProfileFingerprint || null,
    scopeEntityIds: projection.provenance?.scopeEntityIds || null,
    scopeSeedEntityIds: projection.provenance?.scopeSeedEntityIds || null,
    scopeRootEntityIds: projection.provenance?.scopeRootEntityIds || null,
    scopeViewEntityIds: projection.provenance?.scopeViewEntityIds || null,
    scoped: projection.provenance?.scoped === true,
    adapterVersion: projection.provenance?.adapterVersion || "unknown",
    engineVersion: SIMULATION_ENGINE_VERSION,
  };
  if (projection.status !== "ready") {
    return { status: "blocked", projection, diagnostics, provenance, profileUsed: simulationProfile, runs: {} };
  }
  if (typeof trafficMultiplier !== "number" || !Number.isFinite(trafficMultiplier) || trafficMultiplier <= 0 || trafficMultiplier === 1) {
    addRunnerDiagnostic(diagnostics, "RUNNER-TRAFFIC-MULTIPLIER-INVALID", "Invalid traffic-surge multiplier", "trafficMultiplier must be finite, greater than zero, and different from 1.");
    return { status: "blocked", projection, diagnostics, provenance, profileUsed: simulationProfile, runs: {} };
  }

  const runs = {
    baseline: {
      key: "baseline",
      label: "Baseline",
      overrides: {},
      result: runSimulation({ projection, limits }),
    },
    trafficSurge: {
      key: "trafficSurge",
      label: `${trafficMultiplier}× traffic`,
      overrides: { trafficMultiplier },
      result: runSimulation({ projection, scenarioOverrides: { trafficMultiplier }, limits }),
    },
  };

  const outageTarget = chooseOutageTarget(workbench, projection, outageTargetEntityId);
  if (outageTarget) {
    const overrides = { unavailableNodeIds: [outageTarget.id] };
    runs.outage = {
      key: "outage",
      label: `${outageTarget.name || outageTarget.id} unavailable`,
      targetEntityId: outageTarget.id,
      overrides,
      result: runSimulation({ projection, scenarioOverrides: overrides, limits }),
    };
  } else if (outageTargetEntityId) {
    addRunnerDiagnostic(
      diagnostics,
      "RUNNER-OUTAGE-TARGET-UNSUPPORTED",
      "Outage target is not simulatable",
      `Component '${outageTargetEntityId}' is missing or does not map to a supported runtime node. No outage run was generated.`,
      [outageTargetEntityId],
    );
  } else {
    const candidateEntities = (workbench?.entities || []).filter((entity) => RUNTIME_CANDIDATE_KINDS.includes(entity.kind));
    const excludedCandidates = candidateEntities.filter((entity) => !projection.nodeMap?.[entity.id]);
    if (excludedCandidates.length) {
      const names = excludedCandidates.map((entity) => entity.name || entity.id);
      const clients = (workbench?.entities || []).filter((entity) => entity.kind === "frontend.react-app");
      diagnostics.push({
        code: "RUNNER-OUTAGE-TARGET-OUTSIDE-TYPED-PATH",
        severity: "warning",
        title: "Runtime components are outside the typed request path",
        message: `${names.join(", ")} ${names.length === 1 ? "is" : "are"} in the engineering model but not in this run's compiled request path. Ordinary canvas arrows are visual only. Create a Calls relationship from React application to REST service, then Reads from or Writes to from the REST service to PostgreSQL.`,
        entityIds: [...new Set([...clients.map((entity) => entity.id), ...excludedCandidates.map((entity) => entity.id)])],
        relationIds: [],
      });
    } else {
      addRunnerDiagnostic(
        diagnostics,
        "RUNNER-OUTAGE-TARGET-MISSING",
        "No outage target available",
        "The model has no supported database, REST service, or external-service node to use for the default outage experiment.",
      );
    }
  }

  for (const run of Object.values(runs)) {
    if (run.result?.status === "completed") {
      run.explanations = explainSimulationRun(run.result, workbench, { scenarioLabel: run.label });
      run.provenance = run.result.provenance || {};
    } else {
      run.explanations = [];
      run.provenance = run.result?.provenance || {};
    }
  }

  // Give users a Workbench-level explanation when the React traffic source has
  // no typed outgoing request route. The lower-level engine error remains in the
  // report, but this message explains that visual Excalidraw arrows are not SimIR edges.
  const trafficSource = (projection.topology?.nodes || []).find((node) => node.kind === "traffic-source");
  const hasRequestRoute = trafficSource && (projection.topology?.edges || []).some((edge) => edge.kind === "request" && edge.sourceId === trafficSource.id);
  if (trafficSource && !hasRequestRoute) {
    const otherRuntimeEntities = (workbench?.entities || []).filter((entity) => entity.id !== trafficSource.sourceEntityId
      && ["backend.rest-service", "data.postgresql-database", "integrations.external-api"].includes(entity.kind));
    diagnostics.push({
      code: "RUNNER-TYPED-REQUEST-PATH-MISSING",
      severity: "blocker",
      title: "No typed request path from the React application",
      message: "Simulation follows Workbench typed relationships, not ordinary canvas arrows. In Inspector, create Calls from the React application to the REST service, then Reads from or Writes to from the REST service to PostgreSQL. Reconfirm the profile after the active simulation scope changes.",
      entityIds: [...new Set([trafficSource.sourceEntityId, ...otherRuntimeEntities.map((entity) => entity.id)])],
      relationIds: [],
    });
  }

  // Projection warnings are useful context, but a scenario may still fail inside
  // the engine (for example because visible runtime nodes are not connected by
  // typed Workbench relationships). Surface those blocking diagnostics at the
  // suite level so the UI never blames an unrelated warning for the failure.
  const diagnosticKeys = new Set(diagnostics.map((item) => `${item.code || "unknown"}|${item.message || ""}|${(item.entityIds || []).join(",")}`));
  const entityIdByRuntimeNodeId = new Map((projection.topology?.nodes || []).map((node) => [node.id, node.sourceEntityId]));
  for (const run of Object.values(runs)) {
    for (const item of run.result?.diagnostics || []) {
      const mappedEntityIds = [...new Set([
        ...(item.entityIds || []),
        ...(item.nodeIds || []).map((nodeId) => entityIdByRuntimeNodeId.get(nodeId)).filter(Boolean),
      ])];
      const surfaced = mappedEntityIds.length ? { ...item, entityIds: mappedEntityIds } : item;
      const key = `${surfaced.code || "unknown"}|${surfaced.message || ""}|${(surfaced.entityIds || []).join(",")}`;
      if (diagnosticKeys.has(key)) continue;
      diagnostics.push(surfaced);
      diagnosticKeys.add(key);
    }
  }
  const severityRank = { blocker: 0, warning: 1, info: 2 };
  diagnostics.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || String(a.code).localeCompare(String(b.code)) || String(a.message).localeCompare(String(b.message)));

  const allCompleted = Object.values(runs).every((run) => run.result?.status === "completed");
  const anyCompleted = Object.values(runs).some((run) => run.result?.status === "completed");
  const status = allCompleted && runs.outage ? "completed" : anyCompleted ? "partial" : "blocked";
  return {
    status,
    projection,
    diagnostics,
    provenance,
    profileUsed: simulationProfile,
    runs,
    outageTargetId: outageTarget?.id || null,
    scenarioKeys: Object.keys(runs),
  };
}
