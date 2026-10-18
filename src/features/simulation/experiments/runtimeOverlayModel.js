/**
 * Converts completed synthetic simulation output into safe, view-scoped canvas overlays.
 * No values are inferred from canvas arrows or generated from interpolated metrics.
 */
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const clone = (value) => structuredClone(value);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}
const stableStringify = (value) => JSON.stringify(stableValue(value));

function semanticSnapshotMatches(snapshot, workbench) {
  if (!snapshot || !workbench) return false;
  const prior = { entities: snapshot.entities || [], relations: snapshot.relations || [] };
  const current = {
    entities: (workbench.entities || []).map((entity) => ({
      id: entity.id, kind: entity.kind, name: entity.name || entity.id, properties: isRecord(entity.properties) ? entity.properties : {},
    })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    relations: (workbench.relations || []).map((relation) => ({
      id: relation.id, kind: relation.kind, sourceId: relation.sourceId, targetId: relation.targetId,
      properties: isRecord(relation.properties) ? relation.properties : {},
    })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
  return stableStringify(prior) === stableStringify(current);
}

/** Build an overlay model only from a completed, current, selected scenario. */
export function buildRuntimeOverlayModel({ results, activeRunKey, workbench, activeViewId, stale = false, investigation = null } = {}) {
  if (stale || !results || !workbench || !activeViewId) return null;
  const run = results.runs?.[activeRunKey];
  const engineResult = run?.result?.result;
  if (run?.result?.status !== "completed" || !isRecord(engineResult) || !Array.isArray(engineResult.perNode)) return null;

  const modelRevision = results.provenance?.modelRevision ?? results.modelRevision ?? results.sourceModelSnapshot?.modelRevision ?? null;
  if (modelRevision === null || modelRevision !== (workbench.modelRevision ?? null)) return null;
  const modelSnapshot = results.sourceModelSnapshot;
  if (modelSnapshot && !semanticSnapshotMatches(modelSnapshot, workbench)) return null;
  const scopedIds = Array.isArray(results.provenance?.scopeEntityIds)
    ? results.provenance.scopeEntityIds
    : Array.isArray(results.runScopeEntityIds) ? results.runScopeEntityIds : null;

  const entityById = new Map((workbench.entities || []).map((entity) => [entity.id, entity]));
  const included = scopedIds ? new Set(scopedIds) : null;
  const nodes = engineResult.perNode.flatMap((node) => {
    const entityId = node?.sourceEntityId;
    const entity = entityById.get(entityId);
    if (!entity || (included && !included.has(entityId))) return [];
    return [{
      entityId,
      name: entity.name || node.label || entityId,
      kind: node.kind,
      utilization: isFiniteNumber(node.utilization) ? Math.max(0, Math.min(1, node.utilization)) : null,
      arrivals: isFiniteNumber(node.arrivals) ? node.arrivals : null,
      failed: isFiniteNumber(node.failed) ? node.failed : 0,
      dropped: isFiniteNumber(node.dropped) ? node.dropped : 0,
      queueWaitP95Ms: isFiniteNumber(node.queueWaitMs?.p95) ? node.queueWaitMs.p95 : null,
      serviceTimeP95Ms: isFiniteNumber(node.serviceTimeMs?.p95) ? node.serviceTimeMs.p95 : null,
    }];
  });

  // The engine records arrival events by interval, but the traffic source is not a
  // processing node in perNode. Add one source badge only when exactly one source
  // is in scope, using the observed arrivals in this run's time series.
  const sourceEntities = (workbench.entities || []).filter((entity) => entity.kind === "frontend.react-app" && (!included || included.has(entity.id)));
  const points = engineResult.timeSeries?.points;
  const observationWindowMs = engineResult.timeSeries?.observationWindowMs;
  if (sourceEntities.length === 1 && Array.isArray(points) && points.length && isFiniteNumber(observationWindowMs) && observationWindowMs > 0) {
    const offeredRequests = points.reduce((sum, point) => sum + (isFiniteNumber(point.offeredRequests) ? point.offeredRequests : 0), 0);
    nodes.unshift({
      entityId: sourceEntities[0].id,
      name: sourceEntities[0].name || sourceEntities[0].id,
      kind: "traffic-source",
      utilization: null,
      arrivals: offeredRequests,
      offeredRps: offeredRequests / (observationWindowMs / 1000),
      failed: 0,
      dropped: 0,
      queueWaitP95Ms: null,
      serviceTimeP95Ms: null,
    });
  }

  // Highlight a trace target only when the selection resolves back to this
  // completed scenario's retained trace and exact entity hop.
  let traceFocus = null;
  if (investigation && investigation.scenarioKey === activeRunKey) {
    const trace = engineResult.requestTraces?.traces?.find((item) => item.requestId === investigation.requestId);
    const hop = trace?.hops?.[investigation.hopIndex];
    if (trace && hop && hop.entityId === investigation.entityId && entityById.has(hop.entityId)) {
      traceFocus = {
        requestId: trace.requestId,
        entityId: hop.entityId,
        hopIndex: investigation.hopIndex,
        componentLabel: hop.label || entityById.get(hop.entityId)?.name || hop.entityId,
        reason: investigation.reason,
        startMs: isFiniteNumber(hop.arrivalMs) ? hop.arrivalMs : null,
        endMs: isFiniteNumber(hop.outcomeAtMs) ? hop.outcomeAtMs : isFiniteNumber(hop.serviceCompletedAtMs) ? hop.serviceCompletedAtMs : null,
      };
    }
  }

  return {
    modelRevision,
    activeViewId,
    scenarioKey: activeRunKey,
    scenarioLabel: String(run.label || activeRunKey),
    runFingerprint: engineResult.simulation?.runFingerprint || null,
    observationWindowMs: engineResult.timeSeries?.observationWindowMs ?? engineResult.metrics?.observationWindowMs ?? null,
    sourceModelSnapshot: modelSnapshot ? clone(modelSnapshot) : null,
    traceFocus,
    nodes,
  };
}

export function runtimeOverlayIsCurrent(overlay, workbench, activeViewId) {
  if (!overlay || !workbench || overlay.modelRevision !== (workbench.modelRevision ?? null)) return false;
  if (overlay.activeViewId !== activeViewId || activeViewId !== workbench.activeViewId) return false;
  return !overlay.sourceModelSnapshot || semanticSnapshotMatches(overlay.sourceModelSnapshot, workbench);
}

/** Presentation labels are derived strictly from returned engine metrics. */
export function describeRuntimeOverlayNode(node) {
  if (node?.kind === "traffic-source") {
    return {
      tone: "source",
      statusLabel: "TRAFFIC SOURCE",
      detail: isFiniteNumber(node.offeredRps) ? `${node.offeredRps.toFixed(1)} req/s offered` : `${node.arrivals ?? "—"} offered`,
    };
  }
  if (!node || !isRecord(node)) return { tone: "unknown", statusLabel: "NO METRICS", detail: "No component metrics available" };
  if (node.dropped > 0) {
    const detail = [isFiniteNumber(node.utilization) ? `${(node.utilization * 100).toFixed(1)}% busy` : null, `${Math.round(node.dropped).toLocaleString()} dropped`].filter(Boolean).join(" · ");
    return { tone: "pressure", statusLabel: "CAPACITY PRESSURE", detail };
  }
  if (node.failed > 0) {
    return { tone: "failure", statusLabel: "FAILURES OBSERVED", detail: `${Math.round(node.failed).toLocaleString()} failed${isFiniteNumber(node.utilization) ? ` · ${(node.utilization * 100).toFixed(1)}% busy` : ""}` };
  }
  if (isFiniteNumber(node.utilization) && node.utilization >= 0.8) {
    return { tone: "warning", statusLabel: "HIGH UTILIZATION", detail: `${(node.utilization * 100).toFixed(1)}% busy` };
  }
  if (isFiniteNumber(node.utilization)) {
    const wait = isFiniteNumber(node.queueWaitP95Ms) ? ` · queue p95 ${node.queueWaitP95Ms.toFixed(1)} ms` : "";
    return { tone: "ok", statusLabel: "NO PRESSURE SIGNAL", detail: `${(node.utilization * 100).toFixed(1)}% busy${wait}` };
  }
  return { tone: "unknown", statusLabel: "NO METRICS", detail: "The engine returned no component utilization" };
}
