const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}
const stableStringify = (value) => JSON.stringify(stableValue(value));

function flattenLeaves(value, prefix = "", out = {}) {
  if (isRecord(value) && Object.keys(value).length) {
    for (const key of Object.keys(value).sort()) flattenLeaves(value[key], prefix ? `${prefix}.${key}` : key, out);
  } else if (Array.isArray(value) && value.length && value.every((item) => isRecord(item) || Array.isArray(item))) {
    value.forEach((item, index) => flattenLeaves(item, `${prefix}[${index}]`, out));
  } else if (prefix) out[prefix] = value;
  return out;
}

function changedFields(before, after) {
  const left = flattenLeaves(before || {});
  const right = flattenLeaves(after || {});
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((path) => stableStringify(left[path]) !== stableStringify(right[path]))
    .sort();
}

function entitySignature(entity) {
  return { kind: entity?.kind ?? null, name: entity?.name ?? entity?.id ?? "", properties: isRecord(entity?.properties) ? entity.properties : {} };
}
function relationSignature(relation) {
  return { kind: relation?.kind ?? null, sourceId: relation?.sourceId ?? null, targetId: relation?.targetId ?? null, properties: isRecord(relation?.properties) ? relation.properties : {} };
}

/** Compare two semantic Workbench snapshots, independent of array and object-key order. */
export function architectureSnapshotsMatch(left, right) {
  if (!left || !right || !Array.isArray(left.entities) || !Array.isArray(right.entities) || !Array.isArray(left.relations) || !Array.isArray(right.relations)) return false;
  const semantic = (snapshot) => ({
    entities: snapshot.entities.slice().sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || ""))),
    relations: snapshot.relations.slice().sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || ""))),
  });
  return stableStringify(semantic(left)) === stableStringify(semantic(right));
}

function compareMetric(label, key, beforeMetrics, afterMetrics, read = (metrics) => metrics?.[key], lowerIsBetter = false) {
  const before = read(beforeMetrics);
  const after = read(afterMetrics);
  if (!finite(before) || !finite(after)) return { key, label, before: finite(before) ? before : null, after: finite(after) ? after : null, delta: null, deltaPercent: null, direction: "unavailable" };
  const delta = Number((after - before).toFixed(4));
  const deltaPercent = before === 0 ? (after === 0 ? 0 : null) : Number(((after - before) / Math.abs(before) * 100).toFixed(2));
  const improved = delta === 0 ? "unchanged" : (lowerIsBetter ? (delta < 0 ? "improved" : "regressed") : (delta > 0 ? "improved" : "regressed"));
  return { key, label, before, after, delta, deltaPercent, direction: improved };
}

function normalizeIds(value) {
  return Array.isArray(value) ? [...new Set(value)].sort() : null;
}
function sameIds(left, right) {
  const a = normalizeIds(left);
  const b = normalizeIds(right);
  if (a === null || b === null) return a === null && b === null;
  return stableStringify(a) === stableStringify(b);
}

/**
 * Build an architecture-change report between a saved experiment's source model
 * and the current proposed model. Any simulation comparison is explicitly gated
 * by model freshness, and only treated as like-for-like when profile and scope match.
 */
export function buildArchitectureChangeImpact({
  baselineSnapshot,
  proposedSnapshot,
  baselineMetrics = null,
  proposedMetrics = null,
  proposedResultsMatchModel = false,
  baselineProfileFingerprint = null,
  proposedProfileFingerprint = null,
  baselineScopeEntityIds = null,
  proposedScopeEntityIds = null,
} = {}) {
  const empty = { added: [], removed: [], modified: [] };
  if (!baselineSnapshot || !Array.isArray(baselineSnapshot.entities) || !Array.isArray(baselineSnapshot.relations)) {
    return { status: "unavailable", reason: "The selected saved experiment does not contain a semantic model snapshot.", entityChanges: { ...empty }, relationChanges: { ...empty }, changes: [], affectedEntityIds: [], changedEntityIds: [], changedRelationIds: [], simulation: { status: "unavailable", reason: "No baseline model snapshot is available." }, changeCount: 0 };
  }
  if (!proposedSnapshot || !Array.isArray(proposedSnapshot.entities) || !Array.isArray(proposedSnapshot.relations)) {
    return { status: "unavailable", reason: "The current architecture model is unavailable.", entityChanges: { ...empty }, relationChanges: { ...empty }, changes: [], affectedEntityIds: [], changedEntityIds: [], changedRelationIds: [], simulation: { status: "unavailable", reason: "The current model is unavailable." }, changeCount: 0 };
  }

  const baselineEntities = new Map(baselineSnapshot.entities.filter((item) => item?.id).map((item) => [item.id, item]));
  const proposedEntities = new Map(proposedSnapshot.entities.filter((item) => item?.id).map((item) => [item.id, item]));
  const baselineRelations = new Map(baselineSnapshot.relations.filter((item) => item?.id).map((item) => [item.id, item]));
  const proposedRelations = new Map(proposedSnapshot.relations.filter((item) => item?.id).map((item) => [item.id, item]));
  const entityChanges = { added: [], removed: [], modified: [] };
  const relationChanges = { added: [], removed: [], modified: [] };
  const changedEntityIds = new Set();
  const changedRelationIds = new Set();
  const changes = [];

  for (const [id, entity] of proposedEntities) {
    const before = baselineEntities.get(id);
    if (!before) {
      const item = { id, label: entity.name || id, kind: entity.kind || "unknown", fields: ["added"], before: null, after: entity };
      entityChanges.added.push(item); changedEntityIds.add(id);
      changes.push({ id: `entity-added:${id}`, subjectType: "Component", action: "Added", subjectId: id, label: item.label, detail: `${entity.kind || "Component"} added to the proposed architecture`, fields: item.fields, entityIds: [id] });
    } else if (stableStringify(entitySignature(before)) !== stableStringify(entitySignature(entity))) {
      const fields = changedFields(entitySignature(before), entitySignature(entity));
      const item = { id, label: entity.name || id, kind: entity.kind || "unknown", fields, before, after: entity };
      entityChanges.modified.push(item); changedEntityIds.add(id);
      changes.push({ id: `entity-modified:${id}`, subjectType: "Component", action: "Modified", subjectId: id, label: item.label, detail: `Changed: ${fields.join(", ")}`, fields, entityIds: [id] });
    }
  }
  for (const [id, entity] of baselineEntities) {
    if (proposedEntities.has(id)) continue;
    const item = { id, label: entity.name || id, kind: entity.kind || "unknown", fields: ["removed"], before: entity, after: null };
    entityChanges.removed.push(item); changedEntityIds.add(id);
    changes.push({ id: `entity-removed:${id}`, subjectType: "Component", action: "Removed", subjectId: id, label: item.label, detail: `${entity.kind || "Component"} removed from the proposed architecture`, fields: item.fields, entityIds: [id] });
  }

  const nameFor = (id) => proposedEntities.get(id)?.name || baselineEntities.get(id)?.name || id || "unknown component";
  for (const [id, relation] of proposedRelations) {
    const before = baselineRelations.get(id);
    const endpoints = [relation.sourceId, relation.targetId].filter(Boolean);
    if (!before) {
      const item = { id, label: `${nameFor(relation.sourceId)} → ${nameFor(relation.targetId)}`, kind: relation.kind || "unknown", fields: ["added"], before: null, after: relation };
      relationChanges.added.push(item); changedRelationIds.add(id); endpoints.forEach((endpoint) => changedEntityIds.add(endpoint));
      changes.push({ id: `relation-added:${id}`, subjectType: "Relationship", action: "Added", subjectId: id, label: item.label, detail: `Typed relationship '${relation.kind || "unknown"}' added`, fields: item.fields, entityIds: endpoints, relationId: id });
    } else if (stableStringify(relationSignature(before)) !== stableStringify(relationSignature(relation))) {
      const fields = changedFields(relationSignature(before), relationSignature(relation));
      const allEndpoints = [...new Set([before.sourceId, before.targetId, relation.sourceId, relation.targetId].filter(Boolean))];
      const item = { id, label: `${nameFor(relation.sourceId)} → ${nameFor(relation.targetId)}`, kind: relation.kind || "unknown", fields, before, after: relation };
      relationChanges.modified.push(item); changedRelationIds.add(id); allEndpoints.forEach((endpoint) => changedEntityIds.add(endpoint));
      changes.push({ id: `relation-modified:${id}`, subjectType: "Relationship", action: "Modified", subjectId: id, label: item.label, detail: `Typed relationship changed: ${fields.join(", ")}`, fields, entityIds: allEndpoints, relationId: id });
    }
  }
  for (const [id, relation] of baselineRelations) {
    if (proposedRelations.has(id)) continue;
    const endpoints = [relation.sourceId, relation.targetId].filter(Boolean);
    const item = { id, label: `${nameFor(relation.sourceId)} → ${nameFor(relation.targetId)}`, kind: relation.kind || "unknown", fields: ["removed"], before: relation, after: null };
    relationChanges.removed.push(item); changedRelationIds.add(id); endpoints.forEach((endpoint) => changedEntityIds.add(endpoint));
    changes.push({ id: `relation-removed:${id}`, subjectType: "Relationship", action: "Removed", subjectId: id, label: item.label, detail: `Typed relationship '${relation.kind || "unknown"}' removed`, fields: item.fields, entityIds: endpoints, relationId: id });
  }

  const entitySort = (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  Object.values(entityChanges).forEach((items) => items.sort(entitySort));
  Object.values(relationChanges).forEach((items) => items.sort(entitySort));
  changes.sort((a, b) => a.subjectType.localeCompare(b.subjectType) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  let simulation;
  if (!proposedResultsMatchModel) {
    simulation = { status: "stale-or-unavailable", reason: "Run or rerun the simulation on the current proposed architecture before comparing outcomes. Existing results do not match the current model snapshot." };
  } else if (!baselineMetrics || !proposedMetrics) {
    simulation = { status: "unavailable", reason: "Completed baseline and proposed simulation metrics are both required." };
  } else if (!sameIds(baselineScopeEntityIds, proposedScopeEntityIds)) {
    simulation = { status: "context-mismatch", reason: "The saved baseline and current results use different or unspecified component scopes; metric deltas are withheld." };
  } else if (!baselineProfileFingerprint || !proposedProfileFingerprint || baselineProfileFingerprint !== proposedProfileFingerprint) {
    simulation = { status: "context-mismatch", reason: "Simulation profile fingerprints differ or are missing. The metric values are not shown as an architecture-only comparison because assumptions may also have changed." };
  } else {
    const metrics = [
      compareMetric("Successful throughput", "throughputRps", baselineMetrics, proposedMetrics),
      compareMetric("p95 successful latency", "p95LatencyMs", baselineMetrics, proposedMetrics, (value) => value?.successfulLatencyMs?.p95 ?? value?.terminalLatencyMs?.p95, true),
      compareMetric("Success rate", "successRate", baselineMetrics, proposedMetrics),
      compareMetric("Dropped requests", "droppedRequests", baselineMetrics, proposedMetrics, undefined, true),
      compareMetric("Failed requests", "failedRequests", baselineMetrics, proposedMetrics, undefined, true),
    ];
    simulation = { status: "comparable", reason: "Both runs use matching profile fingerprints and component scopes. Outputs are still synthetic simulation results, not production measurements.", metrics };
  }

  return {
    status: changes.length ? "changed" : "identical",
    reason: changes.length ? `${changes.length} semantic change(s) detected between the selected saved model and the current model.` : "No semantic changes detected between the selected saved model and the current model.",
    entityChanges,
    relationChanges,
    changes,
    changedEntityIds: [...changedEntityIds].sort(),
    changedRelationIds: [...changedRelationIds].sort(),
    affectedEntityIds: [...changedEntityIds].filter((id) => proposedEntities.has(id)).sort(),
    changeCount: changes.length,
    simulation,
  };
}
