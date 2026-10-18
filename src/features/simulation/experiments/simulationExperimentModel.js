const PROFILE_DEFAULTS = Object.freeze({
  "frontend.react-app": {
    kind: "traffic-source",
    parameters: { trafficRps: 50 },
  },
  "backend.rest-service": {
    kind: "request-service",
    parameters: { concurrency: 8, meanServiceMs: 25, serviceTimeCv: 0.2, bufferCapacity: 64, failureProbability: 0, timeoutMs: 0, retryAttempts: 0 },
  },
  "data.postgresql-database": {
    kind: "relational-store",
    parameters: { concurrency: 6, meanServiceMs: 30, serviceTimeCv: 0.2, bufferCapacity: 32, readFraction: 0.9, writeContentionMs: 15, failureProbability: 0 },
  },
  "integrations.external-api": {
    kind: "external-service-approximation",
    parameters: { concurrency: 4, meanServiceMs: 100, serviceTimeCv: 0.5, bufferCapacity: 16, failureProbability: 0.02, timeoutMs: 0 },
  },
});

export const SIMULATION_PROFILE_FIELD_DEFINITIONS = Object.freeze({
  "traffic-source": [
    { key: "trafficRps", label: "Offered load (requests/sec)", min: 0.1, max: 100000, step: 1 },
  ],
  "request-service": [
    { key: "concurrency", label: "Concurrent capacity", min: 1, max: 10000, step: 1 },
    { key: "meanServiceMs", label: "Mean service time (ms)", min: 0.1, max: 600000, step: 1 },
    { key: "serviceTimeCv", label: "Service-time variability (CV)", min: 0, max: 5, step: 0.1 },
    { key: "bufferCapacity", label: "Waiting buffer capacity", min: 0, max: 1000000, step: 1 },
    { key: "failureProbability", label: "Operation failure probability", min: 0, max: 1, step: 0.01 },
    { key: "timeoutMs", label: "Timeout (ms; 0 = disabled)", min: 0, max: 600000, step: 1 },
    { key: "retryAttempts", label: "Retry attempts (engine currently requires 0)", min: 0, max: 0, step: 1 },
  ],
  "relational-store": [
    { key: "concurrency", label: "Concurrent capacity", min: 1, max: 10000, step: 1 },
    { key: "meanServiceMs", label: "Mean service time (ms)", min: 0.1, max: 600000, step: 1 },
    { key: "serviceTimeCv", label: "Service-time variability (CV)", min: 0, max: 5, step: 0.1 },
    { key: "bufferCapacity", label: "Waiting buffer capacity", min: 0, max: 1000000, step: 1 },
    { key: "readFraction", label: "Read fraction", min: 0, max: 1, step: 0.05 },
    { key: "writeContentionMs", label: "Write contention overhead (ms)", min: 0, max: 600000, step: 1 },
    { key: "failureProbability", label: "Operation failure probability", min: 0, max: 1, step: 0.01 },
  ],
  "external-service-approximation": [
    { key: "concurrency", label: "Concurrent capacity", min: 1, max: 10000, step: 1 },
    { key: "meanServiceMs", label: "Mean service time (ms)", min: 0.1, max: 600000, step: 1 },
    { key: "serviceTimeCv", label: "Service-time variability (CV)", min: 0, max: 5, step: 0.1 },
    { key: "bufferCapacity", label: "Waiting buffer capacity", min: 0, max: 1000000, step: 1 },
    { key: "failureProbability", label: "Operation failure probability", min: 0, max: 1, step: 0.01 },
    { key: "timeoutMs", label: "Timeout (engine requires 0; timeout behavior unsupported)", min: 0, max: 0, step: 1 },
  ],
});

function assumptionsFor(parameters, status = "proposed") {
  return Object.fromEntries(Object.keys(parameters).map((field) => [field, {
    status,
    source: "illustrative-default",
    note: "Synthetic starting value; replace with an engineering estimate or measured data before relying on the result.",
  }]));
}

export function createIllustrativeSimulationProfile(workbench, { durationMs = 15000, seed = 211 } = {}) {
  if (!workbench || !Array.isArray(workbench.entities)) throw new TypeError("A Workbench model with entities is required.");
  const profilesByEntityId = {};
  for (const entity of workbench.entities) {
    const base = PROFILE_DEFAULTS[entity.kind];
    if (!base) continue;
    const parameters = structuredClone(base.parameters);
    profilesByEntityId[entity.id] = {
      kind: base.kind,
      parameters,
      assumptions: assumptionsFor(parameters),
    };
  }
  return {
    schemaVersion: 1,
    sourceModelRevision: Number.isSafeInteger(workbench.modelRevision) ? workbench.modelRevision : null,
    profileKind: "illustrative-synthetic",
    profilesByEntityId,
    defaultScenario: { durationMs, seed },
  };
}

export function markSimulationAssumptionsConfirmed(profile) {
  if (!profile || !profile.profilesByEntityId || typeof profile.profilesByEntityId !== "object") {
    throw new TypeError("A simulation profile is required.");
  }
  const next = structuredClone(profile);
  for (const item of Object.values(next.profilesByEntityId)) {
    item.assumptions = Object.fromEntries(Object.keys(item.parameters || {}).map((field) => [field, {
      status: "user-confirmed",
      source: "explicit-user-acknowledgement",
      note: "The user explicitly accepted this value for this synthetic simulation profile.",
    }]));
  }
  next.profileKind = "user-confirmed-synthetic";
  return next;
}

export function mergeMissingIllustrativeProfiles(workbench, profile, scopeEntityIds) {
  const profileWorkbench = Array.isArray(scopeEntityIds)
    ? { ...workbench, entities: (workbench?.entities || []).filter((entity) => scopeEntityIds.includes(entity.id)) }
    : workbench;
  const generated = createIllustrativeSimulationProfile(profileWorkbench, {
    durationMs: profile?.defaultScenario?.durationMs ?? 15000,
    seed: profile?.defaultScenario?.seed ?? 211,
  });
  const next = profile ? structuredClone(profile) : generated;
  next.profilesByEntityId ||= {};
  const addedEntityIds = [];
  for (const [entityId, item] of Object.entries(generated.profilesByEntityId)) {
    if (!next.profilesByEntityId[entityId]) {
      next.profilesByEntityId[entityId] = item;
      addedEntityIds.push(entityId);
    }
  }
  next.sourceModelRevision = Number.isSafeInteger(workbench?.modelRevision) ? workbench.modelRevision : null;
  if (addedEntityIds.length) next.profileKind = "illustrative-synthetic";
  return { profile: next, addedEntityIds };
}

export function explainSimulationRun(run, workbench, { scenarioLabel = "Baseline" } = {}) {
  if (run?.status !== "completed" || !run.result) return [];
  const entityById = new Map((workbench?.entities || []).map((entity) => [entity.id, entity]));
  const explanations = [];
  for (const bottleneck of run.result.bottlenecks || []) {
    const entity = entityById.get(bottleneck.sourceEntityId);
    if (!entity) continue;
    if (bottleneck.dropped > 0) {
      explanations.push({
        id: `bottleneck:${scenarioLabel}:${entity.id}`,
        kind: "capacity-pressure",
        severity: "warning",
        title: `${entity.name || entity.id}: requests dropped`,
        message: `${bottleneck.dropped} requests were dropped at this component's bounded buffer or capacity boundary in the simulated run. Observed utilization was ${(bottleneck.utilization * 100).toFixed(1)}%.`,
        suggestedAction: "Inspect capacity, service time and waiting-buffer assumptions, then rerun the same scenario.",
        entityIds: [entity.id],
        evidence: { dropped: bottleneck.dropped, utilization: bottleneck.utilization, signal: bottleneck.signal },
      });
    } else {
      explanations.push({
        id: `utilization:${scenarioLabel}:${entity.id}`,
        kind: "high-utilization",
        severity: "warning",
        title: `${entity.name || entity.id}: high utilization`,
        message: `The component reached ${(bottleneck.utilization * 100).toFixed(1)}% observed utilization during the modeled observation window. This is a model signal, not evidence about a live deployment.`,
        suggestedAction: "Test higher capacity or lower service time and compare the results.",
        entityIds: [entity.id],
        evidence: { utilization: bottleneck.utilization, signal: bottleneck.signal },
      });
    }
  }
  const metrics = run.result.metrics;
  if (metrics.failedRequests > 0) {
    explanations.push({
      id: `failures:${scenarioLabel}`,
      kind: "request-failures",
      severity: "warning",
      title: `${metrics.failedRequests} requests failed`,
      message: `The simulation recorded ${metrics.failedRequests} failed requests out of ${metrics.offeredRequests} offered (${(100 * metrics.successRate).toFixed(1)}% succeeded). Review per-component failures and enabled failure overrides.`,
      suggestedAction: "Inspect the failed dependency and confirm the failure assumptions are intentional.",
      entityIds: [...new Set((run.result.perNode || []).filter((node) => node.failed > 0).map((node) => node.sourceEntityId))],
      evidence: { offeredRequests: metrics.offeredRequests, failedRequests: metrics.failedRequests, successRate: metrics.successRate },
    });
  }
  return explanations;
}

/**
 * Prepare a one-variable capacity experiment without mutating the canonical
 * model or the current profile. Component rows come from modeled suite output
 * and are used only to select the highest-pressure eligible runtime component.
 */
export function createCapacityImprovementProfile({ profile, workbench, scopeEntityIds, componentRows = [] } = {}) {
  if (!profile || !profile.profilesByEntityId || !workbench || !Array.isArray(workbench.entities)) {
    throw new TypeError("A Workbench model and simulation profile are required to test an improvement.");
  }
  const included = new Set(Array.isArray(scopeEntityIds) ? scopeEntityIds : Object.keys(profile.profilesByEntityId));
  if (included.size === 0) throw new Error("No runtime components are included in the current simulation scope.");

  const entitiesById = new Map(workbench.entities.map((entity) => [entity.id, entity]));
  const rowRank = [...componentRows]
    .filter((row) => included.has(row.entityId))
    .sort((a, b) => Number(Boolean(b.hasPressure)) - Number(Boolean(a.hasPressure))
      || (b.maxDropped || 0) - (a.maxDropped || 0)
      || (b.maxFailed || 0) - (a.maxFailed || 0)
      || (b.peakUtilization ?? 0) - (a.peakUtilization ?? 0));
  const preference = ["data.postgresql-database", "backend.rest-service", "integrations.external-api"];
  const preferredIds = preference.flatMap((kind) => workbench.entities.filter((entity) => included.has(entity.id) && entity.kind === kind).map((entity) => entity.id));
  const candidateIds = [...new Set([...rowRank.map((row) => row.entityId), ...preferredIds])];
  let candidate = null;
  for (const entityId of candidateIds) {
    const entity = entitiesById.get(entityId);
    const entry = profile.profilesByEntityId[entityId];
    const before = entry?.parameters?.concurrency;
    if (!entity || !entry || !["backend.rest-service", "data.postgresql-database", "integrations.external-api"].includes(entity.kind)) continue;
    if (!Number.isFinite(before) || before < 1 || before >= 10000) continue;
    candidate = { entity, entry, before };
    break;
  }
  if (!candidate) throw new Error("No in-scope runtime component has an adjustable concurrency assumption.");

  const next = structuredClone(profile);
  const nextEntry = next.profilesByEntityId[candidate.entity.id];
  const after = Math.min(10000, Math.max(candidate.before + 1, Math.ceil(candidate.before * 1.25)));
  nextEntry.parameters.concurrency = after;
  for (const [entityId, item] of Object.entries(next.profilesByEntityId || {})) {
    if (!included.has(entityId)) continue;
    item.assumptions ||= {};
    for (const field of Object.keys(item.parameters || {})) {
      item.assumptions[field] = {
        status: "user-confirmed",
        source: "explicit-debug-experiment-acknowledgement",
        note: "The user accepted the displayed synthetic assumptions for this controlled one-variable experiment.",
      };
    }
  }
  nextEntry.assumptions.concurrency = {
    status: "user-confirmed",
    source: "controlled-debug-experiment-override",
    note: `Controlled experiment only: concurrency increased from ${candidate.before} to ${after}. The canonical model and saved base profile are unchanged.`,
  };
  next.profileKind = Object.values(next.profilesByEntityId).every((item) => Object.values(item.assumptions || {}).every((assumption) => assumption.status === "user-confirmed"))
    ? "user-confirmed-synthetic"
    : "illustrative-synthetic";

  return {
    profile: next,
    entityId: candidate.entity.id,
    componentName: candidate.entity.name || candidate.entity.id,
    field: "concurrency",
    before: candidate.before,
    after,
    delta: after - candidate.before,
    label: `${candidate.entity.name || candidate.entity.id}: concurrency ${candidate.before} → ${after}`,
  };
}

const numericDelta = (baseline, current) => {
  if (typeof baseline !== "number" || typeof current !== "number") return { absolute: null, percent: null };
  return { absolute: Number((current - baseline).toFixed(4)), percent: baseline === 0 ? null : Number((((current - baseline) / Math.abs(baseline)) * 100).toFixed(2)) };
};

export function compareSimulationRuns(baselineRun, comparisonRun) {
  if (baselineRun?.status !== "completed" || !baselineRun.result || comparisonRun?.status !== "completed" || !comparisonRun.result) {
    return { status: "unavailable", metrics: [], reason: "Both baseline and comparison runs must complete before they can be compared." };
  }
  const before = baselineRun.result.metrics;
  const after = comparisonRun.result.metrics;
  const rows = [
    { key: "offeredRequests", label: "Offered requests", unit: "requests", before: before.offeredRequests, after: after.offeredRequests },
    { key: "successfulRequests", label: "Successful requests", unit: "requests", before: before.successfulRequests, after: after.successfulRequests },
    { key: "failedRequests", label: "Failed requests", unit: "requests", before: before.failedRequests, after: after.failedRequests },
    { key: "droppedRequests", label: "Dropped requests", unit: "requests", before: before.droppedRequests, after: after.droppedRequests },
    { key: "throughputRps", label: "Successful throughput", unit: "requests/sec", before: before.throughputRps, after: after.throughputRps },
    { key: "p95LatencyMs", label: "Successful p95 latency", unit: "ms", before: before.successfulLatencyMs?.p95, after: after.successfulLatencyMs?.p95 },
    { key: "successRate", label: "Success rate", unit: "ratio", before: before.successRate, after: after.successRate },
  ].map((row) => ({ ...row, delta: numericDelta(row.before, row.after) }));
  return {
    status: "ready",
    metrics: rows,
    summary: {
      successfulRequestsDelta: after.successfulRequests - before.successfulRequests,
      droppedRequestsDelta: after.droppedRequests - before.droppedRequests,
      throughputDeltaRps: numericDelta(before.throughputRps, after.throughputRps),
      p95LatencyDeltaMs: numericDelta(before.successfulLatencyMs?.p95, after.successfulLatencyMs?.p95),
      successRateDelta: numericDelta(before.successRate, after.successRate),
    },
  };
}


/**
 * Build a compact, UI-neutral comparison across every scenario in a runner result.
 * Only completed runs contribute metrics. Values stay tied to source Workbench IDs.
 */
export function buildScenarioComparisonOverview(experimentSuite, workbench) {
  const runs = experimentSuite?.runs || {};
  const baseline = runs.baseline?.result;
  const baselineCompleted = baseline?.status === "completed" && Boolean(baseline?.result);
  const scenarioRows = Object.entries(runs).map(([key, run]) => {
    const completed = run?.result?.status === "completed" && Boolean(run?.result?.result?.metrics);
    const metrics = completed ? run.result.result.metrics : null;
    const comparison = key !== "baseline" && baselineCompleted && completed
      ? compareSimulationRuns(baseline, run.result)
      : null;
    const delta = (metricKey) => comparison?.status === "ready"
      ? comparison.metrics.find((item) => item.key === metricKey)?.delta?.absolute ?? null
      : key === "baseline" && completed ? 0 : null;
    return {
      key,
      label: run?.label || key,
      status: completed ? "completed" : run?.result?.status || "blocked",
      metrics: metrics ? {
        offeredRequests: metrics.offeredRequests,
        successfulRequests: metrics.successfulRequests,
        failedRequests: metrics.failedRequests,
        droppedRequests: metrics.droppedRequests,
        successRate: metrics.successRate,
        throughputRps: metrics.throughputRps,
        p95LatencyMs: metrics.successfulLatencyMs?.p95 ?? null,
      } : null,
      deltaVsBaseline: {
        successfulRequests: delta("successfulRequests"),
        droppedRequests: delta("droppedRequests"),
        throughputRps: delta("throughputRps"),
        p95LatencyMs: delta("p95LatencyMs"),
        successRate: delta("successRate"),
      },
      overrides: run?.overrides || {},
      targetEntityId: run?.targetEntityId || null,
    };
  });

  const entitiesById = new Map((workbench?.entities || []).map((entity) => [entity.id, entity]));
  const nodeStatsByEntity = new Map();
  for (const [scenarioKey, run] of Object.entries(runs)) {
    if (run?.result?.status !== "completed") continue;
    for (const node of run.result.result?.perNode || []) {
      const entityId = node.sourceEntityId;
      if (!entityId) continue;
      if (!nodeStatsByEntity.has(entityId)) nodeStatsByEntity.set(entityId, {});
      nodeStatsByEntity.get(entityId)[scenarioKey] = {
        utilization: typeof node.utilization === "number" ? node.utilization : null,
        dropped: typeof node.dropped === "number" ? node.dropped : null,
        failed: typeof node.failed === "number" ? node.failed : null,
        arrivals: typeof node.arrivals === "number" ? node.arrivals : null,
        queueWaitP95Ms: typeof node.queueWaitMs?.p95 === "number" ? node.queueWaitMs.p95 : null,
        serviceTimeP95Ms: typeof node.serviceTimeMs?.p95 === "number" ? node.serviceTimeMs.p95 : null,
      };
    }
  }
  const componentRows = [...nodeStatsByEntity.entries()].map(([entityId, byScenario]) => {
    const values = Object.values(byScenario);
    const utilizations = values.map((item) => item.utilization).filter((value) => typeof value === "number");
    const maxDropped = Math.max(0, ...values.map((item) => item.dropped || 0));
    const maxFailed = Math.max(0, ...values.map((item) => item.failed || 0));
    const peakUtilization = utilizations.length ? Math.max(...utilizations) : null;
    const hasPressure = maxDropped > 0 || maxFailed > 0 || (peakUtilization ?? 0) >= 0.8;
    return {
      entityId,
      label: entitiesById.get(entityId)?.name || entityId,
      byScenario,
      peakUtilization,
      maxDropped,
      maxFailed,
      hasPressure,
    };
  }).sort((a, b) => Number(b.hasPressure) - Number(a.hasPressure)
    || b.maxDropped - a.maxDropped
    || b.maxFailed - a.maxFailed
    || (b.peakUtilization ?? 0) - (a.peakUtilization ?? 0)
    || a.entityId.localeCompare(b.entityId));

  const insights = [];
  if (baselineCompleted) {
    for (const row of scenarioRows.filter((item) => item.key !== "baseline" && item.status === "completed")) {
      const droppedDelta = row.deltaVsBaseline.droppedRequests;
      if (typeof droppedDelta === "number" && droppedDelta > 0) {
        const culprit = componentRows
          .map((component) => ({ ...component, droppedDelta: (component.byScenario[row.key]?.dropped || 0) - (component.byScenario.baseline?.dropped || 0) }))
          .filter((component) => component.droppedDelta > 0)
          .sort((a, b) => b.droppedDelta - a.droppedDelta || a.entityId.localeCompare(b.entityId))[0];
        insights.push({
          id: `scenario-drops:${row.key}`,
          kind: "capacity-regression",
          severity: "warning",
          scenarioKey: row.key,
          title: `${row.label}: ${droppedDelta} additional requests dropped`,
          message: culprit
            ? `${culprit.label} accounts for the largest increase in modeled drops (${culprit.droppedDelta}). The relationship is observed in this run; inspect its capacity and buffer assumptions before treating it as a bottleneck in a real system.`
            : `The scenario records ${droppedDelta} additional drops versus baseline, but per-component evidence did not isolate a single component.`,
          suggestedAction: "Compare component capacity, service-time and buffer assumptions, then rerun with one change at a time.",
          entityIds: culprit ? [culprit.entityId] : [],
          evidence: { scenarioKey: row.key, droppedDelta, componentDroppedDelta: culprit?.droppedDelta ?? null },
        });
      }
      const p95Delta = row.deltaVsBaseline.p95LatencyMs;
      if (typeof p95Delta === "number" && p95Delta > 0) {
        insights.push({
          id: `scenario-latency:${row.key}`,
          kind: "latency-regression",
          severity: "info",
          scenarioKey: row.key,
          title: `${row.label}: p95 latency increased by ${p95Delta.toFixed(2)} ms`,
          message: `Successful-request p95 latency is higher than baseline in this synthetic run. This is a measured difference in the model output, not a guarantee about a deployed system.`,
          suggestedAction: "Inspect the component pressure comparison and test a single capacity or service-time change.",
          entityIds: componentRows.filter((component) => (component.byScenario[row.key]?.utilization ?? 0) >= 0.8).map((component) => component.entityId),
          evidence: { scenarioKey: row.key, p95DeltaMs: p95Delta },
        });
      }
      const successDelta = row.deltaVsBaseline.successRate;
      if (typeof successDelta === "number" && successDelta < 0) {
        insights.push({
          id: `scenario-success:${row.key}`,
          kind: "success-rate-regression",
          severity: "warning",
          scenarioKey: row.key,
          title: `${row.label}: success rate decreased by ${(Math.abs(successDelta) * 100).toFixed(1)} percentage points`,
          message: `The scenario completed with a lower modeled success rate than baseline. Review failure and capacity signals alongside the scenario overrides.`,
          suggestedAction: "Select the scenario and inspect failures, dropped requests and affected component rows.",
          entityIds: componentRows.filter((component) => (component.byScenario[row.key]?.failed ?? 0) > (component.byScenario.baseline?.failed ?? 0)).map((component) => component.entityId),
          evidence: { scenarioKey: row.key, successRateDelta: successDelta },
        });
      }
    }
  }

  return {
    status: scenarioRows.some((row) => row.status === "completed") ? "ready" : "unavailable",
    scenarios: scenarioRows,
    components: componentRows,
    insights,
    baselineAvailable: baselineCompleted,
  };
}
