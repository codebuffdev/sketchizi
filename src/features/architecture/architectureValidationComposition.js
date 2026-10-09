import { architectureValidationRules, validateArchitecture } from "./architectureValidationService.js";
import { awsArchitectureRules } from "./awsArchitectureRules.js";
import { kubernetesArchitectureRules } from "./kubernetesArchitectureRules.js";
import { networkingArchitectureRules } from "./networkingArchitectureRules.js";

function isProviderOrphanDiagnostic(diagnostic, code) {
  return diagnostic?.code === code && Boolean(diagnostic.resourceId);
}

function isGenericOrphanDiagnostic(diagnostic) {
  return diagnostic?.code === "RESOURCE_HAS_NO_RELATIONSHIPS" && Boolean(diagnostic.resourceId);
}

function enrichDiagnosticsWithGraphContext(result, graph) {
  const relationships = Array.isArray(graph?.relationships) ? graph.relationships : [];
  const resources = Array.isArray(graph?.resources) ? graph.resources : [];

  const findRelationship = (diagnostic) => relationships.find((relationship) =>
    relationship.relationshipId === diagnostic.relationshipId &&
    (!diagnostic.provider || relationship.provider === diagnostic.provider)
  );
  const findResource = (diagnostic) => resources.find((resource) =>
    resource.resourceId === diagnostic.resourceId &&
    (!diagnostic.provider || resource.provider === diagnostic.provider)
  );

  const enrich = (diagnostic) => {
    const relationship = diagnostic.relationshipId ? findRelationship(diagnostic) : null;
    const resource = diagnostic.resourceId ? findResource(diagnostic) : null;
    const sourceResource = relationship
      ? resources.find((candidate) =>
        candidate.provider === (relationship.sourceProvider || relationship.provider) && candidate.resourceId === relationship.sourceResourceId
      )
      : null;
    const targetResource = relationship
      ? resources.find((candidate) =>
        candidate.provider === (relationship.targetProvider || relationship.provider) && candidate.resourceId === relationship.targetResourceId
      )
      : null;
    const provider = diagnostic.provider || relationship?.provider || resource?.provider || null;

    return {
      ...diagnostic,
      ...(provider ? { provider } : {}),
      ...(relationship ? {
        sourceResourceId: relationship.sourceResourceId,
        targetResourceId: relationship.targetResourceId,
        relationshipType: relationship.relationshipType,
        ...(sourceResource?.resourceType ? { sourceResourceType: sourceResource.resourceType } : {}),
        ...(targetResource?.resourceType ? { targetResourceType: targetResource.resourceType } : {}),
      } : {}),
    };
  };

  return {
    errors: result.errors.map(enrich),
    warnings: result.warnings.map(enrich),
    info: result.info.map(enrich),
  };
}

function deduplicateProviderSpecificDiagnostics(result) {
  const providerOrphanResourceIds = new Set(
    [...result.errors, ...result.warnings, ...result.info]
      .filter((diagnostic) =>
        isProviderOrphanDiagnostic(diagnostic, "AWS_ORPHAN_RESOURCE") ||
        isProviderOrphanDiagnostic(diagnostic, "KUBERNETES_ORPHAN_RESOURCE"),
      )
      .map((diagnostic) => diagnostic.resourceId),
  );

  const filterDiagnostics = (diagnostics) => diagnostics.filter((diagnostic) => {
    if (!isGenericOrphanDiagnostic(diagnostic)) return true;
    return !providerOrphanResourceIds.has(diagnostic.resourceId);
  });

  return {
    errors: filterDiagnostics(result.errors),
    warnings: filterDiagnostics(result.warnings),
    info: filterDiagnostics(result.info),
  };
}

export function validateArchitectureWithProviderRules(graph) {
  const result = validateArchitecture(graph, [
    ...architectureValidationRules,
    ...awsArchitectureRules,
    ...kubernetesArchitectureRules,
    ...networkingArchitectureRules,
  ]);

  return deduplicateProviderSpecificDiagnostics(enrichDiagnosticsWithGraphContext(result, graph));
}


export function validateArchitectureWithAwsRules(graph) {
  return validateArchitectureWithProviderRules(graph);
}
