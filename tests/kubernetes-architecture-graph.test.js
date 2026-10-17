import test from "node:test";
import assert from "node:assert/strict";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import { validateArchitectureWithProviderRules } from "../src/features/architecture/architectureValidationComposition.js";

function resource(id, provider = "kubernetes", resourceType = "pod", extra = {}) {
  const idKey = provider === "aws" ? "awsResourceId" : provider === "networking" ? "networkingResourceId" : "kubernetesResourceId";
  const key = provider === "aws" ? "awsResource" : provider === "networking" ? "networkingResource" : "kubernetesResource";
  return {
    id: `element-${id}`, type: "rectangle", x: 0, y: 0, width: 120, height: 80,
    customData: { [key]: {
      [idKey]: id, definitionId: `${provider}.${resourceType}`, provider,
      resourceType, properties: { name: id }, ...extra,
    } },
  };
}
function relationship(id, source, target, type = "contains", provider = "kubernetes") {
  const key = provider === "aws" ? "awsRelationship" : provider === "networking" ? "networkingRelationship" : "kubernetesRelationship";
  return { id: `connector-${provider}-${id}`, type: "arrow", customData: { [key]: {
    relationshipId: id, sourceResourceId: source, targetResourceId: target, relationshipType: type,
  } } };
}

test("Kubernetes resources retain provider-scoped stable identity in the shared graph", () => {
  const scene = [resource("cluster-1", "kubernetes", "cluster"), resource("namespace-1", "kubernetes", "namespace")];
  const snapshot = structuredClone(scene);
  const graph = analyzeArchitectureGraph(scene);
  assert.deepEqual(graph.resources.map((r) => r.resourceKey), ["kubernetes:cluster-1", "kubernetes:namespace-1"]);
  assert.ok(graph.resources.every((r) => r.provider === "kubernetes"));
  assert.deepEqual(scene, snapshot, "graph analysis must not mutate Excalidraw elements");
  assert.deepEqual(graph.diagnostics, []);
});

test("Kubernetes relationships preserve relationship and endpoint identities", () => {
  const scene = [resource("cluster-1", "kubernetes", "cluster"), resource("namespace-1", "kubernetes", "namespace"), relationship("edge-1", "cluster-1", "namespace-1", "contains")];
  const graph = analyzeArchitectureGraph(scene);
  assert.deepEqual(graph.relationships, [{ relationshipId: "edge-1", provider: "kubernetes", sourceResourceId: "cluster-1", targetResourceId: "namespace-1", relationshipType: "contains" }]);
  assert.deepEqual(graph.diagnostics, []);
});

test("malformed Kubernetes metadata yields diagnostics instead of throwing", () => {
  const graph = analyzeArchitectureGraph([{ id: "broken", type: "rectangle", customData: { kubernetesResource: { kubernetesResourceId: "missing-fields" } } }]);
  assert.ok(graph.diagnostics.some((item) => item.code === "MALFORMED_RESOURCE" && item.elementId === "broken"));
});

test("relationships with missing Kubernetes endpoints are diagnosed and excluded", () => {
  const graph = analyzeArchitectureGraph([resource("cluster-1", "kubernetes", "cluster"), relationship("orphan-edge", "cluster-1", "missing-namespace", "contains")]);
  assert.equal(graph.relationships.length, 0);
  assert.ok(graph.diagnostics.some((item) => item.code === "MISSING_TARGET_RESOURCE" && item.relationshipId === "orphan-edge"));
});

test("provider validation composition includes Kubernetes semantic rules", () => {
  const scene = [resource("pod-1", "kubernetes", "pod"), resource("node-1", "kubernetes", "node"), relationship("bad-runs-on", "pod-1", "node-1", "contains")];
  const graph = analyzeArchitectureGraph(scene);
  const result = validateArchitectureWithProviderRules(graph);
  assert.ok(result.errors.some((item) => item.code === "KUBERNETES_INVALID_RELATIONSHIP"));
});

test("shared graph still isolates AWS and Networking relationship identities by provider", () => {
  const scene = [
    resource("aws-vpc", "aws", "vpc"), resource("aws-subnet", "aws", "subnet"), relationship("same-edge", "aws-vpc", "aws-subnet", "connects-to", "aws"),
    resource("net-a", "networking", "router"), resource("net-b", "networking", "switch"), relationship("same-edge", "net-a", "net-b", "connects-to", "networking"),
  ];
  const graph = analyzeArchitectureGraph(scene);
  assert.ok(graph.resources.some((r) => r.resourceKey === "aws:aws-vpc"));
  assert.ok(graph.resources.some((r) => r.resourceKey === "networking:net-a"));
  assert.deepEqual(graph.relationships.map((r) => r.provider).sort(), ["aws", "networking"]);
  assert.deepEqual(graph.diagnostics, []);
});
