const AWS_INVALID_RELATIONSHIPS = new Set([
  "CloudFront->RDS",
  "CloudFront->DynamoDB",
  "S3->RDS",
  "S3->DynamoDB",
  "API Gateway->RDS",
  "API Gateway->DynamoDB",
  "DynamoDB->DynamoDB",
]);

const AWS_INVALID_SEMANTIC_RELATIONSHIPS = new Map([
  ["CloudFront->RDS", new Set([
    "invokes",
    "reads-from",
    "writes-to",
    "publishes-to",
    "subscribes-to",
  ])],
]);

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

function resourceService(graph, resourceId) {
  return graph.resources.find((resource) => resource.resourceId === resourceId)?.service || null;
}

function relationshipKey(sourceService, targetService) {
  return `${sourceService}->${targetService}`;
}

function validateInvalidAwsRelationships(graph) {
  const diagnostics = [];

  for (const relationship of graph.relationships) {
    const sourceService = resourceService(graph, relationship.sourceResourceId);
    const targetService = resourceService(graph, relationship.targetResourceId);

    if (!sourceService || !targetService) continue;

    const key = relationshipKey(sourceService, targetService);
    if (!AWS_INVALID_RELATIONSHIPS.has(key)) continue;

    diagnostics.push(createDiagnostic({
      code: "AWS_INVALID_RELATIONSHIP",
      severity: "error",
      message: `AWS relationship ${sourceService} -> ${targetService} is not supported by the initial architecture rules.`,
      relationshipId: relationship.relationshipId,
    }));
  }

  return diagnostics;
}

function validateInvalidSemanticRelationships(graph) {
  const diagnostics = [];

  for (const relationship of graph.relationships) {
    const sourceService = resourceService(graph, relationship.sourceResourceId);
    const targetService = resourceService(graph, relationship.targetResourceId);

    if (!sourceService || !targetService) continue;

    const invalidTypes = AWS_INVALID_SEMANTIC_RELATIONSHIPS.get(
      relationshipKey(sourceService, targetService),
    );

    if (!invalidTypes?.has(relationship.relationshipType)) continue;

    diagnostics.push(createDiagnostic({
      code: "AWS_INVALID_SEMANTIC_RELATIONSHIP",
      severity: "error",
      message: `AWS relationship type ${relationship.relationshipType} is not supported for ${sourceService} -> ${targetService}.`,
      relationshipId: relationship.relationshipId,
    }));
  }

  return diagnostics;
}

function validateAwsOrphans(graph) {
  const diagnostics = [];
  const relationshipResourceIds = new Set();

  for (const relationship of graph.relationships) {
    relationshipResourceIds.add(relationship.sourceResourceId);
    relationshipResourceIds.add(relationship.targetResourceId);
  }

  for (const resource of graph.resources) {
    if (relationshipResourceIds.has(resource.resourceId)) continue;

    diagnostics.push(createDiagnostic({
      code: "AWS_ORPHAN_RESOURCE",
      severity: "warning",
      message: "AWS resource has no relationships.",
      resourceId: resource.resourceId,
    }));
  }

  return diagnostics;
}

export const awsArchitectureRules = Object.freeze([
  Object.freeze({ id: "aws-invalid-relationship", validate: validateInvalidAwsRelationships }),
  Object.freeze({ id: "aws-invalid-semantic-relationship", validate: validateInvalidSemanticRelationships }),
  Object.freeze({ id: "aws-orphan-resource", validate: validateAwsOrphans }),
]);
