import assert from "node:assert/strict";
import {
  analyzeArchitectureGraph,
  getIncomingRelationships,
  getOutgoingRelationships,
  getRelationshipsForResource,
  getResource,
  getResourceNeighbors,
} from "../src/features/architecture/architectureGraphService.js";

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

function normalRectangle(id) {
  return { id, type: "rectangle" };
}

function normalArrow(id) {
  return { id, type: "arrow", startBinding: null, endBinding: null };
}

function assertNoThrow(fn) {
  assert.doesNotThrow(fn);
}

// TEST A — API Gateway -> Lambda -> DynamoDB
{
  const graph = analyzeArchitectureGraph([
    resourceElement("api", "api-1", "aws:api-gateway", "API Gateway", "api"),
    resourceElement("lambda", "lambda-1", "aws:lambda", "Lambda", "function"),
    resourceElement("ddb", "ddb-1", "aws:dynamodb", "DynamoDB", "table"),
    relationshipElement("r1", "rel-1", "api-1", "lambda-1", "invokes"),
    relationshipElement("r2", "rel-2", "lambda-1", "ddb-1", "reads-from"),
  ]);

  assert.equal(graph.resources.length, 3);
  assert.equal(graph.relationships.length, 2);
  assert.equal(graph.diagnostics.length, 0);
}

// TEST B — EC2 depends-on RDS
{
  const graph = analyzeArchitectureGraph([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    resourceElement("rds", "rds-1", "aws:rds", "RDS", "database-instance"),
    relationshipElement("r1", "rel-1", "ec2-1", "rds-1", "depends-on"),
  ]);

  assert.equal(graph.resources.length, 2);
  assert.equal(graph.relationships.length, 1);
  assert.equal(graph.relationships[0].relationshipType, "depends-on");
}

// TEST C — EC2 -> normal Rectangle must not create a relationship.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    normalRectangle("rectangle"),
    normalArrow("normal-arrow"),
  ]);

  assert.equal(graph.resources.length, 1);
  assert.equal(graph.relationships.length, 0);
  assert.equal(graph.diagnostics.length, 0);
}

// TEST D — multiple relationships between the same resources.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("lambda", "lambda-1", "aws:lambda", "Lambda", "function"),
    resourceElement("ddb", "ddb-1", "aws:dynamodb", "DynamoDB", "table"),
    relationshipElement("r1", "rel-1", "lambda-1", "ddb-1", "reads-from"),
    relationshipElement("r2", "rel-2", "lambda-1", "ddb-1", "writes-to"),
  ]);

  assert.equal(graph.resources.length, 2);
  assert.equal(graph.relationships.length, 2);
  assert.deepEqual(
    graph.relationships.map((relationship) => relationship.relationshipType),
    ["reads-from", "writes-to"],
  );
}

// TEST E — missing resource reference.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    relationshipElement("r1", "rel-1", "ec2-1", "missing", "depends-on"),
  ]);

  assert.equal(graph.relationships.length, 0);
  assert.equal(graph.diagnostics.length, 1);
  assert.equal(graph.diagnostics[0].code, "MISSING_TARGET_RESOURCE");
  assertNoThrow(() => analyzeArchitectureGraph([
    relationshipElement("r1", "rel-1", "ec2-1", "missing", "depends-on"),
  ]));
}

// TEST F — malformed relationship metadata.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    resourceElement("rds", "rds-1", "aws:rds", "RDS", "database-instance"),
    relationshipElement("r1", "rel-1", "ec2-1", "rds-1", "not-a-real-type"),
  ]);

  assert.equal(graph.relationships.length, 0);
  assert.equal(graph.diagnostics.length, 1);
  assert.equal(graph.diagnostics[0].code, "INVALID_RELATIONSHIP_TYPE");
  assertNoThrow(() => analyzeArchitectureGraph([
    { id: "broken", customData: { awsRelationship: {} } },
  ]));
}

// TEST G — resource rename does not change stable resourceId.
{
  const before = analyzeArchitectureGraph([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance", { name: "Original" }),
  ]);
  const after = analyzeArchitectureGraph([
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance", { name: "Renamed" }),
  ]);

  assert.equal(getResource(before, "ec2-1").resourceId, "ec2-1");
  assert.equal(getResource(after, "ec2-1").resourceId, "ec2-1");
}

// TEST H — resource move is visual-only and does not change stable resourceId.
{
  const beforeElement = resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance");
  const afterElement = { ...beforeElement, x: 900, y: 700 };
  const before = analyzeArchitectureGraph([beforeElement]);
  const after = analyzeArchitectureGraph([afterElement]);

  assert.equal(getResource(before, "ec2-1").resourceId, "ec2-1");
  assert.equal(getResource(after, "ec2-1").resourceId, "ec2-1");
}

// TEST I — graph query operations.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("api", "api-1", "aws:api-gateway", "API Gateway", "api"),
    resourceElement("lambda", "lambda-1", "aws:lambda", "Lambda", "function"),
    resourceElement("ddb", "ddb-1", "aws:dynamodb", "DynamoDB", "table"),
    relationshipElement("r1", "rel-1", "api-1", "lambda-1", "invokes"),
    relationshipElement("r2", "rel-2", "lambda-1", "ddb-1", "reads-from"),
  ]);

  assert.equal(getResource(graph, "lambda-1").service, "Lambda");
  assert.equal(getIncomingRelationships(graph, "lambda-1").length, 1);
  assert.equal(getIncomingRelationships(graph, "lambda-1")[0].sourceResourceId, "api-1");
  assert.equal(getOutgoingRelationships(graph, "lambda-1").length, 1);
  assert.equal(getOutgoingRelationships(graph, "lambda-1")[0].targetResourceId, "ddb-1");
  assert.equal(getRelationshipsForResource(graph, "lambda-1").length, 2);
  assert.deepEqual(
    getResourceNeighbors(graph, "lambda-1").map((resource) => resource.resourceId),
    ["api-1", "ddb-1"],
  );
}

// TEST J — duplicate visual parts of one intelligent resource become one node.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("ec2-container", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    resourceElement("ec2-name", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    resourceElement("ec2-icon", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
  ]);

  assert.equal(graph.resources.length, 1);
  assert.equal(graph.diagnostics.length, 0);
}

// TEST K — duplicate element IDs are diagnosed without crashing.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("duplicate", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    resourceElement("duplicate", "rds-1", "aws:rds", "RDS", "database-instance"),
  ]);

  assert.equal(graph.resources.length, 1);
  assert.equal(graph.diagnostics.length, 1);
  assert.equal(graph.diagnostics[0].code, "DUPLICATE_ELEMENT_ID");
}

// TEST L — malformed resource metadata is diagnosed without crashing.
{
  const graph = analyzeArchitectureGraph([
    { id: "broken-resource", customData: { awsResource: { service: "EC2" } } },
  ]);

  assert.equal(graph.resources.length, 0);
  assert.equal(graph.diagnostics.length, 1);
  assert.equal(graph.diagnostics[0].code, "MALFORMED_RESOURCE");
}

// TEST M — analysis is non-mutating.
{
  const scene = [
    resourceElement("ec2", "ec2-1", "aws:ec2", "EC2", "compute-instance"),
    relationshipElement("r1", "rel-1", "ec2-1", "missing", "depends-on"),
  ];
  const before = JSON.stringify(scene);
  analyzeArchitectureGraph(scene);
  assert.equal(JSON.stringify(scene), before);
}


function kubernetesResourceElement(id, resourceId, definitionId, resourceType, properties = {}) {
  return {
    id,
    type: "rectangle",
    customData: {
      kubernetesResource: {
        definitionId,
        kubernetesResourceId: resourceId,
        provider: "kubernetes",
        resourceType,
        iconId: `k8s:${resourceType}`,
        catalog: "kubernetes",
        properties,
      },
    },
  };
}

function kubernetesRelationshipElement(id, relationshipId, sourceResourceId, targetResourceId, relationshipType) {
  return {
    id,
    type: "arrow",
    customData: {
      kubernetesRelationship: {
        relationshipId,
        sourceResourceId,
        targetResourceId,
        relationshipType,
      },
    },
  };
}

// TEST N — Kubernetes resources and relationships are first-class graph nodes/edges.
{
  const graph = analyzeArchitectureGraph([
    kubernetesResourceElement("deployment", "k8s-deployment-1", "k8s:deployment", "deployment"),
    kubernetesResourceElement("pod", "k8s-pod-1", "k8s:pod", "pod"),
    kubernetesRelationshipElement("r1", "k8s-rel-1", "k8s-deployment-1", "k8s-pod-1", "schedules"),
  ]);

  assert.equal(graph.resources.length, 2);
  assert.equal(graph.relationships.length, 1);
  assert.equal(graph.resources[0].provider, "kubernetes");
  assert.equal(graph.relationships[0].provider, "kubernetes");
  assert.equal(graph.relationships[0].relationshipType, "schedules");
}

// TEST O — Kubernetes graph queries work through the existing unified API.
{
  const graph = analyzeArchitectureGraph([
    kubernetesResourceElement("service", "k8s-service-1", "k8s:service", "service"),
    kubernetesResourceElement("pod", "k8s-pod-1", "k8s:pod", "pod"),
    kubernetesResourceElement("node", "k8s-node-1", "k8s:node", "node"),
    kubernetesRelationshipElement("r1", "k8s-rel-1", "k8s-service-1", "k8s-pod-1", "exposes"),
    kubernetesRelationshipElement("r2", "k8s-rel-2", "k8s-pod-1", "k8s-node-1", "runs-on"),
  ]);

  assert.equal(getResource(graph, "k8s-pod-1").provider, "kubernetes");
  assert.equal(getOutgoingRelationships(graph, "k8s-service-1", "kubernetes").length, 1);
  assert.equal(getIncomingRelationships(graph, "k8s-pod-1", "kubernetes").length, 1);
  assert.equal(getRelationshipsForResource(graph, "k8s-pod-1", "kubernetes").length, 2);
  assert.deepEqual(
    getResourceNeighbors(graph, "k8s-pod-1", "kubernetes").map((resource) => resource.resourceId),
    ["k8s-service-1", "k8s-node-1"],
  );
}

// TEST P — AWS and Kubernetes resources coexist in one unified graph.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("aws", "shared-id", "aws:ec2", "EC2", "compute-instance"),
    kubernetesResourceElement("k8s", "shared-id", "k8s:pod", "pod"),
  ]);

  assert.equal(graph.resources.length, 2);
  assert.equal(getResource(graph, "shared-id", "aws").provider, "aws");
  assert.equal(getResource(graph, "shared-id", "kubernetes").provider, "kubernetes");
  assert.notEqual(
    getResource(graph, "shared-id", "aws").resourceKey,
    getResource(graph, "shared-id", "kubernetes").resourceKey,
  );
}

// TEST Q — AWS and Kubernetes relationships coexist without cross-provider endpoint resolution.
{
  const graph = analyzeArchitectureGraph([
    resourceElement("aws-a", "aws-a", "aws:ec2", "EC2", "compute-instance"),
    resourceElement("aws-b", "shared-id", "aws:rds", "RDS", "database-instance"),
    kubernetesResourceElement("k8s-a", "k8s-a", "k8s:service", "service"),
    kubernetesResourceElement("k8s-b", "shared-id", "k8s:pod", "pod"),
    relationshipElement("aws-rel", "aws-rel-1", "aws-a", "shared-id", "depends-on"),
    kubernetesRelationshipElement("k8s-rel", "k8s-rel-1", "k8s-a", "shared-id", "exposes"),
  ]);

  assert.equal(graph.relationships.length, 2);
  assert.equal(graph.diagnostics.length, 0);
  assert.equal(graph.relationships.find((r) => r.provider === "aws").targetResourceId, "shared-id");
  assert.equal(graph.relationships.find((r) => r.provider === "kubernetes").targetResourceId, "shared-id");
}

// TEST R — Normal Excalidraw elements remain outside the architecture graph.
{
  const graph = analyzeArchitectureGraph([
    normalRectangle("normal"),
    normalArrow("normal-arrow"),
  ]);

  assert.equal(graph.resources.length, 0);
  assert.equal(graph.relationships.length, 0);
  assert.equal(graph.diagnostics.length, 0);
}

// TEST S — Missing Kubernetes relationship endpoint uses the existing generic diagnostic.
{
  const graph = analyzeArchitectureGraph([
    kubernetesResourceElement("pod", "k8s-pod-1", "k8s:pod", "pod"),
    kubernetesRelationshipElement("r1", "k8s-rel-1", "k8s-pod-1", "missing-k8s", "runs-on"),
  ]);

  assert.equal(graph.relationships.length, 0);
  assert.equal(graph.diagnostics.length, 1);
  assert.equal(graph.diagnostics[0].code, "MISSING_TARGET_RESOURCE");
}

console.log("Architecture graph tests: PASS");
