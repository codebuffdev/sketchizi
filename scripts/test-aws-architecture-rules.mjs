import assert from "node:assert/strict";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import {
  architectureValidationRules,
  validateArchitecture,
} from "../src/features/architecture/architectureValidationService.js";
import { awsArchitectureRules } from "../src/features/architecture/awsArchitectureRules.js";
import { validateArchitectureWithAwsRules } from "../src/features/architecture/architectureValidationComposition.js";

function resourceElement(id, resourceId, service, resourceType = service.toLowerCase()) {
  return {
    id,
    type: "rectangle",
    customData: {
      awsResource: {
        awsResourceId: resourceId,
        definitionId: `aws:${resourceType}`,
        provider: "aws",
        service,
        resourceType,
        properties: { name: service },
      },
    },
  };
}

function relationshipElement(id, relationshipId, sourceResourceId, targetResourceId, relationshipType = "connects-to") {
  return {
    id,
    type: "arrow",
    customData: {
      awsRelationship: {
        relationshipId,
        sourceResourceId,
        targetResourceId,
        relationshipType,
      },
    },
  };
}

function graphFrom(elements) {
  return analyzeArchitectureGraph(elements);
}

function diagnosticsByCode(result, code) {
  return [...result.errors, ...result.warnings, ...result.info]
    .filter((diagnostic) => diagnostic.code === code);
}

const allRules = [...architectureValidationRules, ...awsArchitectureRules];

function validate(elements, rules = allRules) {
  return rules === allRules
    ? validateArchitecture(graphFrom(elements), rules)
    : validateArchitecture(graphFrom(elements), rules);
}

function validateComposed(elements) {
  return validateArchitectureWithAwsRules(graphFrom(elements));
}

function awsResource(id, resourceId, service) {
  return resourceElement(id, resourceId, service);
}

// 1. Valid API Gateway -> Lambda.
{
  const result = validate([
    awsResource("api", "api-1", "API Gateway"),
    awsResource("lambda", "lambda-1", "Lambda"),
    relationshipElement("r1", "rel-1", "api-1", "lambda-1", "invokes"),
  ]);

  assert.equal(diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP").length, 0);
}

// 2. Valid Lambda -> DynamoDB.
{
  const result = validate([
    awsResource("lambda", "lambda-1", "Lambda"),
    awsResource("ddb", "ddb-1", "DynamoDB"),
    relationshipElement("r1", "rel-1", "lambda-1", "ddb-1", "reads-from"),
  ]);

  assert.equal(diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP").length, 0);
}

// 3. CloudFront -> RDS is invalid.
{
  const result = validate([
    awsResource("cf", "cf-1", "CloudFront"),
    awsResource("rds", "rds-1", "RDS"),
    relationshipElement("r1", "rel-1", "cf-1", "rds-1"),
  ]);

  const diagnostics = diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
  assert.equal(diagnostics[0].relationshipId, "rel-1");
}

// 4. S3 -> RDS is invalid.
{
  const result = validate([
    awsResource("s3", "s3-1", "S3"),
    awsResource("rds", "rds-1", "RDS"),
    relationshipElement("r1", "rel-1", "s3-1", "rds-1"),
  ]);

  assert.equal(diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP").length, 1);
}

// 5. API Gateway -> DynamoDB is invalid.
{
  const result = validate([
    awsResource("api", "api-1", "API Gateway"),
    awsResource("ddb", "ddb-1", "DynamoDB"),
    relationshipElement("r1", "rel-1", "api-1", "ddb-1"),
  ]);

  assert.equal(diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP").length, 1);
}

// 6. DynamoDB -> DynamoDB is invalid.
{
  const result = validate([
    awsResource("ddb1", "ddb-1", "DynamoDB"),
    awsResource("ddb2", "ddb-2", "DynamoDB"),
    relationshipElement("r1", "rel-1", "ddb-1", "ddb-2"),
  ]);

  assert.equal(diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP").length, 1);
}

// 7. AWS resource with no relationships gets only the AWS warning.
{
  const result = validateComposed([
    awsResource("ec2", "ec2-1", "EC2"),
  ]);

  const awsDiagnostics = diagnosticsByCode(result, "AWS_ORPHAN_RESOURCE");
  const genericDiagnostics = diagnosticsByCode(result, "RESOURCE_HAS_NO_RELATIONSHIPS");
  assert.equal(awsDiagnostics.length, 1);
  assert.equal(awsDiagnostics[0].severity, "warning");
  assert.equal(genericDiagnostics.length, 0);
}

// 7b. Generic validation still reports orphan resources when no AWS rule applies.
{
  const graph = {
    resources: [{ resourceId: "generic-1" }],
    relationships: [],
  };
  const result = validateArchitecture(graph, architectureValidationRules);
  assert.equal(diagnosticsByCode(result, "RESOURCE_HAS_NO_RELATIONSHIPS").length, 1);
}

// 8. Multiple invalid relationships receive distinct deterministic diagnostics.
{
  const result = validate([
    awsResource("cf", "cf-1", "CloudFront"),
    awsResource("rds", "rds-1", "RDS"),
    awsResource("ddb", "ddb-1", "DynamoDB"),
    relationshipElement("r1", "rel-1", "cf-1", "rds-1"),
    relationshipElement("r2", "rel-2", "cf-1", "ddb-1"),
  ]);

  const diagnostics = diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP");
  assert.equal(diagnostics.length, 2);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.diagnosticId), [
    "AWS_INVALID_RELATIONSHIP||rel-1",
    "AWS_INVALID_RELATIONSHIP||rel-2",
  ]);
}

// 9. Rename stability.
{
  const before = validate([
    resourceElement("ec2", "ec2-1", "EC2", "compute-instance"),
  ]);
  const after = validate([
    {
      ...resourceElement("ec2", "ec2-1", "EC2", "compute-instance"),
      customData: {
        awsResource: {
          ...resourceElement("ec2", "ec2-1", "EC2", "compute-instance").customData.awsResource,
          properties: { name: "Renamed" },
        },
      },
    },
  ]);

  assert.equal(
    diagnosticsByCode(before, "AWS_ORPHAN_RESOURCE")[0].diagnosticId,
    diagnosticsByCode(after, "AWS_ORPHAN_RESOURCE")[0].diagnosticId,
  );
}

// 10. Movement stability.
{
  const before = validate([
    resourceElement("ec2", "ec2-1", "EC2", "compute-instance"),
  ]);
  const moved = {
    ...resourceElement("ec2", "ec2-1", "EC2", "compute-instance"),
    x: 900,
    y: 700,
  };
  const after = validate([moved]);

  assert.equal(
    diagnosticsByCode(before, "AWS_ORPHAN_RESOURCE")[0].diagnosticId,
    diagnosticsByCode(after, "AWS_ORPHAN_RESOURCE")[0].diagnosticId,
  );
}

// 11. Graph immutability.
{
  const graph = graphFrom([
    awsResource("cf", "cf-1", "CloudFront"),
    awsResource("rds", "rds-1", "RDS"),
    relationshipElement("r1", "rel-1", "cf-1", "rds-1"),
  ]);
  const before = JSON.stringify(graph);
  validateArchitecture(graph, allRules);
  assert.equal(JSON.stringify(graph), before);
}

// 12. Normal non-AWS elements produce no AWS diagnostics.
{
  const result = validate([
    { id: "rectangle", type: "rectangle" },
    { id: "arrow", type: "arrow", startBinding: null, endBinding: null },
  ]);

  assert.equal(diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP").length, 0);
  assert.equal(diagnosticsByCode(result, "AWS_INVALID_SEMANTIC_RELATIONSHIP").length, 0);
  assert.equal(diagnosticsByCode(result, "AWS_ORPHAN_RESOURCE").length, 0);
}

// 13. Duplicate execution is deterministic and contains no duplicate diagnostic IDs.
{
  const elements = [
    awsResource("cf", "cf-1", "CloudFront"),
    awsResource("rds", "rds-1", "RDS"),
    relationshipElement("r1", "rel-1", "cf-1", "rds-1", "invokes"),
  ];

  const first = validate(elements);
  const second = validate(elements);
  assert.deepEqual(first, second);

  const ids = [...first.errors, ...first.warnings, ...first.info].map((diagnostic) => diagnostic.diagnosticId);
  assert.equal(ids.length, new Set(ids).size);
}

// 14. Existing generic validation rules continue to work.
{
  const result = validate([
    awsResource("lambda", "lambda-1", "Lambda"),
    relationshipElement("r1", "rel-1", "lambda-1", "lambda-1", "invokes"),
  ]);

  assert.equal(diagnosticsByCode(result, "SELF_RELATIONSHIP").length, 1);
  assert.equal(diagnosticsByCode(result, "SELF_RELATIONSHIP")[0].severity, "warning");
}

// Semantic rule coverage: each requested CloudFront -> RDS semantic type is detected.
for (const type of ["invokes", "reads-from", "writes-to", "publishes-to", "subscribes-to"]) {
  const result = validate([
    awsResource("cf", "cf-1", "CloudFront"),
    awsResource("rds", "rds-1", "RDS"),
    relationshipElement("r1", `rel-${type}`, "cf-1", "rds-1", type),
  ]);

  assert.equal(diagnosticsByCode(result, "AWS_INVALID_SEMANTIC_RELATIONSHIP").length, 1);
}

console.log("AWS architecture rules tests: PASS");
