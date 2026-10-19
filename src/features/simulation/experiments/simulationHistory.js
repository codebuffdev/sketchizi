/**
 * Small, document-persisted history for synthetic simulation experiments.
 * Stores metrics, bounded event-derived time-series buckets, per-node/per-edge
 * evidence, explanations and provenance; never stores event queues or the full projection.
 */
export const SIMULATION_HISTORY_SCHEMA_VERSION = 1;
export const SIMULATION_HISTORY_LIMIT = 5;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => structuredClone(value);

// Compare JSON-compatible semantic inputs independently of object key insertion
// order. Array order is preserved because it may be semantically meaningful.
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const stableStringify = (value) => JSON.stringify(stableValue(value));

function compactRun(run) {
  const result = run?.result;
  const engineResult = result?.result;
  return {
    key: String(run?.key || "unknown"),
    label: String(run?.label || run?.key || "Scenario"),
    overrides: isRecord(run?.overrides) ? clone(run.overrides) : {},
    ...(run?.targetEntityId ? { targetEntityId: String(run.targetEntityId) } : {}),
    status: result?.status || "unknown",
    explanations: Array.isArray(run?.explanations) ? clone(run.explanations) : [],
    provenance: isRecord(run?.provenance) ? clone(run.provenance) : {},
    result: isRecord(engineResult) ? {
      schemaVersion: engineResult.schemaVersion,
      simulation: isRecord(engineResult.simulation) ? clone(engineResult.simulation) : {},
      metrics: isRecord(engineResult.metrics) ? clone(engineResult.metrics) : {},
      timeSeries: isRecord(engineResult.timeSeries) ? clone(engineResult.timeSeries) : null,
      requestTraces: isRecord(engineResult.requestTraces) ? clone(engineResult.requestTraces) : null,
      perNode: Array.isArray(engineResult.perNode) ? clone(engineResult.perNode) : [],
      perEdge: Array.isArray(engineResult.perEdge) ? clone(engineResult.perEdge) : [],
      bottlenecks: Array.isArray(engineResult.bottlenecks) ? clone(engineResult.bottlenecks) : [],
      provenance: isRecord(engineResult.provenance) ? clone(engineResult.provenance) : {},
    } : null,
    diagnostics: Array.isArray(result?.diagnostics) ? clone(result.diagnostics) : [],
  };
}

function compactProfile(profile) {
  if (!isRecord(profile)) return null;
  return {
    schemaVersion: profile.schemaVersion ?? null,
    profileKind: "synthetic-assumptions",
    defaultScenario: isRecord(profile.defaultScenario) ? clone(profile.defaultScenario) : {},
    profilesByEntityId: Object.fromEntries(Object.entries(profile.profilesByEntityId || {})
      .map(([id, item]) => [id, {
        kind: item?.kind || "unknown",
        parameters: isRecord(item?.parameters) ? clone(item.parameters) : {},
      }])
      .sort(([left], [right]) => left.localeCompare(right))),
    // Retain the exact deployment context used when a result was created.
    // These fields are provenance only; the current simulation engine does not
    // consume them as capacity multipliers.
    infrastructureByEntityId: Object.fromEntries(Object.entries(profile.infrastructureByEntityId || {})
      .map(([id, item]) => [id, isRecord(item) ? clone(item) : {}])
      .sort(([left], [right]) => left.localeCompare(right))),
    // Measurements are saved as separate calibration evidence. They are not
    // model inputs and are deliberately excluded from stale-result fingerprints.
    loadTestEvidence: isRecord(profile.loadTestEvidence) ? clone(profile.loadTestEvidence) : { schemaVersion: 1, records: [] },
  };
}

/** Snapshot semantic identity only; canvas layout is not part of simulation history. */
export function createSimulationModelSnapshot(workbench) {
  const entities = (Array.isArray(workbench?.entities) ? workbench.entities : []).map((entity) => ({
    id: entity.id,
    kind: entity.kind,
    name: entity.name || entity.id,
    properties: isRecord(entity.properties) ? clone(entity.properties) : {},
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const relations = (Array.isArray(workbench?.relations) ? workbench.relations : []).map((relation) => ({
    id: relation.id,
    kind: relation.kind,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    properties: isRecord(relation.properties) ? clone(relation.properties) : {},
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    modelRevision: Number.isSafeInteger(workbench?.modelRevision) ? workbench.modelRevision : null,
    entities,
    relations,
  };
}

const stableProfileConfiguration = (profile) => {
  const compact = compactProfile(profile);
  if (!compact) return null;
  return stableStringify({
    schemaVersion: compact.schemaVersion,
    defaultScenario: compact.defaultScenario,
    profilesByEntityId: compact.profilesByEntityId,
    infrastructureByEntityId: compact.infrastructureByEntityId || {},
  });
};

/** Compare recorded inputs with current inputs; saved result values never change. */
export function simulationResultsAreStale(results, workbench, currentProfile, currentScopeEntityIds) {
  if (!results) return false;
  if (results.provenance?.modelRevision !== (workbench?.modelRevision ?? null)) return true;
  if (Array.isArray(currentScopeEntityIds) && Array.isArray(results.provenance?.scopeEntityIds)) {
    const currentScope = [...new Set(currentScopeEntityIds)].sort();
    const previousScope = [...new Set(results.provenance.scopeEntityIds)].sort();
    if (stableStringify(currentScope) !== stableStringify(previousScope)) return true;
  }

  if (results.sourceModelSnapshot) {
    const previous = results.sourceModelSnapshot;
    const current = createSimulationModelSnapshot(workbench);
    const previousSemanticModel = stableStringify({ entities: previous.entities || [], relations: previous.relations || [] });
    const currentSemanticModel = stableStringify({ entities: current.entities, relations: current.relations });
    if (previousSemanticModel !== currentSemanticModel) return true;
  }

  // A controlled one-variable experiment intentionally uses a derived profile.
  // Compare staleness against the saved base profile, not its deliberate override.
  const previouslyUsedProfile = results.experimentMetadata?.kind === "one-variable-improvement"
    ? results.experimentMetadata.baseProfileSnapshot
    : (results.historyProfileSnapshot || results.profileUsed);
  return stableProfileConfiguration(previouslyUsedProfile) !== stableProfileConfiguration(currentProfile);
}

/** Create a bounded, JSON-safe history entry from a completed or partial suite. */
export function createSimulationHistoryEntry(experimentSuite, { workbench, simulationProfile, createdAt = new Date().toISOString(), id } = {}) {
  if (!isRecord(experimentSuite) || !["completed", "partial"].includes(experimentSuite.status)) {
    throw new TypeError("Only completed or partial simulation suites can be saved to history.");
  }
  const runs = Object.fromEntries(Object.entries(experimentSuite.runs || {}).map(([key, run]) => [key, compactRun({ ...run, key })]));
  if (!Object.values(runs).some((run) => run.status === "completed" && run.result)) {
    throw new TypeError("Simulation history requires at least one completed scenario.");
  }
  const provenance = isRecord(experimentSuite.provenance) ? clone(experimentSuite.provenance) : {};
  const profileSnapshot = compactProfile(simulationProfile);
  const profileFingerprint = provenance.profileFingerprint || null;
  const modelFingerprint = provenance.modelFingerprint || null;
  const uniqueSuffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
  const entryId = id || `sim-history-${String(createdAt).replace(/[^0-9A-Za-z]/g, "").slice(0, 24)}-${String(runs.baseline?.result?.simulation?.runFingerprint || modelFingerprint || "run").slice(0, 12)}-${uniqueSuffix}`;
  return {
    schemaVersion: SIMULATION_HISTORY_SCHEMA_VERSION,
    id: entryId,
    name: String(experimentSuite.name || experimentSuite.experimentMetadata?.title || `Experiment ${new Date(createdAt).toLocaleString()}`).slice(0, 120),
    createdAt,
    status: experimentSuite.status,
    modelRevision: workbench?.modelRevision ?? provenance.modelRevision ?? null,
    sourceModelSnapshot: createSimulationModelSnapshot(workbench),
    modelFingerprint,
    profileFingerprint,
    runnerVersion: provenance.runnerVersion || null,
    adapterVersion: provenance.adapterVersion || null,
    engineVersion: provenance.engineVersion || null,
    scopeEntityIds: Array.isArray(provenance.scopeEntityIds) ? [...provenance.scopeEntityIds] : null,
    scopeSeedEntityIds: Array.isArray(provenance.scopeSeedEntityIds) ? [...provenance.scopeSeedEntityIds] : null,
    scopeRootEntityIds: Array.isArray(provenance.scopeRootEntityIds) ? [...provenance.scopeRootEntityIds] : null,
    scopeViewEntityIds: Array.isArray(provenance.scopeViewEntityIds) ? [...provenance.scopeViewEntityIds] : null,
    scoped: provenance.scoped === true,
    profileSnapshot,
    diagnostics: Array.isArray(experimentSuite.diagnostics) ? clone(experimentSuite.diagnostics) : [],
    runs,
  };
}

/** Prepend an entry, de-duplicate by ID, and cap document growth to five suites. */
export function appendSimulationHistory(history, entry, limit = SIMULATION_HISTORY_LIMIT) {
  if (!isRecord(entry) || entry.schemaVersion !== SIMULATION_HISTORY_SCHEMA_VERSION || typeof entry.id !== "string") {
    throw new TypeError("Invalid simulation history entry.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new RangeError("History limit must be an integer between 1 and 20.");
  if (history != null && !Array.isArray(history)) throw new TypeError("Simulation history must be an array.");
  const existing = (history || []).filter((item) => {
    if (!isRecord(item) || item.schemaVersion !== SIMULATION_HISTORY_SCHEMA_VERSION || typeof item.id !== "string") {
      throw new TypeError("Existing simulation history contains an invalid entry.");
    }
    return item.id !== entry.id;
  });
  return [clone(entry), ...existing.map(clone)].slice(0, limit);
}

/** Rehydrate the subset required by the results UI; no engine rerun is performed. */
export function restoreSimulationHistoryEntry(entry) {
  if (!isRecord(entry) || entry.schemaVersion !== SIMULATION_HISTORY_SCHEMA_VERSION || !isRecord(entry.runs)) {
    throw new TypeError("Saved simulation history entry is invalid or unsupported.");
  }
  return {
    status: entry.status,
    provenance: {
      modelRevision: entry.modelRevision,
      modelFingerprint: entry.modelFingerprint,
      profileFingerprint: entry.profileFingerprint,
      runnerVersion: entry.runnerVersion,
      adapterVersion: entry.adapterVersion,
      engineVersion: entry.engineVersion,
      scopeEntityIds: Array.isArray(entry.scopeEntityIds) ? clone(entry.scopeEntityIds) : null,
      scopeSeedEntityIds: Array.isArray(entry.scopeSeedEntityIds) ? clone(entry.scopeSeedEntityIds) : null,
      scopeRootEntityIds: Array.isArray(entry.scopeRootEntityIds) ? clone(entry.scopeRootEntityIds) : null,
      scopeViewEntityIds: Array.isArray(entry.scopeViewEntityIds) ? clone(entry.scopeViewEntityIds) : null,
      scoped: entry.scoped === true,
    },
    diagnostics: clone(entry.diagnostics || []),
    runs: Object.fromEntries(Object.entries(entry.runs).map(([key, run]) => [key, {
      key: run.key || key,
      label: run.label || key,
      overrides: clone(run.overrides || {}),
      ...(run.targetEntityId ? { targetEntityId: run.targetEntityId } : {}),
      explanations: clone(run.explanations || []),
      provenance: clone(run.provenance || {}),
      result: {
        status: run.status,
        result: run.result ? clone(run.result) : null,
        diagnostics: clone(run.diagnostics || []),
        provenance: clone(run.provenance || {}),
      },
    }])),
    historyEntryId: entry.id,
    historyCreatedAt: entry.createdAt,
    historyProfileSnapshot: clone(entry.profileSnapshot),
    ...(isRecord(entry.experimentMetadata) ? { experimentMetadata: clone(entry.experimentMetadata) } : {}),
    sourceModelSnapshot: clone(entry.sourceModelSnapshot || { modelRevision: entry.modelRevision ?? null, entities: [], relations: [] }),
  };
}


/** Rename a retained history item without changing its recorded evidence. */
export function renameSimulationHistoryEntry(history, entryId, name) {
  if (!Array.isArray(history)) throw new TypeError("Simulation history must be an array.");
  if (typeof entryId !== "string" || !entryId) throw new TypeError("A saved experiment ID is required.");
  const normalizedName = String(name ?? "").trim().slice(0, 120);
  if (!normalizedName) throw new TypeError("Experiment name cannot be empty.");
  let found = false;
  const next = history.map((entry) => {
    if (entry.id !== entryId) return clone(entry);
    found = true;
    return { ...clone(entry), name: normalizedName };
  });
  if (!found) throw new Error("Saved experiment was not found.");
  return next;
}

/** Search names, status, engine, fingerprints and scenario labels without mutating history. */
export function searchSimulationHistory(history, query = "") {
  const items = Array.isArray(history) ? history : [];
  const needle = String(query ?? "").trim().toLocaleLowerCase();
  if (!needle) return items;
  return items.filter((entry) => {
    const scenarioLabels = Object.values(entry.runs || {}).map((run) => `${run.label || ""} ${run.key || ""}`).join(" ");
    const haystack = [entry.name, entry.status, entry.engineVersion, entry.modelFingerprint, entry.profileFingerprint, scenarioLabels]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Classify whether a replay reproduced the saved evidence. This is stricter than
 * a metric-delta comparison: inputs, scenario coverage, run fingerprints and
 * recorded metrics must all agree before claiming an exact reproduction.
 */
export function assessSimulationReproducibility(original, replay) {
  if (!isRecord(original) || !isRecord(replay) || !isRecord(original.runs) || !isRecord(replay.runs)) {
    throw new TypeError("Two valid saved experiment entries are required for reproducibility assessment.");
  }
  const warnings = [];
  if (!original.modelFingerprint || !replay.modelFingerprint || original.modelFingerprint !== replay.modelFingerprint) warnings.push("Model fingerprints are missing or differ.");
  if (!original.profileFingerprint || !replay.profileFingerprint || original.profileFingerprint !== replay.profileFingerprint) warnings.push("Profile fingerprints are missing or differ.");
  if (!original.engineVersion || !replay.engineVersion || original.engineVersion !== replay.engineVersion) warnings.push("Engine versions are missing or differ.");
  if (original.runnerVersion !== replay.runnerVersion) warnings.push("Runner versions differ.");
  const originalKeys = Object.keys(original.runs).sort();
  const replayKeys = Object.keys(replay.runs).sort();
  const sameScenarioSet = stableStringify(originalKeys) === stableStringify(replayKeys);
  if (!sameScenarioSet) warnings.push("Scenario sets differ.");
  let complete = sameScenarioSet && originalKeys.length > 0;
  let sameMetrics = complete;
  let sameRunFingerprints = complete;
  for (const key of originalKeys) {
    const before = original.runs[key];
    const after = replay.runs[key];
    if (!before || !after || before.status !== "completed" || after.status !== "completed" || !isRecord(before.result?.metrics) || !isRecord(after.result?.metrics)) {
      complete = false; sameMetrics = false; sameRunFingerprints = false;
      continue;
    }
    if (stableStringify(before.result.metrics) !== stableStringify(after.result.metrics)) sameMetrics = false;
    const beforeFingerprint = before.result.simulation?.runFingerprint;
    const afterFingerprint = after.result.simulation?.runFingerprint;
    if (!beforeFingerprint || !afterFingerprint || beforeFingerprint !== afterFingerprint) sameRunFingerprints = false;
  }
  if (!complete) warnings.push("At least one scenario is missing or incomplete; exact reproduction cannot be established.");
  const sameInputs = Boolean(original.modelFingerprint && replay.modelFingerprint && original.modelFingerprint === replay.modelFingerprint
    && original.profileFingerprint && replay.profileFingerprint && original.profileFingerprint === replay.profileFingerprint
    && original.engineVersion && replay.engineVersion && original.engineVersion === replay.engineVersion
    && original.runnerVersion === replay.runnerVersion);
  let status;
  if (!complete) status = "incomplete";
  else if (sameInputs && sameRunFingerprints && sameMetrics) status = "exact-match";
  else if (sameMetrics) status = "metrics-match-inputs-differ";
  else status = "metrics-differ";
  if (status === "metrics-differ") warnings.push(sameRunFingerprints ? "Metrics differ despite matching run fingerprints; investigate a determinism or evidence-integrity defect." : "One or more scenario metrics differ from the saved evidence.");
  if (status === "metrics-match-inputs-differ") warnings.push("Metrics match, but provenance or run fingerprints differ; this is not an exact reproduction.");
  return { status, complete, sameInputs, sameMetrics, sameRunFingerprints, sameScenarioSet, warnings: [...new Set(warnings)] };
}

/** Compare matching scenario metrics in two retained suites; never invent missing values. */
export function compareSimulationHistoryEntries(left, right) {
  if (!isRecord(left) || !isRecord(right) || !isRecord(left.runs) || !isRecord(right.runs)) {
    throw new TypeError("Two valid saved experiment entries are required.");
  }
  const warnings = [];
  if (left.modelFingerprint !== right.modelFingerprint) warnings.push("Model fingerprints differ; the runs use different semantic model snapshots.");
  if (left.profileFingerprint !== right.profileFingerprint) warnings.push("Profile fingerprints differ; simulation assumptions may differ.");
  if (left.engineVersion !== right.engineVersion) warnings.push("Engine versions differ; numeric changes may reflect engine behavior as well as model changes.");
  const keys = [...new Set([...Object.keys(left.runs), ...Object.keys(right.runs)])];
  const metricKeys = [
    ["throughputRps", "Successful throughput", "requests/sec"],
    ["p95LatencyMs", "p95 latency", "ms"],
    ["failedRatePercent", "Failure rate", "%"],
  ];
  const rows = keys.map((key) => {
    const a = left.runs[key]; const b = right.runs[key];
    const aMetrics = a?.result?.metrics || {}; const bMetrics = b?.result?.metrics || {};
    const metricValue = (metrics, metricKey) => {
      if (metricKey === "p95LatencyMs") return metrics.successfulLatencyMs?.p95;
      if (metricKey === "failedRatePercent") {
        return Number.isFinite(metrics.offeredRequests) && metrics.offeredRequests > 0 && Number.isFinite(metrics.failedRequests)
          ? (metrics.failedRequests / metrics.offeredRequests) * 100 : null;
      }
      return metrics[metricKey];
    };
    return {
      key,
      label: a?.label || b?.label || key,
      matched: Boolean(a && b),
      statusLeft: a?.status || "missing",
      statusRight: b?.status || "missing",
      metrics: metricKeys.map(([metricKey, label, unit]) => {
        const beforeValue = metricValue(aMetrics, metricKey);
        const afterValue = metricValue(bMetrics, metricKey);
        const before = a?.status === "completed" && Number.isFinite(beforeValue) ? beforeValue : null;
        const after = b?.status === "completed" && Number.isFinite(afterValue) ? afterValue : null;
        return { key: metricKey, label, unit, before, after, delta: before != null && after != null ? after - before : null };
      }),
    };
  });
  if (rows.some((row) => !row.matched)) warnings.push("Scenario sets differ; unmatched scenarios are identified and no deltas are fabricated.");
  if (rows.some((row) => row.metrics.some((metric) => metric.delta == null))) warnings.push("Some metrics are unavailable because a scenario did not complete or did not record that metric.");
  return { leftId: left.id, rightId: right.id, warnings, rows };
}
