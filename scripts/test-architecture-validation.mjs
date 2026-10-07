import assert from "node:assert/strict";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import {
  architectureValidationRules,
  validateArchitecture,
} from "../src/features/architecture/architectureValidationService.js";
import { validateArchitectureWithAwsRules } from "../src/features/architecture/architectureValidationComposition.js";

function resourceElement(id, resourceId, definitionId, service, resourceType, properties = {}) {
  return {
    id,
    type: "rectangle",
    customData: {
      awsResource: {
        awsResourceId: resourceId,
        definitionId,
        provider: "aws",
        service,
        resourceType,
        properties,
      },
    },
  };
}

function relationshipElement(id, relationshipId, sourceResourceId, targetResourceId, relationshipType) {
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
  return [...result.errors, ...result.warnings, ...result.info].filter(
    (diagnostic) => diagnostic.code === code,
  );
}

// TEST A — API Gateway -> Lambda -> DynamoDB has no integrity errors.
{
  const graph = graphFrom([
    resourceElement("api", "api-1", "aws:api-gateway", "API Gateway", "api"),
    resourceElement("lambda", "lambda-1", "aws:lambda", "Lambda", "function"),
    resourceElement("ddb", "ddb-1", "aws:dynamodb", "DynamoDB", "table"),
    relationshipElement("r1", "rel-1", "api-1", "lambda-1", "invokes"),
    relationshipElement("r2", "rel-2", "lambda-1", "ddb-1", "reads-from"),
  ]);

  const result = validateArchitecture(graph);
  assert.equal(result.errors.length, 0);
  assert.equal(diagnosticsByCode(result, "SELF_RELATIONSHIP").length, 0);
  assert.equal(diagnosticsByCode(result, "DUPLICATE_RELATIONSHIP_ID").length, 0);
}

// TEST B — isolated EC2 produces informational orphan diagnostic.
{
  const graph = graphFrom([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
  ]);

  const result = validateArchitecture(graph);
  const diagnostics = diagnosticsByCode(result, "RESOURCE_HAS_NO_RELATIONSHIPS");

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "info");
  assert.equal(result.info.length, 1);
}

// TEST C — Lambda -> Lambda produces a warning.
{
  const graph = graphFrom([
    resourceElement("lambda", "lambda-1", "aws:lambda", "Lambda", "function"),
    relationshipElement("r1", "rel-1", "lambda-1", "lambda-1", "invokes"),
  ]);

  const result = validateArchitecture(graph);
  const diagnostics = diagnosticsByCode(result, "SELF_RELATIONSHIP");

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "warning");
  assert.equal(result.warnings.length, 1);
}

// TEST D — duplicate relationship identity is an error.
{
  const graph = {
    resources: [
      { resourceId: "ec2-1" },
      { resourceId: "rds-1" },
      { resourceId: "ddb-1" },
    ],
    relationships: [
      {
        relationshipId: "rel-1",
        sourceResourceId: "ec2-1",
        targetResourceId: "rds-1",
        relationshipType: "depends-on",
      },
      {
        relationshipId: "rel-1",
        sourceResourceId: "ec2-1",
        targetResourceId: "ddb-1",
        relationshipType: "writes-to",
      },
    ],
  };

  const result = validateArchitecture(graph);
  const diagnostics = diagnosticsByCode(result, "DUPLICATE_RELATIONSHIP_ID");

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
  assert.equal(result.errors.length, 1);
}

// TEST E — invalid relationship type is an error.
{
  const graph = {
    resources: [
      { resourceId: "lambda-1" },
      { resourceId: "ddb-1" },
    ],
    relationships: [
      {
        relationshipId: "rel-1",
        sourceResourceId: "lambda-1",
        targetResourceId: "ddb-1",
        relationshipType: "not-a-real-type",
      },
    ],
  };

  const result = validateArchitecture(graph);
  const diagnostics = diagnosticsByCode(result, "UNKNOWN_RELATIONSHIP_TYPE");

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
}

// TEST F — multiple diagnostics are separated by severity.
{
  const graph = {
    resources: [
      { resourceId: "ec2-1" },
      { resourceId: "lambda-1" },
    ],
    relationships: [
      {
        relationshipId: "rel-1",
        sourceResourceId: "lambda-1",
        targetResourceId: "lambda-1",
        relationshipType: "invalid-type",
      },
      {
        relationshipId: "rel-2",
        sourceResourceId: "lambda-1",
        targetResourceId: "missing-resource",
        relationshipType: "invokes",
      },
    ],
  };

  const result = validateArchitecture(graph);

  assert.equal(result.errors.length, 2);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.info.length, 1);
  assert.equal(result.errors.some((diagnostic) => diagnostic.code === "INVALID_RELATIONSHIP_ENDPOINT"), true);
  assert.equal(result.errors.some((diagnostic) => diagnostic.code === "UNKNOWN_RELATIONSHIP_TYPE"), true);
  assert.equal(result.warnings[0].code, "SELF_RELATIONSHIP");
  assert.equal(result.info[0].code, "RESOURCE_HAS_NO_RELATIONSHIPS");
}

// TEST G — diagnostic identity remains stable across rename and move.
{
  const before = validateArchitecture(graphFrom([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance", { name: "Original" }),
  ]));
  const afterRename = validateArchitecture(graphFrom([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance", { name: "Renamed" }),
  ]));
  const afterMove = validateArchitecture(graphFrom([
    {
      ...resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
      x: 900,
      y: 700,
    },
  ]));

  assert.equal(before.info[0].diagnosticId, afterRename.info[0].diagnosticId);
  assert.equal(before.info[0].diagnosticId, afterMove.info[0].diagnosticId);
}

// TEST H — validation does not mutate the architecture graph.
{
  const graph = {
    resources: [
      { resourceId: "lambda-1" },
      { resourceId: "ddb-1" },
    ],
    relationships: [
      {
        relationshipId: "rel-1",
        sourceResourceId: "lambda-1",
        targetResourceId: "ddb-1",
        relationshipType: "reads-from",
      },
    ],
  };
  const before = JSON.stringify(graph);
  validateArchitecture(graph);
  assert.equal(JSON.stringify(graph), before);
}

// TEST I — duplicate diagnostics are deterministically deduplicated.
{
  const duplicateRule = {
    id: "duplicate-test",
    validate: () => [
      {
        code: "TEST_DUPLICATE",
        severity: "warning",
        message: "Duplicate diagnostic.",
        resourceId: "resource-1",
        diagnosticId: "TEST_DUPLICATE|resource-1|",
      },
      {
        code: "TEST_DUPLICATE",
        severity: "warning",
        message: "Duplicate diagnostic.",
        resourceId: "resource-1",
        diagnosticId: "TEST_DUPLICATE|resource-1|",
      },
    ],
  };

  const result = validateArchitecture({ resources: [], relationships: [] }, [duplicateRule]);
  assert.equal(result.warnings.length, 1);
}

// TEST J — rules can be enabled/disabled by supplying a rule set.
{
  const onlyOrphanRule = architectureValidationRules.filter((rule) => rule.id === "orphan-resource");
  const graph = graphFrom([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    relationshipElement("r1", "rel-1", "ec2-1", "ec2-1", "invokes"),
  ]);

  const result = validateArchitecture(graph, onlyOrphanRule);
  assert.equal(result.info.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.errors.length, 0);
}

console.log("AWS architecture validation tests: PASS");

function kubernetesResource(resourceId, resourceType) {
  return {
    resourceId,
    resourceKey: `kubernetes:${resourceId}`,
    definitionId: `k8s:${resourceType}`,
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType,
    properties: { name: resourceType },
  };
}

function kubernetesRelationship(relationshipId, sourceResourceId, targetResourceId, relationshipType) {
  return {
    relationshipId,
    provider: "kubernetes",
    sourceResourceId,
    targetResourceId,
    relationshipType,
  };
}

function validateKubernetesGraph(resources, relationships) {
  return validateArchitectureWithAwsRules({ resources, relationships });
}

// K5 TEST 1 — Deployment -> Pod with schedules is valid.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("deployment-1", "deployment"), kubernetesResource("pod-1", "pod")],
    [kubernetesRelationship("rel-1", "deployment-1", "pod-1", "schedules")],
  );
  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
}

// K6 data exposure — diagnostics retain provider and relationship context for UI presentation.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("deployment-1", "deployment"), kubernetesResource("pod-1", "pod")],
    [kubernetesRelationship("rel-1", "deployment-1", "pod-1", "contains")],
  );
  const diagnostic = diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP")[0];
  assert.equal(diagnostic.provider, "kubernetes");
  assert.equal(diagnostic.relationshipId, "rel-1");
  assert.equal(diagnostic.sourceResourceId, "deployment-1");
  assert.equal(diagnostic.targetResourceId, "pod-1");
  assert.equal(diagnostic.relationshipType, "contains");
  assert.equal(diagnostic.sourceResourceType, "deployment");
  assert.equal(diagnostic.targetResourceType, "pod");
}

// K6 data exposure — AWS diagnostics also identify their provider.
{
  const result = validateKubernetesGraph(
    [
      { resourceId: "cloudfront-1", provider: "aws", service: "CloudFront" },
      { resourceId: "rds-1", provider: "aws", service: "RDS" },
    ],
    [{ relationshipId: "aws-rel-1", provider: "aws", sourceResourceId: "cloudfront-1", targetResourceId: "rds-1", relationshipType: "invokes" }],
  );
  const diagnostic = diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP")[0];
  assert.equal(diagnostic.provider, "aws");
  assert.equal(diagnostic.relationshipId, "aws-rel-1");
}

// K5 TEST 2 — StatefulSet -> Pod with schedules is valid.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("statefulset-1", "statefulset"), kubernetesResource("pod-1", "pod")],
    [kubernetesRelationship("rel-1", "statefulset-1", "pod-1", "schedules")],
  );
  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
}

// K5 TEST 3 — DaemonSet -> Pod with schedules is valid.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("daemonset-1", "daemonset"), kubernetesResource("pod-1", "pod")],
    [kubernetesRelationship("rel-1", "daemonset-1", "pod-1", "schedules")],
  );
  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
}

// K5 TEST 4 — Service -> Pod with exposes is valid.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("service-1", "service"), kubernetesResource("pod-1", "pod")],
    [kubernetesRelationship("rel-1", "service-1", "pod-1", "exposes")],
  );
  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
}

// K5 TEST 5 — Pod -> Node with runs-on is valid.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("pod-1", "pod"), kubernetesResource("node-1", "node")],
    [kubernetesRelationship("rel-1", "pod-1", "node-1", "runs-on")],
  );
  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
}

// K5 TESTS 6-11 — All contains mappings are valid.
for (const [sourceType, targetType] of [
  ["cluster", "namespace"],
  ["namespace", "pod"],
  ["namespace", "deployment"],
  ["namespace", "statefulset"],
  ["namespace", "daemonset"],
  ["namespace", "service"],
]) {
  const result = validateKubernetesGraph(
    [kubernetesResource("source-1", sourceType), kubernetesResource("target-1", targetType)],
    [kubernetesRelationship("rel-1", "source-1", "target-1", "contains")],
  );
  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
}

// K5 TEST 12 — connects-to is valid between any two Kubernetes resources.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("node-1", "node"), kubernetesResource("service-1", "service")],
    [kubernetesRelationship("rel-1", "node-1", "service-1", "connects-to")],
  );
  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
}

// K5 TESTS 13-18 — Invalid semantic pairs are errors.
for (const [sourceType, targetType, relationshipType] of [
  ["deployment", "pod", "contains"],
  ["service", "pod", "schedules"],
  ["pod", "node", "exposes"],
  ["node", "pod", "runs-on"],
  ["cluster", "pod", "contains"],
  ["pod", "service", "exposes"],
]) {
  const result = validateKubernetesGraph(
    [kubernetesResource("source-1", sourceType), kubernetesResource("target-1", targetType)],
    [kubernetesRelationship("rel-1", "source-1", "target-1", relationshipType)],
  );
  const diagnostics = diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
}

// K5 TEST 19 — Kubernetes self relationship uses the existing generic warning.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("pod-1", "pod")],
    [kubernetesRelationship("rel-1", "pod-1", "pod-1", "connects-to")],
  );
  assert.equal(diagnosticsByCode(result, "SELF_RELATIONSHIP").length, 1);
  assert.equal(result.warnings.length, 1);
}

// K5 TEST 20 — Kubernetes orphan produces the Kubernetes-specific informational diagnostic.
{
  const result = validateKubernetesGraph([kubernetesResource("pod-1", "pod")], []);
  const diagnostics = diagnosticsByCode(result, "KUBERNETES_ORPHAN_RESOURCE");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "info");
  assert.equal(diagnosticsByCode(result, "RESOURCE_HAS_NO_RELATIONSHIPS").length, 0);
}

// K5 TEST 21 — Duplicate Kubernetes relationship ID uses the existing generic duplicate rule.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("pod-1", "pod"), kubernetesResource("node-1", "node")],
    [
      kubernetesRelationship("rel-1", "pod-1", "node-1", "runs-on"),
      kubernetesRelationship("rel-1", "node-1", "pod-1", "connects-to"),
    ],
  );
  const diagnostics = diagnosticsByCode(result, "DUPLICATE_RELATIONSHIP_ID");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
}

// K5 TEST 22 — Missing Kubernetes endpoint uses the existing generic endpoint diagnostic.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("pod-1", "pod")],
    [kubernetesRelationship("rel-1", "pod-1", "missing-node", "runs-on")],
  );
  const diagnostics = diagnosticsByCode(result, "INVALID_RELATIONSHIP_ENDPOINT");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
}

// K5 TEST 23 — Unsupported Kubernetes relationship type is a Kubernetes-specific error.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("pod-1", "pod"), kubernetesResource("node-1", "node")],
    [kubernetesRelationship("rel-1", "pod-1", "node-1", "unsupported")],
  );
  const diagnostics = diagnosticsByCode(result, "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
}

// K5 TEST 24 — Duplicate Kubernetes resource identity is an error when exposed by a graph result.
{
  const result = validateKubernetesGraph(
    [kubernetesResource("pod-1", "pod"), kubernetesResource("pod-1", "pod")],
    [],
  );
  const diagnostics = diagnosticsByCode(result, "KUBERNETES_DUPLICATE_RESOURCE_ID");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
}

// K5 TEST 25 — Mixed AWS + Kubernetes architecture validates each provider independently.
{
  const result = validateKubernetesGraph(
    [
      { resourceId: "aws-ec2", provider: "aws", service: "EC2", resourceType: "compute-instance" },
      kubernetesResource("deployment-1", "deployment"),
      kubernetesResource("pod-1", "pod"),
      kubernetesResource("node-1", "node"),
      kubernetesResource("service-1", "service"),
    ],
    [
      kubernetesRelationship("k8s-rel-1", "deployment-1", "pod-1", "schedules"),
      kubernetesRelationship("k8s-rel-2", "service-1", "pod-1", "exposes"),
      kubernetesRelationship("k8s-rel-3", "pod-1", "node-1", "runs-on"),
    ],
  );

  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
  assert.equal(diagnosticsByCode(result, "AWS_INVALID_RELATIONSHIP").length, 0);
  assert.equal(diagnosticsByCode(result, "KUBERNETES_ORPHAN_RESOURCE").length, 0);
}

// K5 TEST 26 — Kubernetes semantic rules do not cross-contaminate AWS relationships.
{
  const result = validateKubernetesGraph(
    [
      { resourceId: "deployment-1", provider: "aws", service: "Deployment", resourceType: "deployment" },
      { resourceId: "pod-1", provider: "aws", service: "Pod", resourceType: "pod" },
    ],
    [{
      relationshipId: "aws-rel-1",
      provider: "aws",
      sourceResourceId: "deployment-1",
      targetResourceId: "pod-1",
      relationshipType: "contains",
    }],
  );

  assert.equal(diagnosticsByCode(result, "KUBERNETES_INVALID_RELATIONSHIP").length, 0);
  assert.equal(diagnosticsByCode(result, "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE").length, 0);
}

console.log("K5 Kubernetes architecture validation tests: PASS");
