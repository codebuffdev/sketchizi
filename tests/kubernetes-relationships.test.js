import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  getCompatibleKubernetesRelationshipTypes,
  isKubernetesRelationshipTypeCompatible,
} from "../src/features/kubernetes-relationships/kubernetesRelationshipSemantics.js";
import {
  getKubernetesRelationshipGuidance,
  syncKubernetesRelationshipMetadata,
  updateKubernetesRelationshipMetadata,
} from "../src/features/kubernetes-relationships/kubernetesRelationshipService.js";

function resource(id, resourceType) {
  return {
    id: `element-${id}`,
    type: "rectangle",
    customData: {
      kubernetesResource: {
        kubernetesResourceId: id,
        definitionId: `k8s:${resourceType}`,
        provider: "kubernetes",
        resourceType,
        properties: { name: id },
      },
    },
  };
}

function connector(id, sourceId, targetId, relationshipType = "connects-to") {
  return {
    id,
    type: "arrow",
    startBinding: { elementId: `element-${sourceId}` },
    endBinding: { elementId: `element-${targetId}` },
    customData: {
      kubernetesRelationship: {
        relationshipId: `k8s-relationship-${id}`,
        sourceResourceId: sourceId,
        targetResourceId: targetId,
        relationshipType,
      },
    },
  };
}

test("relationship type compatibility shares the Kubernetes semantic pairs", () => {
  assert.deepEqual(getCompatibleKubernetesRelationshipTypes("pod", "node"), ["connects-to", "runs-on"]);
  assert.deepEqual(getCompatibleKubernetesRelationshipTypes("service", "pod"), ["connects-to", "exposes"]);
  assert.equal(isKubernetesRelationshipTypeCompatible("contains", "cluster", "namespace"), true);
  assert.equal(isKubernetesRelationshipTypeCompatible("contains", "pod", "node"), false);
  assert.equal(isKubernetesRelationshipTypeCompatible("connects-to", "pod", "node"), true);
});

test("relationship guidance explains a valid selected connector", () => {
  const scene = [resource("pod-1", "pod"), resource("node-1", "node")];
  const edge = connector("edge-1", "pod-1", "node-1", "runs-on");
  const guidance = getKubernetesRelationshipGuidance(edge, scene);
  assert.deepEqual(guidance, {
    sourceResourceType: "pod",
    targetResourceType: "node",
    compatibleRelationshipTypes: ["connects-to", "runs-on"],
    isCompatible: true,
  });
});

test("relationship guidance offers alternatives when the current type is semantically invalid", () => {
  const scene = [resource("pod-1", "pod"), resource("node-1", "node")];
  const edge = connector("edge-1", "pod-1", "node-1", "contains");
  const guidance = getKubernetesRelationshipGuidance(edge, scene);
  assert.equal(guidance.isCompatible, false);
  assert.deepEqual(guidance.compatibleRelationshipTypes, ["connects-to", "runs-on"]);
});

test("guidance degrades safely when a relationship endpoint is absent", () => {
  const guidance = getKubernetesRelationshipGuidance(connector("edge-1", "pod-1", "missing"), [resource("pod-1", "pod")]);
  assert.equal(guidance.isCompatible, null);
  assert.deepEqual(guidance.compatibleRelationshipTypes, []);
});

test("relationship metadata sync preserves selected semantic type and is idempotent", () => {
  const scene = [resource("pod-1", "pod"), resource("node-1", "node"), connector("edge-1", "pod-1", "node-1", "runs-on")];
  const first = syncKubernetesRelationshipMetadata(scene);
  assert.equal(first.changed, false);
  assert.equal(first.elements[2].customData.kubernetesRelationship.relationshipType, "runs-on");
  const second = syncKubernetesRelationshipMetadata(first.elements);
  assert.equal(second.changed, false);
});

test("relationship updates preserve stable identity and change only the requested type", () => {
  const edge = connector("edge-1", "pod-1", "node-1", "connects-to");
  const result = updateKubernetesRelationshipMetadata([edge], "k8s-relationship-edge-1", { relationshipType: "runs-on" });
  assert.equal(result.changed, true);
  assert.equal(result.elements[0].customData.kubernetesRelationship.relationshipType, "runs-on");
  assert.equal(result.elements[0].customData.kubernetesRelationship.relationshipId, "k8s-relationship-edge-1");
  assert.equal(updateKubernetesRelationshipMetadata(result.elements, "k8s-relationship-edge-1", { relationshipType: "runs-on" }).changed, false);
});


test("Properties panel is wired to show compatibility labels and alternatives", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const [app, propertiesPanel] = await Promise.all([
    readFile(resolve(root, "src/App.jsx"), "utf8"),
    readFile(resolve(root, "src/PropertiesPanel.jsx"), "utf8"),
  ]);
  assert.match(app, /getKubernetesRelationshipGuidance/);
  assert.match(app, /kubernetesRelationshipGuidance=\{selectedKubernetesRelationshipGuidance\}/);
  assert.match(propertiesPanel, /kubernetesRelationshipGuidance = null/);
  assert.match(propertiesPanel, /compatibleRelationshipTypes/);
  assert.match(propertiesPanel, /Suggested types:/);
});
