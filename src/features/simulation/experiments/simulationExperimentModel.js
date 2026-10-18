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
    parameters: { concurrency: 6, meanServiceMs: 30, serviceTimeCv: 0.2, bufferCapacity: 32, readFraction: 0.9, writeContentionMs: 15, failureProbability: 0, indexBenefitReadFraction: 0, indexReadSpeedupFactor: 3 },
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
    { key: "indexBenefitReadFraction", label: "Share of reads benefiting from proposed index (synthetic)", min: 0, max: 1, step: 0.05 },
    { key: "indexReadSpeedupFactor", label: "Assumed indexed-read speedup factor (synthetic)", min: 1, max: 20, step: 0.1 },
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
export function createCapacityImprovementProfile({ profile, workbench, scopeEntityIds, componentRows = [], preferredEntityId = null } = {}) {
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
  // A traced component may take priority only when the caller has matched it to
  // the same completed, non-outage scenario and has queue/pressure evidence.
  // The pure helper still validates kind, scope, profile and adjustable capacity.
  const candidateIds = [...new Set([preferredEntityId, ...rowRank.map((row) => row.entityId), ...preferredIds].filter(Boolean))];
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
    selectionReason: candidate.entity.id === preferredEntityId ? "selected-trace-evidence" : "scenario-pressure-evidence",
  };
}

/**
 * Prepare a controlled mean-service-time experiment. This is a distinct
 * hypothesis from adding concurrency: it reduces only the selected runtime
 * component's meanServiceMs assumption by 20%, and only when the run contains
 * recorded per-component service-time evidence. The canonical model and source
 * profile are never mutated.
 */
export function createServiceTimeImprovementProfile({ profile, workbench, scopeEntityIds, componentRows = [], preferredEntityId = null } = {}) {
  if (!profile || !profile.profilesByEntityId || !workbench || !Array.isArray(workbench.entities)) {
    throw new TypeError("A Workbench model and simulation profile are required to test a service-time improvement.");
  }
  const included = new Set(Array.isArray(scopeEntityIds) ? scopeEntityIds : Object.keys(profile.profilesByEntityId));
  if (!included.size) throw new Error("No runtime components are included in the current simulation scope.");

  const entitiesById = new Map(workbench.entities.map((entity) => [entity.id, entity]));
  const rowsById = new Map(componentRows.filter((row) => included.has(row.entityId)).map((row) => [row.entityId, row]));
  const adjustableKinds = new Set(["backend.rest-service", "data.postgresql-database", "integrations.external-api"]);
  const preferredRow = preferredEntityId ? rowsById.get(preferredEntityId) : null;
  const preferredEntity = preferredEntityId ? entitiesById.get(preferredEntityId) : null;
  const preferredProfile = preferredEntityId ? profile.profilesByEntityId[preferredEntityId] : null;
  const preferredHasEvidence = Number.isFinite(preferredRow?.serviceTimeP95Ms) && preferredRow.serviceTimeP95Ms > 0;
  const orderedRows = [...rowsById.values()].sort((a, b) =>
    (b.serviceTimeP95Ms ?? -1) - (a.serviceTimeP95Ms ?? -1)
      || (b.peakUtilization ?? 0) - (a.peakUtilization ?? 0)
      || a.entityId.localeCompare(b.entityId));
  const orderedIds = [
    ...(preferredHasEvidence && preferredEntity && preferredProfile && adjustableKinds.has(preferredEntity.kind) ? [preferredEntityId] : []),
    ...orderedRows.map((row) => row.entityId),
  ];

  let candidate = null;
  for (const entityId of [...new Set(orderedIds)]) {
    const entity = entitiesById.get(entityId);
    const entry = profile.profilesByEntityId[entityId];
    const row = rowsById.get(entityId);
    const before = entry?.parameters?.meanServiceMs;
    if (!entity || !adjustableKinds.has(entity.kind) || !entry || !Number.isFinite(before) || before <= 0.1) continue;
    if (!Number.isFinite(row?.serviceTimeP95Ms) || row.serviceTimeP95Ms <= 0) continue;
    candidate = { entity, entry, row, before };
    break;
  }
  if (!candidate) throw new Error("No in-scope runtime component has a valid mean-service-time assumption with recorded service-time evidence.");

  const next = structuredClone(profile);
  const nextEntry = next.profilesByEntityId[candidate.entity.id];
  const after = Math.max(0.1, Math.round(candidate.before * 0.8 * 10) / 10);
  if (!(after < candidate.before)) throw new Error("The selected mean service time cannot be reduced further.");
  nextEntry.parameters.meanServiceMs = after;
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
  nextEntry.assumptions.meanServiceMs = {
    status: "user-confirmed",
    source: "controlled-debug-experiment-override",
    note: `Controlled experiment only: mean service time reduced from ${candidate.before} ms to ${after} ms. This tests a synthetic optimization hypothesis; it does not claim a guaranteed real-world improvement. The canonical model and saved base profile are unchanged.`,
  };
  next.profileKind = Object.values(next.profilesByEntityId).every((item) => Object.values(item.assumptions || {}).every((assumption) => assumption.status === "user-confirmed"))
    ? "user-confirmed-synthetic"
    : "illustrative-synthetic";

  return {
    profile: next,
    entityId: candidate.entity.id,
    componentName: candidate.entity.name || candidate.entity.id,
    field: "meanServiceMs",
    unit: "ms",
    before: candidate.before,
    after,
    delta: Number((after - candidate.before).toFixed(3)),
    label: `${candidate.entity.name || candidate.entity.id}: mean service time ${candidate.before} → ${after} ms`,
    selectionReason: candidate.entity.id === preferredEntityId ? "selected-trace-service-time-evidence" : "scenario-service-time-evidence",
    evidence: { serviceTimeP95Ms: candidate.row.serviceTimeP95Ms, queueWaitP95Ms: candidate.row.queueWaitP95Ms ?? null },
  };
}

/**
 * Prepare a PostgreSQL-specific write-contention experiment. Unlike generic
 * service-time tuning, this changes only `writeContentionMs`, and only when the
 * selected scenario recorded write operations with positive contention overhead.
 * The source profile and canonical Workbench model are never mutated.
 */
export function createDatabaseContentionImprovementProfile({ profile, workbench, scopeEntityIds, componentRows = [], preferredEntityId = null } = {}) {
  if (!profile || !profile.profilesByEntityId || !workbench || !Array.isArray(workbench.entities)) {
    throw new TypeError("A Workbench model and simulation profile are required to test database write contention.");
  }
  const included = new Set(Array.isArray(scopeEntityIds) ? scopeEntityIds : Object.keys(profile.profilesByEntityId));
  if (!included.size) throw new Error("No runtime components are included in the current simulation scope.");

  const entitiesById = new Map(workbench.entities.map((entity) => [entity.id, entity]));
  const rowsById = new Map(componentRows.filter((row) => included.has(row.entityId)).map((row) => [row.entityId, row]));
  const isEligible = (entityId) => {
    const entity = entitiesById.get(entityId);
    const entry = profile.profilesByEntityId[entityId];
    const row = rowsById.get(entityId);
    const hasTypedWriteRelationship = (workbench.relations || []).some((relation) =>
      relation?.kind === "writes" && relation.targetId === entityId && included.has(relation.sourceId));
    return entity?.kind === "data.postgresql-database"
      && entry?.kind === "relational-store"
      && hasTypedWriteRelationship
      && Number.isFinite(entry?.parameters?.writeContentionMs)
      && entry.parameters.writeContentionMs > 0
      && Number.isFinite(row?.writeOperationsStarted) && row.writeOperationsStarted > 0
      && Number.isFinite(row?.writeContentionMsTotal) && row.writeContentionMsTotal > 0;
  };
  const candidates = [...rowsById.values()].filter((row) => isEligible(row.entityId)).sort((a, b) =>
    (b.writeContentionMsTotal ?? 0) - (a.writeContentionMsTotal ?? 0)
      || (b.maxDropped ?? 0) - (a.maxDropped ?? 0)
      || (b.peakUtilization ?? 0) - (a.peakUtilization ?? 0)
      || a.entityId.localeCompare(b.entityId));
  const candidate = preferredEntityId && isEligible(preferredEntityId)
    ? rowsById.get(preferredEntityId)
    : candidates[0];
  if (!candidate) {
    throw new Error("No in-scope PostgreSQL database recorded writes with positive modeled write-contention overhead. Add a typed Writes to relationship (or a supported reads-and-writes path), confirm the assumptions, and rerun the scenario.");
  }

  const entity = entitiesById.get(candidate.entityId);
  const before = profile.profilesByEntityId[candidate.entityId].parameters.writeContentionMs;
  const after = Number((before * 0.8).toFixed(4));
  if (!Number.isFinite(after) || after < 0 || after >= before) {
    throw new Error("The modeled write-contention overhead cannot be reduced further.");
  }
  const next = structuredClone(profile);
  const nextEntry = next.profilesByEntityId[candidate.entityId];
  nextEntry.parameters.writeContentionMs = after;
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
  nextEntry.assumptions.writeContentionMs = {
    status: "user-confirmed",
    source: "controlled-debug-experiment-override",
    note: `Controlled experiment only: modeled PostgreSQL write-contention overhead reduced from ${before} ms to ${after} ms per write operation. This tests a synthetic contention hypothesis; it does not modify a real database or guarantee a real-world improvement. The canonical model and saved base profile are unchanged.`,
  };
  next.profileKind = Object.values(next.profilesByEntityId).every((item) => Object.values(item.assumptions || {}).every((assumption) => assumption.status === "user-confirmed"))
    ? "user-confirmed-synthetic"
    : "illustrative-synthetic";

  return {
    profile: next,
    entityId: candidate.entityId,
    componentName: entity.name || entity.id,
    field: "writeContentionMs",
    unit: "ms/write",
    before,
    after,
    delta: Number((after - before).toFixed(4)),
    label: `${entity.name || entity.id}: modeled write contention ${before} → ${after} ms/write`,
    selectionReason: candidate.entityId === preferredEntityId ? "selected-trace-write-contention-evidence" : "scenario-write-contention-evidence",
    evidence: {
      readOperationsStarted: candidate.readOperationsStarted ?? 0,
      writeOperationsStarted: candidate.writeOperationsStarted,
      writeContentionMsTotal: candidate.writeContentionMsTotal,
      queueWaitP95Ms: candidate.queueWaitP95Ms ?? null,
      serviceTimeP95Ms: candidate.serviceTimeP95Ms ?? null,
      peakUtilization: candidate.peakUtilization ?? null,
      droppedRequests: candidate.maxDropped ?? 0,
    },
  };
}

const isSafeSqlIdentifier = (value) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value);
const quoteSqlIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
function safeProposedIndexName(tableName, columnName) {
  const raw = `idx_${tableName}_${columnName}`;
  if (raw.length <= 63) return raw;
  const suffix = [...raw].reduce((acc, char) => (Math.imul(acc, 31) + char.charCodeAt(0)) >>> 0, 7).toString(16);
  return `${raw.slice(0, 54)}_${suffix}`;
}
function parseTableColumnsForIndex(table) {
  try {
    const columns = typeof table?.properties?.columns === "string"
      ? JSON.parse(table.properties.columns)
      : table?.properties?.columns;
    return Array.isArray(columns) ? columns.filter((column) => column && typeof column === "object" && !Array.isArray(column) && isSafeSqlIdentifier(column.name)) : [];
  } catch {
    return [];
  }
}
function parseTableIndexesForIndex(table) {
  const raw = table?.properties?.indexes;
  if (raw == null || String(raw).trim() === "") return [];
  try {
    const indexes = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(indexes) ? indexes : null;
  } catch {
    return null;
  }
}

/**
 * Return database/table/column candidates for a synthetic index hypothesis.
 * Candidates require a completed read path, read-operation evidence, one table
 * containment relation, and an ordinary non-PK/non-unique column not already
 * listed in the table's modeled indexes. The engine does not parse SQL or plans.
 */
export function getDatabaseIndexCandidates({ profile, workbench, scopeEntityIds, componentRows = [] } = {}) {
  if (!profile?.profilesByEntityId || !workbench || !Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) return [];
  const included = new Set(Array.isArray(scopeEntityIds) ? scopeEntityIds : Object.keys(profile.profilesByEntityId));
  const entitiesById = new Map(workbench.entities.map((entity) => [entity.id, entity]));
  const rowsById = new Map(componentRows.filter((row) => included.has(row.entityId)).map((row) => [row.entityId, row]));
  const candidates = [];
  for (const database of workbench.entities) {
    if (database?.kind !== "data.postgresql-database" || !included.has(database.id)) continue;
    const entry = profile.profilesByEntityId[database.id];
    const row = rowsById.get(database.id);
    const fraction = Number.isFinite(entry?.parameters?.indexBenefitReadFraction) ? entry.parameters.indexBenefitReadFraction : 0;
    const speedupFactor = Number.isFinite(entry?.parameters?.indexReadSpeedupFactor) ? entry.parameters.indexReadSpeedupFactor : 3;
    if (entry?.kind !== "relational-store" || fraction >= 1 || speedupFactor <= 1
      || !Number.isFinite(row?.readOperationsStarted) || row.readOperationsStarted <= 0
      || !Number.isFinite(row?.serviceTimeP95Ms) || row.serviceTimeP95Ms <= 0) continue;
    const typedReadPath = workbench.relations.some((relation) => relation?.kind === "reads"
      && relation.targetId === database.id && included.has(relation.sourceId)
      && ["backend.rest-service", "backend.worker"].includes(entitiesById.get(relation.sourceId)?.kind));
    if (!typedReadPath) continue;
    const tables = workbench.relations
      .filter((relation) => relation?.kind === "contains-table" && relation.sourceId === database.id)
      .map((relation) => entitiesById.get(relation.targetId))
      .filter((table) => table?.kind === "data.postgresql-table");
    for (const table of tables) {
      const tableName = String(table.properties?.tableName || table.name || "").trim();
      const schemaName = String(database.properties?.schema || "public").trim();
      if (!isSafeSqlIdentifier(tableName) || !isSafeSqlIdentifier(schemaName)) continue;
      const columns = parseTableColumnsForIndex(table);
      const indexes = parseTableIndexesForIndex(table);
      // A malformed index list should block hypotheses for this table rather
      // than being interpreted as an empty list and suggesting a duplicate.
      if (!Array.isArray(indexes)) continue;
      const alreadyIndexed = new Set();
      for (const index of indexes) {
        for (const name of Array.isArray(index?.columns) ? index.columns : []) {
          if (typeof name === "string") alreadyIndexed.add(name.toLowerCase());
        }
      }
      for (const column of columns) {
        if (column.primaryKey === true || column.unique === true || column.indexed === true || alreadyIndexed.has(column.name.toLowerCase())) continue;
        const indexName = safeProposedIndexName(tableName, column.name);
        const sqlStatement = `CREATE INDEX IF NOT EXISTS ${quoteSqlIdentifier(indexName)} ON ${quoteSqlIdentifier(schemaName)}.${quoteSqlIdentifier(tableName)} USING btree (${quoteSqlIdentifier(column.name)});`;
        candidates.push({
          entityId: database.id,
          databaseName: database.name || database.id,
          tableEntityId: table.id,
          tableName,
          schemaName,
          columnName: column.name,
          indexName,
          sqlStatement,
          before: fraction,
          speedupFactor,
          evidence: {
            readOperationsStarted: row.readOperationsStarted,
            indexedReadOperationsStarted: row.indexedReadOperationsStarted ?? 0,
            indexAssumedTimeSavedMsTotal: row.indexAssumedTimeSavedMsTotal ?? 0,
            serviceTimeP95Ms: row.serviceTimeP95Ms,
            queueWaitP95Ms: row.queueWaitP95Ms ?? null,
            peakUtilization: row.peakUtilization ?? null,
            droppedRequests: row.maxDropped ?? 0,
          },
        });
      }
    }
  }
  return candidates.sort((a, b) => a.tableName.localeCompare(b.tableName)
    || a.columnName.localeCompare(b.columnName)
    || a.entityId.localeCompare(b.entityId));
}

/**
 * Prepare a synthetic proposed-index experiment for a selected PostgreSQL
 * table/column. It changes only the share of read operations assumed to benefit
 * from the proposed index. A fixed, explicitly visible speedup-factor assumption
 * is used; no SQL query plan or real PostgreSQL behavior is inferred.
 */
export function createDatabaseIndexImprovementProfile({ profile, workbench, scopeEntityIds, componentRows = [], preferredEntityId = null, preferredTableId = null, preferredColumnName = null } = {}) {
  if (!profile?.profilesByEntityId || !workbench || !Array.isArray(workbench.entities)) {
    throw new TypeError("A Workbench model and simulation profile are required to test an index hypothesis.");
  }
  const candidates = getDatabaseIndexCandidates({ profile, workbench, scopeEntityIds, componentRows });
  const preferred = candidates.find((candidate) => candidate.entityId === preferredEntityId
    && (!preferredTableId || candidate.tableEntityId === preferredTableId)
    && (!preferredColumnName || candidate.columnName === preferredColumnName));
  const candidate = preferred || (candidates.length === 1 ? candidates[0] : null);
  if (!candidate && candidates.length > 1) {
    throw new Error("Choose the proposed table column explicitly. The simulator has aggregate database read evidence but cannot infer which column the SQL query filters or sorts by.");
  }
  if (!candidate) {
    throw new Error("No eligible PostgreSQL index hypothesis is available. The selected scenario must record database reads on a typed Reads from path, and the database must contain a table with an unindexed, non-primary-key column and measured service-time evidence.");
  }
  if (candidate.before >= 1) throw new Error("All modeled read operations already benefit from the synthetic index assumption; no further trial is available.");
  const after = Math.min(1, Math.round((candidate.before + 0.25) * 100) / 100);
  if (!(after > candidate.before)) throw new Error("The modeled index-benefit fraction cannot be increased further.");
  const next = structuredClone(profile);
  const nextEntry = next.profilesByEntityId[candidate.entityId];
  nextEntry.parameters.indexBenefitReadFraction = after;
  nextEntry.parameters.indexReadSpeedupFactor = candidate.speedupFactor;
  for (const [entityId, item] of Object.entries(next.profilesByEntityId || {})) {
    item.assumptions ||= {};
    for (const field of Object.keys(item.parameters || {})) {
      item.assumptions[field] = {
        status: "user-confirmed",
        source: "explicit-debug-experiment-acknowledgement",
        note: "The user accepted the displayed synthetic assumptions for this controlled one-variable experiment.",
      };
    }
  }
  nextEntry.assumptions.indexBenefitReadFraction = {
    status: "user-confirmed",
    source: "controlled-debug-experiment-override",
    note: `Controlled experiment only: increase the share of reads assumed to benefit from a proposed btree index on ${candidate.tableName}.${candidate.columnName} from ${candidate.before} to ${after}; assumed indexed-read speedup is ${candidate.speedupFactor}×. The simulator does not parse SQL, select indexes, or model PostgreSQL query plans. Canonical model and saved base profile remain unchanged.`,
  };
  nextEntry.assumptions.indexReadSpeedupFactor = {
    status: "user-confirmed",
    source: "synthetic-index-hypothesis-assumption",
    note: `Fixed synthetic assumption for this trial: reads benefiting from the proposed index take 1/${candidate.speedupFactor} of the sampled database base service time. This is not a measured database query plan.`,
  };
  next.profileKind = "user-confirmed-synthetic";
  return {
    profile: next,
    entityId: candidate.entityId,
    componentName: candidate.databaseName,
    field: "indexBenefitReadFraction",
    unit: "fraction of reads",
    before: candidate.before,
    after,
    delta: Number((after - candidate.before).toFixed(3)),
    label: `${candidate.databaseName}: proposed index on ${candidate.tableName}.${candidate.columnName}`,
    selectionReason: preferredTableId && preferredColumnName ? "selected-schema-column-with-scenario-read-evidence" : "unique-schema-candidate-with-scenario-read-evidence",
    proposedIndex: {
      tableEntityId: candidate.tableEntityId,
      tableName: candidate.tableName,
      schemaName: candidate.schemaName,
      columnName: candidate.columnName,
      indexName: candidate.indexName,
      method: "btree",
      sqlStatement: candidate.sqlStatement,
    },
    evidence: {
      ...candidate.evidence,
      proposedIndex: { tableEntityId: candidate.tableEntityId, tableName: candidate.tableName, columnName: candidate.columnName, indexName: candidate.indexName, method: "btree" },
      beforeIndexBenefitReadFraction: candidate.before,
      afterIndexBenefitReadFraction: after,
      assumedIndexedReadSpeedupFactor: candidate.speedupFactor,
      modelingLimit: "Aggregate synthetic read model; no SQL query plan or index selection is simulated.",
    },
    modelingLimit: "Aggregate synthetic read model; no SQL query plan or real PostgreSQL index behavior is simulated.",
  };
}

/**
 * Align before/after event-derived series only when the observation buckets
 * match exactly. Never interpolate, pad, or fabricate comparison points.
 * `beforeRun` and `afterRun` are completed runner entries, not raw engine results.
 */
export function buildTimeSeriesComparisonPoints(beforeRun, afterRun) {
  const before = beforeRun?.result?.timeSeries;
  const after = afterRun?.result?.timeSeries;
  const beforePoints = before?.points;
  const afterPoints = after?.points;
  if (before?.source !== "discrete-event-timestamps" || after?.source !== "discrete-event-timestamps"
    || !Array.isArray(beforePoints) || !Array.isArray(afterPoints) || beforePoints.length === 0
    || beforePoints.length !== afterPoints.length
    || before.observationWindowMs !== after.observationWindowMs) {
    return { status: "unavailable", reason: "Matching event-derived time-series data is not available for both runs.", points: [] };
  }
  const points = [];
  for (let index = 0; index < beforePoints.length; index += 1) {
    const left = beforePoints[index];
    const right = afterPoints[index];
    if (!Number.isFinite(left?.startMs) || !Number.isFinite(left?.endMs)
      || left.startMs !== right?.startMs || left.endMs !== right?.endMs) {
      return { status: "unavailable", reason: "The runs use different time buckets; their curves are not compared to avoid misleading alignment.", points: [] };
    }
    points.push({
      startMs: left.startMs,
      endMs: left.endMs,
      beforeSuccessfulRps: left.successfulRps,
      afterSuccessfulRps: right.successfulRps,
      beforeLatencyP95Ms: left.latencyP95Ms,
      afterLatencyP95Ms: right.latencyP95Ms,
      beforeDroppedRequests: left.droppedRequests,
      afterDroppedRequests: right.droppedRequests,
    });
  }
  return { status: "ready", source: "matched-discrete-event-timestamps", points };
}

/** Summarize measured before/after changes without asserting a causal guarantee. */
export function summarizeSimulationImprovement(comparison) {
  if (comparison?.status !== "ready" || !Array.isArray(comparison.metrics)) {
    return { status: "inconclusive", gains: [], regressions: [], message: "A complete before/after metric comparison is not available." };
  }
  const row = (key) => comparison.metrics.find((item) => item.key === key);
  const gains = [];
  const regressions = [];
  const record = (key, label, unit, lowerIsBetter, scale = 1) => {
    const delta = row(key)?.delta?.absolute;
    if (!Number.isFinite(delta) || delta === 0) return;
    const change = Number((Math.abs(delta) * scale).toFixed(3));
    const item = { key, label, change, unit, direction: delta < 0 ? "decreased" : "increased" };
    const isGain = lowerIsBetter ? delta < 0 : delta > 0;
    (isGain ? gains : regressions).push(item);
  };
  record("droppedRequests", "Dropped requests", "requests", true);
  record("successRate", "Success rate", "percentage points", false, 100);
  record("throughputRps", "Successful throughput", "requests/sec", false);
  record("p95LatencyMs", "p95 latency", "ms", true);
  const status = gains.length && regressions.length ? "mixed"
    : gains.length ? "improved"
      : regressions.length ? "regressed" : "no-material-change";
  const message = status === "improved" ? "The changed assumption improved one or more reported outcomes, with no regression among the compared metrics."
    : status === "mixed" ? "The change produced trade-offs: inspect both the improved and regressed metrics before accepting it."
      : status === "regressed" ? "The changed assumption worsened one or more reported outcomes; revert it or test a different hypothesis."
        : "No metric changed at the reported precision. This trial did not demonstrate a measurable improvement.";
  return { status, gains, regressions, message };
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
 * Select the most useful non-outage scenario for a controlled capacity trial.
 * If the user is viewing the traffic-surge run, preserve that explicit choice.
 * Outage scenarios are excluded because adding capacity cannot repair an unavailable dependency.
 */
export function chooseCapacityImprovementScenarioKey(runs, activeScenarioKey = "baseline") {
  const isCompleted = (key) => runs?.[key]?.result?.status === "completed" && Boolean(runs?.[key]?.result?.result?.metrics);
  if (activeScenarioKey && activeScenarioKey !== "baseline" && activeScenarioKey !== "outage" && isCompleted(activeScenarioKey)) {
    return activeScenarioKey;
  }
  const candidates = ["baseline", "trafficSurge"].filter(isCompleted);
  if (!candidates.length) return null;
  const pressureScore = (key) => {
    const output = runs[key].result.result;
    const metrics = output.metrics || {};
    const peakUtilization = Math.max(0, ...(output.perNode || []).map((node) => Number.isFinite(node.utilization) ? node.utilization : 0));
    const p95 = metrics.successfulLatencyMs?.p95 || 0;
    return (metrics.droppedRequests || 0) * 1000
      + (metrics.failedRequests || 0) * 100
      + Math.max(0, 1 - (metrics.successRate ?? 1)) * 100
      + peakUtilization * 10
      + p95 / 10;
  };
  return candidates.sort((a, b) => pressureScore(b) - pressureScore(a) || (a === "trafficSurge" ? -1 : b === "trafficSurge" ? 1 : a.localeCompare(b)))[0];
}

/** Convert one scenario's actual per-node output to controlled-improvement evidence. */
export function getCapacityPressureRows(run) {
  const perNode = run?.result?.result?.perNode;
  if (!Array.isArray(perNode)) return [];
  return perNode.filter((row) => typeof row.sourceEntityId === "string" && row.sourceEntityId).map((row) => ({
    entityId: row.sourceEntityId,
    hasPressure: (row.utilization ?? 0) >= 0.8 || (row.dropped ?? 0) > 0 || (row.failed ?? 0) > 0,
    maxDropped: row.dropped || 0,
    maxFailed: row.failed || 0,
    peakUtilization: row.utilization ?? 0,
    queueWaitP95Ms: typeof row.queueWaitMs?.p95 === "number" ? row.queueWaitMs.p95 : null,
    serviceTimeP95Ms: typeof row.serviceTimeMs?.p95 === "number" ? row.serviceTimeMs.p95 : null,
    readOperationsStarted: Number.isFinite(row.readOperationsStarted) ? row.readOperationsStarted : 0,
    indexedReadOperationsStarted: Number.isFinite(row.indexedReadOperationsStarted) ? row.indexedReadOperationsStarted : 0,
    indexAssumedTimeSavedMsTotal: Number.isFinite(row.indexAssumedTimeSavedMsTotal) ? row.indexAssumedTimeSavedMsTotal : 0,
    writeOperationsStarted: Number.isFinite(row.writeOperationsStarted) ? row.writeOperationsStarted : 0,
    writeContentionMsTotal: Number.isFinite(row.writeContentionMsTotal) ? row.writeContentionMsTotal : 0,
  }));
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
