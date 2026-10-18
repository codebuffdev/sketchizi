import { getComponentDefinition, validateRelationEndpoints } from "./workbenchModel.js";
import { WORKBENCH_RELATIONS } from "./workbenchRegistry.js";

/**
 * Deterministic semantic checks for a Workbench model. These rules identify
 * missing or contradictory modeled information; they do not claim that a
 * deployment is operational or that unmodeled behavior is impossible.
 */
export function validateWorkbench(workbench) {
  if (!workbench || typeof workbench !== "object") return [];
  const entities = Array.isArray(workbench.entities) ? workbench.entities : [];
  const relations = Array.isArray(workbench.relations) ? workbench.relations : [];
  const findings = [];
  const entityById = new Map();
  const relationIds = new Set();
  const entityCounts = new Map();
  const push = (finding) => findings.push({
    id: `${finding.code}:${(finding.entityIds || []).join(",")}:${(finding.relationIds || []).join(",")}:${findings.length}`,
    severity: "warning",
    entityIds: [],
    relationIds: [],
    ...finding,
  });

  for (const entity of entities) {
    if (!entity?.id) {
      push({ code: "entity.missing-id", severity: "error", title: "Component has no ID", message: "A semantic component is missing its stable ID." });
      continue;
    }
    entityCounts.set(entity.id, (entityCounts.get(entity.id) || 0) + 1);
    if (!entityById.has(entity.id)) entityById.set(entity.id, entity);
  }
  for (const [id, count] of entityCounts) {
    if (count > 1) push({ code: "entity.duplicate-id", severity: "error", title: "Duplicate component ID", message: `Component ID ${id} is used ${count} times.`, entityIds: [id] });
  }

  const relationKeys = new Map();
  const inboundExposes = new Map();
  const subscriptionsByQueue = new Map();
  const subscriptionsByWorker = new Map();
  const deploymentsByEntity = new Map();
  const endpointSignatures = new Map();

  for (const relation of relations) {
    if (!relation?.id) {
      push({ code: "relation.missing-id", severity: "error", title: "Relationship has no ID", message: "A typed relationship is missing its stable ID." });
    } else if (relationIds.has(relation.id)) {
      push({ code: "relation.duplicate-id", severity: "error", title: "Duplicate relationship ID", message: `Relationship ID ${relation.id} is used more than once.`, relationIds: [relation.id] });
    } else {
      relationIds.add(relation.id);
    }

    const source = entityById.get(relation?.sourceId);
    const target = entityById.get(relation?.targetId);
    if (!source || !target) {
      push({ code: "relation.dangling-endpoint", severity: "error", title: "Relationship references a missing component", message: `Relationship ${relation?.id || "(no ID)"} points to a component that is not in the model.`, entityIds: [relation?.sourceId, relation?.targetId].filter(Boolean), relationIds: relation?.id ? [relation.id] : [] });
      continue;
    }

    const endpointCheck = validateRelationEndpoints(relation.kind, source, target);
    if (!endpointCheck.valid) {
      push({ code: "relation.invalid-endpoints", severity: "error", title: "Invalid relationship endpoints", message: endpointCheck.reason, entityIds: [source.id, target.id], relationIds: relation?.id ? [relation.id] : [] });
    }

    const key = `${relation.kind}:${relation.sourceId}:${relation.targetId}`;
    if (relationKeys.has(key)) {
      push({ code: "relation.duplicate", severity: "warning", title: "Duplicate relationship", message: `The same ${WORKBENCH_RELATIONS.find((item) => item.kind === relation.kind)?.label || relation.kind} relationship is modeled more than once.`, entityIds: [source.id, target.id], relationIds: [relationKeys.get(key), relation.id].filter(Boolean) });
    } else relationKeys.set(key, relation.id);

    if (relation.kind === "exposes") inboundExposes.set(target.id, (inboundExposes.get(target.id) || 0) + 1);
    if (relation.kind === "subscribes") {
      subscriptionsByQueue.set(target.id, (subscriptionsByQueue.get(target.id) || 0) + 1);
      subscriptionsByWorker.set(source.id, (subscriptionsByWorker.get(source.id) || 0) + 1);
    }
    if (relation.kind === "deploys-to") deploymentsByEntity.set(source.id, (deploymentsByEntity.get(source.id) || 0) + 1);
  }

  // Contract completeness: an endpoint should be exposed by one service.
  for (const entity of entities) {
    if (!entity?.id) continue;
    if (entity.kind === "backend.api-endpoint") {
      const exposureCount = inboundExposes.get(entity.id) || 0;
      if (exposureCount === 0) {
        push({ code: "api-endpoint.unexposed", severity: "warning", title: "API endpoint has no exposing service", message: "Connect a REST service to this endpoint with an Exposes API relationship. This is a model-completeness warning, not proof that the endpoint is unavailable at runtime.", entityIds: [entity.id], suggestedAction: "Add an Exposes API relationship" });
      } else if (exposureCount > 1) {
        push({ code: "api-endpoint.multiple-services", severity: "warning", title: "API endpoint has multiple exposing services", message: `This endpoint is linked from ${exposureCount} REST services. Confirm that the ownership is intentional.`, entityIds: [entity.id], suggestedAction: "Review endpoint ownership" });
      }
      const method = String(entity.properties?.method || "GET").toUpperCase();
      const path = String(entity.properties?.path || "").trim();
      if (path) {
        const signature = `${method} ${path}`;
        const existing = endpointSignatures.get(signature);
        if (existing) push({ code: "api-endpoint.duplicate-operation", severity: "warning", title: "Duplicate API operation", message: `More than one endpoint uses ${signature}. Check for an accidental duplicate operation.`, entityIds: [existing, entity.id], suggestedAction: "Rename or consolidate the endpoint" });
        else endpointSignatures.set(signature, entity.id);
      }
    }

    if (entity.kind === "backend.rest-service" && !(deploymentsByEntity.get(entity.id) > 0)) {
      push({ code: "service.no-deployment", severity: "warning", title: "REST service has no deployment target", message: "No Deploys to relationship is modeled for this service. Add one when its runtime destination is known.", entityIds: [entity.id], suggestedAction: "Add a deployment target" });
    }
    if (entity.kind === "backend.worker" && !(subscriptionsByWorker.get(entity.id) > 0)) {
      push({ code: "worker.no-subscription", severity: "warning", title: "Worker has no queue subscription", message: "No Subscribes to relationship is modeled for this worker. If it processes asynchronous jobs, connect it to its queue.", entityIds: [entity.id], suggestedAction: "Connect a queue" });
    }
    if (entity.kind === "messaging.queue" && !(subscriptionsByQueue.get(entity.id) > 0)) {
      push({ code: "queue.no-consumer", severity: "warning", title: "Queue has no modeled consumer", message: "No worker subscribes to this queue. Add a consumer if messages are expected to be processed.", entityIds: [entity.id], suggestedAction: "Add a worker subscription" });
    }
  }

  const severityRank = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
    || a.code.localeCompare(b.code)
    || a.id.localeCompare(b.id));
}
