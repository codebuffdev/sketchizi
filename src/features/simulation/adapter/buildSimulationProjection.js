import { deriveSimulationScope } from "./deriveSimulationScope.js";
import {
  getComponentDefinition,
  getRelationDefinition,
  validateRelationEndpoints,
} from "../../workbench/workbenchModel.js";

/**
 * Sketchizi-owned, engine-neutral Simulation Intermediate Representation (SimIR).
 *
 * This module intentionally does not import Breakscale or any simulator UI/engine.
 * Its job is to compile explicit Workbench semantics into a deterministic runtime
 * projection. A later, separately tested engine adapter may translate SimIR into
 * a chosen simulation engine's native types.
 */
export const SIMIR_SCHEMA_VERSION = 1;
export const SIMULATION_PROFILE_SCHEMA_VERSION = 1;

const ENTITY_NODE_MAP = Object.freeze({
  "frontend.react-app": {
    kind: "traffic-source",
    profileKind: "traffic-source",
    required: { trafficRps: { type: "number", min: 0, exclusiveMin: true } },
  },
  "backend.rest-service": {
    kind: "request-service",
    profileKind: "request-service",
    required: {
      concurrency: { type: "integer", min: 1 },
      meanServiceMs: { type: "number", min: 0, exclusiveMin: true },
      serviceTimeCv: { type: "number", min: 0 },
      bufferCapacity: { type: "integer", min: 0 },
      failureProbability: { type: "number", min: 0, max: 1 },
      timeoutMs: { type: "number", min: 0 },
      retryAttempts: { type: "integer", min: 0 },
    },
  },
  "data.postgresql-database": {
    kind: "relational-store",
    profileKind: "relational-store",
    required: {
      concurrency: { type: "integer", min: 1 },
      meanServiceMs: { type: "number", min: 0, exclusiveMin: true },
      serviceTimeCv: { type: "number", min: 0 },
      bufferCapacity: { type: "integer", min: 0 },
      readFraction: { type: "number", min: 0, max: 1 },
      writeContentionMs: { type: "number", min: 0 },
      failureProbability: { type: "number", min: 0, max: 1 },
    },
  },
  "messaging.queue": {
    kind: "message-queue",
    profileKind: "message-queue",
    required: {
      bufferCapacity: { type: "integer", min: 1 },
      enqueueMs: { type: "number", min: 0 },
      failureProbability: { type: "number", min: 0, max: 1 },
    },
  },
  "backend.worker": {
    kind: "message-worker",
    profileKind: "message-worker",
    required: {
      concurrency: { type: "integer", min: 1 },
      processingTimeMs: { type: "number", min: 0, exclusiveMin: true },
      serviceTimeCv: { type: "number", min: 0 },
      bufferCapacity: { type: "integer", min: 0 },
      failureProbability: { type: "number", min: 0, max: 1 },
    },
  },
  "integrations.external-api": {
    kind: "external-service-approximation",
    profileKind: "external-service-approximation",
    required: {
      concurrency: { type: "integer", min: 1 },
      meanServiceMs: { type: "number", min: 0, exclusiveMin: true },
      serviceTimeCv: { type: "number", min: 0 },
      bufferCapacity: { type: "integer", min: 0 },
      failureProbability: { type: "number", min: 0, max: 1 },
      timeoutMs: { type: "number", min: 0 },
    },
    approximate: true,
  },
});

const NON_RUNTIME_ENTITY_KINDS = new Set([
  "backend.api-endpoint",
  "devops.deployment-target",
]);

const NON_RUNTIME_RELATIONS = new Set([
  "deploys-to",
  "authenticates-with",
  "depends-on",
]);

const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function diagnostic(code, severity, title, message, extras = {}) {
  return {
    code,
    severity,
    title,
    message,
    entityIds: [],
    relationIds: [],
    ...extras,
  };
}

function paramProblem(value, rule) {
  if (rule.type === "integer" && !Number.isSafeInteger(value)) return "must be a safe integer";
  if (rule.type === "number" && !finiteNumber(value)) return "must be a finite number";
  if (rule.min !== undefined && (value < rule.min || (rule.exclusiveMin && value === rule.min))) {
    return rule.exclusiveMin ? `must be greater than ${rule.min}` : `must be at least ${rule.min}`;
  }
  if (rule.max !== undefined && value > rule.max) return `must be at most ${rule.max}`;
  return null;
}

function detectDirectedCycle(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (edge.kind !== "request") continue;
    adjacency.get(edge.sourceId)?.push(edge.targetId);
  }
  const state = new Map();
  const stack = [];
  let cycle = null;
  const visit = (nodeId) => {
    if (state.get(nodeId) === 1) {
      const index = stack.indexOf(nodeId);
      cycle = [...stack.slice(index), nodeId];
      return true;
    }
    if (state.get(nodeId) === 2) return false;
    state.set(nodeId, 1);
    stack.push(nodeId);
    for (const next of (adjacency.get(nodeId) || []).slice().sort()) {
      if (visit(next)) return true;
    }
    stack.pop();
    state.set(nodeId, 2);
    return false;
  };
  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (visit(node.id)) return cycle;
  }
  return null;
}

/**
 * Compile a Workbench document and an explicit simulation profile to SimIR.
 * Output is deterministic; no random ids, clocks, canvas positions, UI state,
 * network calls, or engine/vendor types are used.
 */
export function buildSimulationProjection({ workbench, simulationProfile, scopeEntityIds, adapterVersion = "0.1.0" } = {}) {
  const diagnostics = [];
  const push = (item) => diagnostics.push(item);

  if (!isRecord(workbench) || !Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) {
    return {
      status: "blocked", topology: null,
      nodeMap: {}, edgeMap: {}, provenance: { adapterVersion, sourceModelRevision: null },
      diagnostics: [diagnostic("SIM-MODEL-INVALID", "blocker", "Invalid Workbench model", "A Workbench object with entities and relations arrays is required.")],
    };
  }
  if (!isRecord(simulationProfile) || simulationProfile.schemaVersion !== SIMULATION_PROFILE_SCHEMA_VERSION) {
    return {
      status: "blocked", topology: null,
      nodeMap: {}, edgeMap: {}, provenance: { adapterVersion, sourceModelRevision: workbench.modelRevision ?? null },
      diagnostics: [diagnostic("SIM-PROFILE-INVALID", "blocker", "Invalid simulation profile", `Simulation profile schemaVersion must be ${SIMULATION_PROFILE_SCHEMA_VERSION}.`)],
    };
  }

  const simulationScope = deriveSimulationScope(workbench, scopeEntityIds);
  const scopedWorkbench = simulationScope.workbench;
  const entities = scopedWorkbench.entities;
  const relations = scopedWorkbench.relations;
  const allProfiles = isRecord(simulationProfile.profilesByEntityId) ? simulationProfile.profilesByEntityId : {};
  const inScopeEntityIds = new Set(simulationScope.entityIds);
  const profiles = Object.fromEntries(Object.entries(allProfiles).filter(([entityId]) => inScopeEntityIds.has(entityId)));
  const scopedProfileForFingerprint = { ...simulationProfile, profilesByEntityId: profiles };
  const scenario = simulationProfile.defaultScenario;
  if (simulationScope.scoped && simulationScope.excludedEntityIds.length) {
    const excludedRuntimeEntities = workbench.entities.filter((entity) => simulationScope.excludedEntityIds.includes(entity.id) && ENTITY_NODE_MAP[entity.kind]);
    if (excludedRuntimeEntities.length) {
      push(diagnostic("SIM-OUTSIDE-ACTIVE-SCOPE", "info", "Runtime components outside the request path are excluded", `${excludedRuntimeEntities.map((entity) => entity.name || entity.id).join(", ")} ${excludedRuntimeEntities.length === 1 ? "is" : "are"} not in the active view's typed-connected request path from a React traffic source, or is not placed in this view. It remains in the engineering model but is excluded from this run. Add a supported typed runtime relationship to include it.`, { entityIds: excludedRuntimeEntities.map((entity) => entity.id) }));
    }
  }
  const entityById = new Map();
  const relationById = new Map();
  const nodeMap = {};
  const edgeMap = {};
  const nodes = [];
  const edges = [];
  const endpointOwners = new Map();
  const entityRuntimeKind = new Map();
  const requestRelationGroups = new Map();

  for (const entity of entities) {
    if (!entity || typeof entity.id !== "string" || !entity.id.trim()) {
      push(diagnostic("SIM-ENTITY-ID-MISSING", "blocker", "Component ID missing", "Every semantic component needs a stable non-empty ID."));
      continue;
    }
    if (entityById.has(entity.id)) {
      push(diagnostic("SIM-ENTITY-ID-DUPLICATE", "blocker", "Duplicate component ID", `Component ID '${entity.id}' occurs more than once.`, { entityIds: [entity.id] }));
      continue;
    }
    entityById.set(entity.id, entity);
  }

  for (const relation of relations) {
    if (!relation || typeof relation.id !== "string" || !relation.id.trim()) {
      push(diagnostic("SIM-RELATION-ID-MISSING", "blocker", "Relationship ID missing", "Every typed relationship needs a stable non-empty ID."));
      continue;
    }
    if (relationById.has(relation.id)) {
      push(diagnostic("SIM-RELATION-ID-DUPLICATE", "blocker", "Duplicate relationship ID", `Relationship ID '${relation.id}' occurs more than once.`, { relationIds: [relation.id] }));
      continue;
    }
    relationById.set(relation.id, relation);
  }

  // Index API endpoint ownership before calls are compiled.
  for (const relation of relationById.values()) {
    const source = entityById.get(relation.sourceId);
    const target = entityById.get(relation.targetId);
    if (!source || !target) {
      push(diagnostic("SIM-RELATION-DANGLING", "blocker", "Relationship endpoint is missing", `Relationship '${relation.id}' references a component not present in the model.`, { entityIds: [relation.sourceId, relation.targetId].filter(Boolean), relationIds: [relation.id] }));
      continue;
    }
    const endpointCheck = validateRelationEndpoints(relation.kind, source, target);
    if (!endpointCheck.valid) {
      push(diagnostic("SIM-RELATION-ENDPOINTS-INVALID", "blocker", "Invalid relationship endpoints", endpointCheck.reason, { entityIds: [source.id, target.id], relationIds: [relation.id] }));
      continue;
    }
    if (relation.kind === "exposes") {
      const owners = endpointOwners.get(target.id) || [];
      owners.push(source.id);
      endpointOwners.set(target.id, owners);
    }
    if (!getRelationDefinition(relation.kind)) {
      push(diagnostic("SIM-RELATION-KIND-UNKNOWN", "blocker", "Unknown relationship type", `Relationship '${relation.id}' uses unknown type '${relation.kind}'.`, { relationIds: [relation.id] }));
    }
  }

  for (const [endpointId, owners] of endpointOwners) {
    const unique = [...new Set(owners)].sort();
    if (unique.length !== 1) {
      push(diagnostic("SIM-ENDPOINT-OWNER-AMBIGUOUS", "blocker", "API endpoint has no unique owner", `Endpoint '${endpointId}' must be exposed by exactly one service before it can be used as a simulation target.`, { entityIds: [endpointId, ...unique] }));
    }
    endpointOwners.set(endpointId, unique);
  }

  // Compile runtime entities. Contract/deployment-only entities remain metadata.
  for (const entity of [...entityById.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const mapping = ENTITY_NODE_MAP[entity.kind];
    if (!mapping) {
      if (!NON_RUNTIME_ENTITY_KINDS.has(entity.kind)) {
        push(diagnostic("SIM-ENTITY-UNSUPPORTED", "info", "Component excluded from simulation", `Component '${entity.name || entity.id}' (${entity.kind}) has no runtime mapping in adapter ${adapterVersion}; it remains in the engineering model.`, { entityIds: [entity.id] }));
      }
      nodeMap[entity.id] = null;
      continue;
    }
    const profile = profiles[entity.id];
    if (!isRecord(profile)) {
      push(diagnostic("SIM-PROFILE-MISSING", "blocker", "Simulation profile required", `Provide an explicit ${mapping.profileKind} profile for '${entity.name || entity.id}'.`, { entityIds: [entity.id] }));
      nodeMap[entity.id] = null;
      continue;
    }
    if (profile.kind !== mapping.profileKind) {
      push(diagnostic("SIM-PROFILE-KIND-MISMATCH", "blocker", "Simulation profile type mismatch", `Component '${entity.id}' requires profile kind '${mapping.profileKind}', not '${String(profile.kind)}'.`, { entityIds: [entity.id] }));
      nodeMap[entity.id] = null;
      continue;
    }
    const params = isRecord(profile.parameters) ? profile.parameters : {};
    const invalidFields = [];
    const knownFields = new Set(Object.keys(mapping.required));
    for (const field of Object.keys(params)) {
      if (!knownFields.has(field)) invalidFields.push(`${field} is not supported by profile kind ${mapping.profileKind}`);
    }
    for (const [field, rule] of Object.entries(mapping.required)) {
      if (!Object.hasOwn(params, field)) {
        invalidFields.push(`${field} is required`);
        continue;
      }
      const problem = paramProblem(params[field], rule);
      if (problem) invalidFields.push(`${field} ${problem}`);
      const assumption = profile.assumptions?.[field];
      if (assumption && assumption.status !== "user-confirmed") {
        push(diagnostic("SIM-ASSUMPTION-UNCONFIRMED", "blocker", "Simulation assumption needs confirmation", `Confirm '${field}' for '${entity.name || entity.id}' before running the simulation.`, { entityIds: [entity.id], details: { field, assumptionStatus: assumption.status || "unspecified" } }));
      }
    }
    if (invalidFields.length) {
      push(diagnostic("SIM-PROFILE-PARAMETERS-INVALID", "blocker", "Simulation parameters are incomplete or invalid", `Profile for '${entity.name || entity.id}': ${invalidFields.join("; ")}.`, { entityIds: [entity.id] }));
      nodeMap[entity.id] = null;
      continue;
    }
    if (mapping.approximate) {
      push(diagnostic("SIM-EXTERNAL-APPROXIMATION", "warning", "External API is approximated", ` '${entity.name || entity.id}' is represented by a generic external-service behavior; these results are not measurements of the provider.`, { entityIds: [entity.id] }));
    }
    const nodeId = `sim-node:${entity.id}`;
    nodeMap[entity.id] = nodeId;
    entityRuntimeKind.set(entity.id, mapping.kind);
    nodes.push({
      id: nodeId,
      sourceEntityId: entity.id,
      kind: mapping.kind,
      label: String(entity.name || entity.id),
      parameters: structuredClone(params),
    });
  }

  const getNodeId = (entityId) => nodeMap[entityId] || null;
  const addEdge = ({ id, sourceId, targetId, kind, relationIds, parameters = {} }) => {
    const sourceNodeId = getNodeId(sourceId);
    const targetNodeId = getNodeId(targetId);
    if (!sourceNodeId || !targetNodeId) {
      push(diagnostic("SIM-EDGE-NODE-MISSING", "blocker", "Runtime edge cannot be mapped", `Relationship(s) ${relationIds.join(", ")} cannot map to two runtime nodes.`, { entityIds: [sourceId, targetId], relationIds }));
      return;
    }
    const sortedRelationIds = [...relationIds].sort();
    edges.push({
      id,
      sourceId: sourceNodeId,
      targetId: targetNodeId,
      kind,
      weight: 1,
      runtimeEndpointEntityIds: [sourceId, targetId],
      sourceRelationIds: sortedRelationIds,
      sourceRelationEndpoints: sortedRelationIds.map((relationId) => {
        const sourceRelation = relationById.get(relationId);
        return sourceRelation ? {
          relationId,
          sourceEntityId: sourceRelation.sourceId,
          targetEntityId: sourceRelation.targetId,
        } : { relationId, sourceEntityId: null, targetEntityId: null };
      }),
      parameters: structuredClone(parameters),
    });
    for (const relationId of relationIds) {
      edgeMap[relationId] = [...(edgeMap[relationId] || []), id];
    }
  };

  const requestPathCandidateCount = new Map();
  const addRequestCandidate = (relation, sourceId, targetId, edgeKey = null) => {
    const key = edgeKey || `request:${sourceId}:${targetId}`;
    const candidate = requestRelationGroups.get(key) || { key, sourceId, targetId, relationIds: [], relationKinds: [] };
    candidate.relationIds.push(relation.id);
    candidate.relationKinds.push(relation.kind);
    requestRelationGroups.set(key, candidate);
  };

  for (const relation of [...relationById.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!entityById.has(relation.sourceId) || !entityById.has(relation.targetId)) continue;
    const sourceEntity = entityById.get(relation.sourceId);
    const targetEntity = entityById.get(relation.targetId);
    if (relation.kind === "calls") {
      let resolvedTargetId = targetEntity.id;
      if (targetEntity.kind === "backend.api-endpoint") {
        const owners = endpointOwners.get(targetEntity.id) || [];
        if (owners.length !== 1) {
          push(diagnostic("SIM-ENDPOINT-OWNER-MISSING", "blocker", "Cannot resolve API endpoint", `Call relationship '${relation.id}' targets an endpoint without exactly one exposing service.`, { entityIds: [sourceEntity.id, targetEntity.id], relationIds: [relation.id] }));
          continue;
        }
        resolvedTargetId = owners[0];
      }
      addRequestCandidate(relation, sourceEntity.id, resolvedTargetId);
    } else if (relation.kind === "reads" || relation.kind === "writes") {
      const key = `database-access:${sourceEntity.id}:${targetEntity.id}`;
      addRequestCandidate(relation, sourceEntity.id, targetEntity.id, key);
    } else if (relation.kind === "publishes") {
      addEdge({ id: `sim-edge:enqueue:${relation.id}`, sourceId: sourceEntity.id, targetId: targetEntity.id, kind: "enqueue", relationIds: [relation.id], parameters: { asynchronous: true } });
    } else if (relation.kind === "subscribes") {
      // Workbench expresses worker -> queue intent; runtime message flow is queue -> worker.
      addEdge({ id: `sim-edge:consume:${relation.id}`, sourceId: targetEntity.id, targetId: sourceEntity.id, kind: "consume", relationIds: [relation.id], parameters: { asynchronous: true, sourceOrientation: "worker-subscribes-to-queue" } });
    } else if (relation.kind === "exposes") {
      // Contract ownership was consumed by the endpoint resolution index above.
      // It is not an edge and must not be reported as discarded metadata.
    } else if (NON_RUNTIME_RELATIONS.has(relation.kind)) {
      push(diagnostic("SIM-RELATION-EXCLUDED", "info", "Relationship excluded from runtime projection", `Relationship '${relation.id}' (${relation.kind}) is valid engineering metadata but does not create a runtime traffic edge in this adapter version.`, { entityIds: [sourceEntity.id, targetEntity.id], relationIds: [relation.id] }));
    } else if (relation.kind !== "calls" && relation.kind !== "reads" && relation.kind !== "writes") {
      push(diagnostic("SIM-RELATION-UNMAPPED", "blocker", "Relationship has no simulation semantics", `Relationship '${relation.id}' (${relation.kind}) is not mapped by adapter ${adapterVersion}.`, { entityIds: [sourceEntity.id, targetEntity.id], relationIds: [relation.id] }));
    }
  }

  for (const group of [...requestRelationGroups.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const isDatabaseGroup = group.key.startsWith("database-access:");
    const operations = {
      reads: group.relationKinds.includes("reads"),
      writes: group.relationKinds.includes("writes"),
    };
    const edgeKind = "request";
    const edgeId = isDatabaseGroup
      ? `sim-edge:database-access:${group.sourceId}->${group.targetId}`
      : `sim-edge:request:${group.sourceId}->${group.targetId}`;
    addEdge({
      id: edgeId,
      sourceId: group.sourceId,
      targetId: group.targetId,
      kind: edgeKind,
      relationIds: group.relationIds,
      parameters: isDatabaseGroup ? { operation: "database-access", ...operations } : { operation: "request" },
    });
  }

  // Branching means fan-out in the engine-neutral IR. Require explicit intent on every
  // branch; otherwise the engine could call multiple alternatives on every request.
  for (const edge of edges.filter((item) => item.kind === "request")) {
    requestPathCandidateCount.set(edge.sourceId, (requestPathCandidateCount.get(edge.sourceId) || 0) + 1);
  }
  for (const edge of edges.filter((item) => item.kind === "request")) {
    if ((requestPathCandidateCount.get(edge.sourceId) || 0) > 1) {
      const relationsForEdge = edge.sourceRelationIds.map((id) => relationById.get(id)).filter(Boolean);
      const unspecified = relationsForEdge.filter((relation) => relation.properties?.invocation !== "required");
      if (unspecified.length) {
        push(diagnostic("SIM-ROUTING-AMBIGUOUS", "blocker", "Request branching is ambiguous", `Runtime component '${edge.sourceId}' has multiple outgoing request paths; mark each modeled required fan-out relationship with properties.invocation = 'required', or model explicit routing semantics.`, { entityIds: [edge.runtimeEndpointEntityIds[0]], relationIds: unspecified.map((item) => item.id) }));
      }
    }
  }

  const cycle = detectDirectedCycle(nodes, edges);
  if (cycle) {
    push(diagnostic("SIM-SYNC-CYCLE", "blocker", "Synchronous request cycle detected", `The current adapter does not simulate recursive request cycles. Cycle: ${cycle.join(" → ")}.`, { entityIds: cycle.map((nodeId) => nodes.find((node) => node.id === nodeId)?.sourceEntityId).filter(Boolean) }));
  }

  const clients = nodes.filter((node) => node.kind === "traffic-source");
  if (!clients.length) {
    push(diagnostic("SIM-TRAFFIC-MISSING", "blocker", "Traffic source required", "Add a React client with a confirmed traffic profile before running a request simulation."));
  }
  for (const client of clients) {
    if (!(client.parameters.trafficRps > 0)) {
      push(diagnostic("SIM-TRAFFIC-MISSING", "blocker", "Positive traffic required", `Traffic source '${client.sourceEntityId}' must offer more than 0 requests/second.`, { entityIds: [client.sourceEntityId] }));
    }
  }
  if (!isRecord(scenario) || !Number.isSafeInteger(scenario.durationMs) || scenario.durationMs <= 0 || !Number.isSafeInteger(scenario.seed)) {
    push(diagnostic("SIM-SCENARIO-INVALID", "blocker", "Invalid simulation scenario", "defaultScenario requires a positive integer durationMs and a safe-integer seed."));
  }

  const severityRank = { blocker: 0, warning: 1, info: 2 };
  diagnostics.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
    || a.code.localeCompare(b.code)
    || a.message.localeCompare(b.message));

  const blockers = diagnostics.some((item) => item.severity === "blocker");
  const topology = blockers ? null : {
    schemaVersion: SIMIR_SCHEMA_VERSION,
    semantics: "sketchizi-runtime-ir",
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
    scenario: { durationMs: scenario.durationMs, seed: scenario.seed },
  };
  return {
    status: blockers ? "blocked" : "ready",
    topology,
    nodeMap,
    edgeMap,
    provenance: {
      adapterVersion,
      sourceModelRevision: Number.isSafeInteger(workbench.modelRevision) ? workbench.modelRevision : null,
      sourceModelFingerprint: fingerprint({
        schemaVersion: scopedWorkbench.schemaVersion ?? null,
        entities: [...entities].sort((a, b) => String(a?.id).localeCompare(String(b?.id))),
        relations: [...relations].sort((a, b) => String(a?.id).localeCompare(String(b?.id))),
      }),
      simulationProfileFingerprint: fingerprint(scopedProfileForFingerprint),
      scopeEntityIds: simulationScope.entityIds,
      scopeSeedEntityIds: simulationScope.seedEntityIds,
      scopeRootEntityIds: simulationScope.rootEntityIds,
      scopeViewEntityIds: simulationScope.viewEntityIds,
      scoped: simulationScope.scoped,
      activeViewIgnored: !simulationScope.scoped,
      engineIndependent: true,
    },
    diagnostics,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function fingerprint(value) {
  // Synchronous deterministic non-cryptographic fingerprint. This is identity/provenance,
  // not a security digest; experiment archival can add SHA-256 in a later persistence layer.
  const text = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const SIMULATION_MAPPING_REFERENCE = Object.freeze({
  entityKinds: Object.freeze({ ...ENTITY_NODE_MAP }),
  nonRuntimeEntityKinds: Object.freeze([...NON_RUNTIME_ENTITY_KINDS]),
  nonRuntimeRelationKinds: Object.freeze([...NON_RUNTIME_RELATIONS]),
});
