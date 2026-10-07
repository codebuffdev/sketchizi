import { AWS_RELATIONSHIP_TYPES } from "../aws-relationships/awsRelationshipService.js";
import { KUBERNETES_RELATIONSHIP_TYPES } from "../kubernetes-relationships/kubernetesRelationshipService.js";

export const VALIDATION_SEVERITIES = Object.freeze(["error", "warning", "info"]);

const VALID_RELATIONSHIP_TYPES_BY_PROVIDER = Object.freeze({
  aws: new Set(AWS_RELATIONSHIP_TYPES),
  kubernetes: new Set(KUBERNETES_RELATIONSHIP_TYPES),
});

function createDiagnostic({ code, severity, message, resourceId = null, relationshipId = null }) {
  const identity = [code, resourceId || "", relationshipId || ""].join("|");

  return {
    code,
    severity,
    message,
    ...(resourceId ? { resourceId } : {}),
    ...(relationshipId ? { relationshipId } : {}),
    diagnosticId: identity,
  };
}

function relationshipsForResource(graph, resourceId) {
  return graph.relationships.filter(
    (relationship) =>
      relationship.sourceResourceId === resourceId ||
      relationship.targetResourceId === resourceId,
  );
}

function validateOrphanResources(graph) {
  const diagnostics = [];

  for (const resource of graph.resources) {
    if (relationshipsForResource(graph, resource.resourceId).length === 0) {
      diagnostics.push(createDiagnostic({
        code: "RESOURCE_HAS_NO_RELATIONSHIPS",
        severity: "info",
        message: resource.provider === "kubernetes"
          ? "Kubernetes resource has no relationships."
          : "AWS resource has no relationships.",
        resourceId: resource.resourceId,
      }));
    }
  }

  return diagnostics;
}

function validateSelfRelationships(graph) {
  const diagnostics = [];

  for (const relationship of graph.relationships) {
    if (relationship.sourceResourceId === relationship.targetResourceId) {
      diagnostics.push(createDiagnostic({
        code: "SELF_RELATIONSHIP",
        severity: "warning",
        message: "Relationship source and target resources are the same.",
        relationshipId: relationship.relationshipId,
      }));
    }
  }

  return diagnostics;
}

function validateDuplicateRelationshipIdentity(graph) {
  const diagnostics = [];
  const relationshipIds = new Set();
  const reportedIds = new Set();

  for (const relationship of graph.relationships) {
    const relationshipId = relationship.relationshipId;
    const identity = `${relationship.provider || "unknown"}:${relationshipId}`;
    if (relationshipIds.has(identity) && !reportedIds.has(identity)) {
      diagnostics.push(createDiagnostic({
        code: "DUPLICATE_RELATIONSHIP_ID",
        severity: "error",
        message: "Relationship ID is duplicated in the architecture graph.",
        relationshipId,
      }));
      reportedIds.add(identity);
      continue;
    }

    relationshipIds.add(identity);
  }

  return diagnostics;
}

function validateRelationshipEndpoints(graph) {
  const diagnostics = [];
  const resourceKeys = new Set(
    graph.resources.map((resource) => `${resource.provider || "unknown"}:${resource.resourceId}`),
  );

  for (const relationship of graph.relationships) {
    const provider = relationship.provider || "unknown";
    const hasSource = resourceKeys.has(`${provider}:${relationship.sourceResourceId}`);
    const hasTarget = resourceKeys.has(`${provider}:${relationship.targetResourceId}`);

    if (!hasSource || !hasTarget) {
      diagnostics.push(createDiagnostic({
        code: "INVALID_RELATIONSHIP_ENDPOINT",
        severity: "error",
        message: "Relationship source or target resource does not exist in the architecture graph.",
        relationshipId: relationship.relationshipId,
      }));
    }
  }

  return diagnostics;
}

function validateRelationshipTypes(graph) {
  const diagnostics = [];

  for (const relationship of graph.relationships) {
    if (relationship.provider === "kubernetes") continue;

    const validTypes = VALID_RELATIONSHIP_TYPES_BY_PROVIDER[relationship.provider] || new Set(AWS_RELATIONSHIP_TYPES);
    if (!validTypes.has(relationship.relationshipType)) {
      diagnostics.push(createDiagnostic({
        code: "UNKNOWN_RELATIONSHIP_TYPE",
        severity: "error",
        message: "Relationship type is not supported.",
        relationshipId: relationship.relationshipId,
      }));
    }
  }

  return diagnostics;
}

export const architectureValidationRules = Object.freeze([
  Object.freeze({ id: "orphan-resource", validate: validateOrphanResources }),
  Object.freeze({ id: "self-relationship", validate: validateSelfRelationships }),
  Object.freeze({ id: "duplicate-relationship-id", validate: validateDuplicateRelationshipIdentity }),
  Object.freeze({ id: "relationship-endpoint", validate: validateRelationshipEndpoints }),
  Object.freeze({ id: "relationship-type", validate: validateRelationshipTypes }),
]);

function normalizeRules(rules) {
  return Array.isArray(rules) ? rules.filter((rule) => rule && typeof rule.validate === "function") : architectureValidationRules;
}

function deduplicateDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const identity = diagnostic.diagnosticId || [
      diagnostic.code,
      diagnostic.resourceId || "",
      diagnostic.relationshipId || "",
    ].join("|");

    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function validateArchitecture(graph, rules = architectureValidationRules) {
  const safeGraph = graph && typeof graph === "object" ? graph : {};
  const safeResources = Array.isArray(safeGraph.resources) ? safeGraph.resources : [];
  const safeRelationships = Array.isArray(safeGraph.relationships) ? safeGraph.relationships : [];
  const normalizedGraph = {
    ...safeGraph,
    resources: safeResources,
    relationships: safeRelationships,
  };

  const diagnostics = normalizeRules(rules).flatMap((rule) => {
    const result = rule.validate(normalizedGraph);
    return Array.isArray(result) ? result : [];
  });

  const uniqueDiagnostics = deduplicateDiagnostics(diagnostics);

  return {
    errors: uniqueDiagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    warnings: uniqueDiagnostics.filter((diagnostic) => diagnostic.severity === "warning"),
    info: uniqueDiagnostics.filter((diagnostic) => diagnostic.severity === "info"),
  };
}
