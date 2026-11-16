import test from "node:test";
import assert from "node:assert/strict";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import { validateArchitectureWithProviderRules } from "../src/features/architecture/architectureValidationComposition.js";
import { kubernetesResourceDefinitions, getKubernetesResourceDefaults } from "../src/kubernetesResourceDefinitions.js";

function resource(id, resourceType, properties = {}) {
  const definition = kubernetesResourceDefinitions.find((item) => item.resourceType === resourceType);
  assert.ok(definition, `test fixture requires definition for ${resourceType}`);
  return {
    id: `element-${id}`, type: "rectangle", x: 0, y: 0, width: 120, height: 80,
    customData: { kubernetesResource: {
      kubernetesResourceId: id,
      definitionId: definition.id,
      provider: "kubernetes",
      resourceType,
      properties: { ...getKubernetesResourceDefaults(definition), ...properties },
    } },
  };
}

function relationship(id, source, target, relationshipType = "contains") {
  return {
    id: `connector-${id}`, type: "arrow",
    customData: { kubernetesRelationship: {
      relationshipId: id, sourceResourceId: source, targetResourceId: target, relationshipType,
    } },
  };
}

function validate(scene) {
  return validateArchitectureWithProviderRules(analyzeArchitectureGraph(scene));
}

function diagnostics(result, code) {
  return [...result.errors, ...result.warnings, ...result.info].filter((item) => item.code === code);
}

test("known Kubernetes defaults are valid and produce no property errors", () => {
  const scene = kubernetesResourceDefinitions.map((definition) => resource(`fixture-${definition.resourceType}`, definition.resourceType));
  const result = validate(scene);
  assert.deepEqual(diagnostics(result, "KUBERNETES_INVALID_RESOURCE_PROPERTY"), []);
});

test("empty and invalid Kubernetes names provide a property-specific correction", () => {
  const result = validate([
    resource("pod-empty", "pod", { name: "  " }),
    resource("namespace-invalid", "namespace", { name: "Bad Namespace" }),
  ]);
  const nameFindings = diagnostics(result, "KUBERNETES_INVALID_RESOURCE_PROPERTY").filter((item) => item.propertyKey === "name");
  assert.equal(nameFindings.length, 2);
  assert.ok(nameFindings.every((item) => item.provider === "kubernetes" && item.resourceId));
  assert.ok(nameFindings.some((item) => /required/.test(item.message)));
  assert.ok(nameFindings.some((item) => /lowercase Kubernetes name/.test(item.message)));
  assert.ok(nameFindings.every((item) => item.remediation));
});

test("replicas must be non-negative integers", () => {
  const result = validate([
    resource("deployment-fraction", "deployment", { replicas: 1.5 }),
    resource("statefulset-negative", "statefulset", { replicas: -1 }),
  ]);
  const findings = diagnostics(result, "KUBERNETES_INVALID_RESOURCE_PROPERTY").filter((item) => item.propertyKey === "replicas");
  assert.equal(findings.length, 2);
  assert.ok(findings.every((item) => /non-negative integer/.test(item.message)));
});

test("select properties are validated against the definition options", () => {
  const result = validate([
    resource("service-bad-type", "service", { serviceType: "ExternalMagic" }),
    resource("pod-bad-env", "pod", { environment: "qa" }),
  ]);
  const findings = diagnostics(result, "KUBERNETES_INVALID_RESOURCE_PROPERTY");
  assert.ok(findings.some((item) => item.resourceId === "service-bad-type" && item.propertyKey === "serviceType"));
  assert.ok(findings.some((item) => item.resourceId === "pod-bad-env" && item.propertyKey === "environment"));
});

test("invalid cluster version is diagnosed with an example", () => {
  const result = validate([resource("cluster-invalid", "cluster", { version: "latest-ish" })]);
  const finding = diagnostics(result, "KUBERNETES_INVALID_RESOURCE_PROPERTY").find((item) => item.propertyKey === "version");
  assert.ok(finding);
  assert.match(finding.remediation, /1\.34/);
});

test("non-default namespace without a Namespace resource is flagged, but default is implicit", () => {
  const result = validate([
    resource("pod-default", "pod"),
    resource("deployment-custom", "deployment", { namespace: "payments" }),
  ]);
  const findings = diagnostics(result, "KUBERNETES_MISSING_NAMESPACE_DEPENDENCY");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].resourceId, "deployment-custom");
  assert.match(findings[0].remediation, /Add a Namespace resource named "payments"/);
});

test("existing custom namespace requires an explicit contains relationship", () => {
  const result = validate([
    resource("namespace-payments", "namespace", { name: "payments" }),
    resource("service-payments", "service", { namespace: "payments" }),
  ]);
  const findings = diagnostics(result, "KUBERNETES_MISSING_NAMESPACE_RELATIONSHIP");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].resourceId, "service-payments");
});

test("matching namespace with contains relationship resolves dependency guidance", () => {
  const result = validate([
    resource("namespace-payments", "namespace", { name: "payments" }),
    resource("service-payments", "service", { namespace: "payments" }),
    relationship("namespace-contains-service", "namespace-payments", "service-payments", "contains"),
  ]);
  assert.deepEqual(diagnostics(result, "KUBERNETES_MISSING_NAMESPACE_DEPENDENCY"), []);
  assert.deepEqual(diagnostics(result, "KUBERNETES_MISSING_NAMESPACE_RELATIONSHIP"), []);
});

test("unknown legacy resource definitions are not spuriously rejected", () => {
  const legacy = {
    id: "legacy-pod", type: "rectangle", x: 0, y: 0, width: 100, height: 60,
    customData: { kubernetesResource: {
      kubernetesResourceId: "legacy-pod", definitionId: "k8s:custom-pod", provider: "kubernetes",
      resourceType: "custom-pod", properties: { name: "legacy-pod" },
    } },
  };
  assert.deepEqual(diagnostics(validate([legacy]), "KUBERNETES_INVALID_RESOURCE_PROPERTY"), []);
});

test("AWS and Networking are not subject to Kubernetes property or namespace rules", () => {
  const scene = [
    { id: "aws", type: "rectangle", customData: { awsResource: { awsResourceId: "aws-1", definitionId: "aws:custom", provider: "aws", resourceType: "custom", properties: { name: "Bad Name", replicas: -1 } } } },
    { id: "net", type: "rectangle", customData: { networkingResource: { networkingResourceId: "net-1", definitionId: "networking:custom", provider: "networking", resourceType: "custom", properties: { name: "Bad Name", namespace: "missing" } } } },
  ];
  const result = validate(scene);
  assert.deepEqual(diagnostics(result, "KUBERNETES_INVALID_RESOURCE_PROPERTY"), []);
  assert.deepEqual(diagnostics(result, "KUBERNETES_MISSING_NAMESPACE_DEPENDENCY"), []);
});
