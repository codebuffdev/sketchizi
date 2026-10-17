import test from "node:test";
import assert from "node:assert/strict";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import { validateArchitectureWithProviderRules } from "../src/features/architecture/architectureValidationComposition.js";
import { kubernetesResourceDefinitions, getKubernetesResourceDefaults } from "../src/kubernetesResourceDefinitions.js";

function resource(id, resourceType, properties = {}) {
  const definition = kubernetesResourceDefinitions.find((item) => item.resourceType === resourceType);
  assert.ok(definition, `test fixture needs known resource: ${resourceType}`);
  return {
    id: `element-${id}`, type: "rectangle", x: 0, y: 0, width: 120, height: 80,
    customData: { kubernetesResource: {
      kubernetesResourceId: id, definitionId: definition.id, provider: "kubernetes", resourceType,
      properties: { ...getKubernetesResourceDefaults(definition), ...properties },
    } },
  };
}

function relationship(id, source, target, relationshipType) {
  return { id: `connector-${id}`, type: "arrow", customData: { kubernetesRelationship: {
    relationshipId: id, sourceResourceId: source, targetResourceId: target, relationshipType,
  } } };
}

function validate(scene) {
  return validateArchitectureWithProviderRules(analyzeArchitectureGraph(scene));
}

function findings(result, code) {
  return [...result.errors, ...result.warnings, ...result.info].filter((item) => item.code === code);
}

test("an empty scene or non-Kubernetes-only scene has no Kubernetes completeness findings", () => {
  assert.deepEqual(findings(validate([]), "KUBERNETES_CLUSTER_CONTEXT_RECOMMENDED"), []);
  const networkingOnly = [{ id: "net", type: "rectangle", customData: { networkingResource: {
    networkingResourceId: "router-1", definitionId: "networking.router", provider: "networking", resourceType: "router", properties: { name: "router" },
  } } }];
  const result = validate(networkingOnly);
  assert.equal([...result.errors, ...result.warnings, ...result.info].filter((item) => item.provider === "kubernetes").length, 0);
});

test("workload-only diagram gets optional cluster-context recommendation", () => {
  const result = validate([resource("deploy-1", "deployment")]);
  const item = findings(result, "KUBERNETES_CLUSTER_CONTEXT_RECOMMENDED")[0];
  assert.ok(item);
  assert.equal(item.severity, "info");
  assert.deepEqual(item.recommendedResourceTypes, ["cluster"]);
  assert.match(item.remediation, /Workload-only diagrams can ignore/);
});

test("Cluster and Namespace without contains edge gets a contextual warning", () => {
  const result = validate([resource("cluster-1", "cluster"), resource("namespace-1", "namespace")]);
  const item = findings(result, "KUBERNETES_CLUSTER_NAMESPACE_LINK_MISSING")[0];
  assert.ok(item);
  assert.equal(item.resourceId, "namespace-1");
  assert.match(item.remediation, /intentionally out of scope/);
  const connected = validate([resource("cluster-1", "cluster"), resource("namespace-1", "namespace"), relationship("edge-1", "cluster-1", "namespace-1", "contains")]);
  assert.deepEqual(findings(connected, "KUBERNETES_CLUSTER_NAMESPACE_LINK_MISSING"), []);
});

test("Namespace connected to one of multiple Clusters is not reported as missing from every Cluster", () => {
  const result = validate([
    resource("cluster-a", "cluster"), resource("cluster-b", "cluster"), resource("namespace-a", "namespace"),
    relationship("edge-a", "cluster-a", "namespace-a", "contains"),
  ]);
  assert.deepEqual(findings(result, "KUBERNETES_CLUSTER_NAMESPACE_LINK_MISSING"), []);
});

test("controller missing schedules-to-Pod is warned, and resolves once modeled", () => {
  const incomplete = validate([resource("deployment-1", "deployment")]);
  const item = findings(incomplete, "KUBERNETES_CONTROLLER_POD_MODEL_MISSING")[0];
  assert.ok(item);
  assert.equal(item.resourceId, "deployment-1");
  assert.deepEqual(item.recommendedResourceTypes, ["pod"]);
  const complete = validate([resource("deployment-1", "deployment"), resource("pod-1", "pod"), relationship("schedule-1", "deployment-1", "pod-1", "schedules")]);
  assert.deepEqual(findings(complete, "KUBERNETES_CONTROLLER_POD_MODEL_MISSING"), []);
});

test("Service without exposed Pod gives optional routing recommendation", () => {
  const incomplete = validate([resource("service-1", "service")]);
  const item = findings(incomplete, "KUBERNETES_SERVICE_POD_TARGET_RECOMMENDED")[0];
  assert.ok(item);
  assert.equal(item.severity, "info");
  assert.deepEqual(item.recommendedResourceTypes, ["pod"]);
  const complete = validate([resource("service-1", "service"), resource("pod-1", "pod"), relationship("exposes-1", "service-1", "pod-1", "exposes")]);
  assert.deepEqual(findings(complete, "KUBERNETES_SERVICE_POD_TARGET_RECOMMENDED"), []);
});

test("Pod without runs-on Node gives optional placement recommendation", () => {
  const incomplete = validate([resource("pod-1", "pod")]);
  const item = findings(incomplete, "KUBERNETES_POD_NODE_PLACEMENT_RECOMMENDED")[0];
  assert.ok(item);
  assert.equal(item.severity, "info");
  assert.deepEqual(item.recommendedResourceTypes, ["node"]);
  const complete = validate([resource("pod-1", "pod"), resource("node-1", "node"), relationship("runs-1", "pod-1", "node-1", "runs-on")]);
  assert.deepEqual(findings(complete, "KUBERNETES_POD_NODE_PLACEMENT_RECOMMENDED"), []);
});

test("completeness recommendations never rewrite source elements", () => {
  const scene = [resource("cluster-1", "cluster"), resource("namespace-1", "namespace")];
  const before = structuredClone(scene);
  validate(scene);
  assert.deepEqual(scene, before);
});

test("AWS resources remain outside Kubernetes completeness rules in a mixed diagram", () => {
  const scene = [
    resource("deployment-1", "deployment"),
    { id: "aws", type: "rectangle", customData: { awsResource: { awsResourceId: "vpc-1", definitionId: "aws:vpc", provider: "aws", resourceType: "vpc", properties: { name: "vpc" } } } },
  ];
  const result = validate(scene);
  assert.ok(findings(result, "KUBERNETES_CONTROLLER_POD_MODEL_MISSING").some((item) => item.resourceId === "deployment-1"));
  assert.ok([...result.errors, ...result.warnings, ...result.info].every((item) => !item.resourceId || item.resourceId !== "vpc-1" || item.provider !== "kubernetes"));
});
