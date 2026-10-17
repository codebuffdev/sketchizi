import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import { validateArchitectureWithProviderRules } from "../src/features/architecture/architectureValidationComposition.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resource(id, resourceType) {
  return {
    id: `element-${id}`, type: "rectangle", x: 0, y: 0, width: 120, height: 80,
    customData: { kubernetesResource: {
      kubernetesResourceId: id, definitionId: `k8s:${resourceType}`, provider: "kubernetes",
      resourceType, properties: { name: id },
    } },
  };
}

function relationship(id, source, target, relationshipType) {
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

test("invalid Kubernetes relationship diagnostics include compatible alternatives and remediation", () => {
  const result = validate([
    resource("pod-1", "pod"), resource("node-1", "node"),
    relationship("bad-1", "pod-1", "node-1", "contains"),
  ]);
  const diagnostic = result.errors.find((item) => item.code === "KUBERNETES_INVALID_RELATIONSHIP");
  assert.ok(diagnostic);
  assert.equal(diagnostic.sourceResourceType, "pod");
  assert.equal(diagnostic.targetResourceType, "node");
  assert.match(diagnostic.message, /contains.*pod.*node/);
  assert.match(diagnostic.remediation, /compatible/);
  assert.deepEqual(diagnostic.suggestedRelationshipTypes, ["connects-to", "runs-on"]);
});

test("unknown Kubernetes relationship types recommend supported values", () => {
  const result = validate([
    resource("service-1", "service"), resource("pod-1", "pod"),
    relationship("unknown-type", "service-1", "pod-1", "routes-directly"),
  ]);
  const diagnostic = result.errors.find((item) => item.code === "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /routes-directly/);
  assert.match(diagnostic.remediation, /supported/);
  assert.deepEqual(diagnostic.suggestedRelationshipTypes, ["connects-to", "exposes"]);
  assert.equal(result.errors.filter((item) => item.relationshipId === "unknown-type" && /KUBERNETES_(UNKNOWN_RELATIONSHIP_TYPE|INVALID_RELATIONSHIP)/.test(item.code)).length, 1);
});

test("orphan Kubernetes resources explain how to resolve the finding", () => {
  const result = validate([resource("namespace-1", "namespace")]);
  const diagnostic = result.info.find((item) => item.code === "KUBERNETES_ORPHAN_RESOURCE");
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /namespace/);
  assert.match(diagnostic.remediation, /Connect this resource|remove it/);
});

test("validation panel displays remediation and type suggestions accessibly", async () => {
  const [panel, styles] = await Promise.all([
    readFile(resolve(root, "src/components/app/ArchitectureValidationPanel.jsx"), "utf8"),
    readFile(resolve(root, "src/styles/architecture-validation.css"), "utf8"),
  ]);
  assert.match(panel, /architecture-validation-diagnostic-remediation/);
  assert.match(panel, /Suggested types:/);
  assert.match(panel, /suggestedRelationshipTypes\.join/);
  assert.match(styles, /\.architecture-validation-diagnostic-remediation/);
  assert.match(styles, /\.app\.theme-dark \.architecture-validation-diagnostic-remediation/);
});
