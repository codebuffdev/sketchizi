import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KUBERNETES_RELATIONSHIP_TYPES, syncKubernetesRelationshipMetadata, getKubernetesRelationship, updateKubernetesRelationshipMetadata } from "../src/features/kubernetes-relationships/kubernetesRelationshipService.js";
import { syncAwsRelationshipMetadata, getAwsRelationship } from "../src/features/aws-relationships/awsRelationshipService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function k8sResource(elementId, resourceId, properties = {}) {
  return {
    id: elementId,
    type: "rectangle",
    customData: {
      kubernetesResource: {
        definitionId: "k8s:pod",
        kubernetesResourceId: resourceId,
        provider: "kubernetes",
        resourceType: "pod",
        iconId: "k8s:pod",
        catalog: "kubernetes",
        properties: { name: resourceId, ...properties },
      },
    },
  };
}

function awsResource(elementId, resourceId, service = "EC2") {
  return {
    id: elementId,
    type: "rectangle",
    customData: {
      awsResource: {
        awsResourceId: resourceId,
        definitionId: `aws:${service.toLowerCase()}`,
        provider: "aws",
        service,
        resourceType: "compute-instance",
        properties: { name: service },
      },
    },
  };
}

function connector(id, type, sourceId, targetId, extra = {}) {
  return {
    id,
    type,
    startBinding: sourceId ? { elementId: sourceId } : null,
    endBinding: targetId ? { elementId: targetId } : null,
    ...extra,
  };
}

function sync(elements) {
  return syncKubernetesRelationshipMetadata(elements).elements;
}

function relationshipFrom(elements, connectorId) {
  return getKubernetesRelationship(elements.find((element) => element.id === connectorId));
}

// 1. Kubernetes -> Kubernetes creates a relationship.
{
  const elements = sync([
    k8sResource("deployment", "k8s-deployment-1"),
    k8sResource("pod", "k8s-pod-1"),
    connector("c1", "arrow", "deployment", "pod"),
  ]);
  const relationship = relationshipFrom(elements, "c1");
  check(relationship, "Kubernetes -> Kubernetes connector did not create metadata.");
  check(relationship?.sourceResourceId === "k8s-deployment-1", "Source resource ID is incorrect.");
  check(relationship?.targetResourceId === "k8s-pod-1", "Target resource ID is incorrect.");

  // 2. Exactly five relationship types exist and creation defaults to connects-to.
  check(JSON.stringify(KUBERNETES_RELATIONSHIP_TYPES) === JSON.stringify([
    "connects-to",
    "contains",
    "schedules",
    "exposes",
    "runs-on",
  ]), "Kubernetes relationship vocabulary is incorrect.");
  check(relationship?.relationshipType === "connects-to", "Default Kubernetes relationship type is not connects-to.");

  // 3. Relationship ID is stable and connector-derived.
  check(relationship?.relationshipId === "k8s-relationship-c1", "Relationship ID is not derived from connector ID.");

  // 4-5. Endpoint IDs are resource IDs, not element IDs.
  check(relationship?.sourceResourceId !== "deployment", "Source endpoint incorrectly uses element ID.");
  check(relationship?.targetResourceId !== "pod", "Target endpoint incorrectly uses element ID.");
}

// 6. Renaming source preserves sourceResourceId.
{
  const before = sync([k8sResource("source", "resource-source", { name: "Old" }), k8sResource("target", "resource-target"), connector("c1", "arrow", "source", "target")]);
  const after = sync([k8sResource("source", "resource-source", { name: "Renamed" }), k8sResource("target", "resource-target"), connector("c1", "arrow", "source", "target")]);
  check(relationshipFrom(before, "c1")?.sourceResourceId === relationshipFrom(after, "c1")?.sourceResourceId, "Renaming source changed sourceResourceId.");
}

// 7. Renaming target preserves targetResourceId.
{
  const before = sync([k8sResource("source", "resource-source"), k8sResource("target", "resource-target", { name: "Old" }), connector("c1", "arrow", "source", "target")]);
  const after = sync([k8sResource("source", "resource-source"), k8sResource("target", "resource-target", { name: "Renamed" }), connector("c1", "arrow", "source", "target")]);
  check(relationshipFrom(before, "c1")?.targetResourceId === relationshipFrom(after, "c1")?.targetResourceId, "Renaming target changed targetResourceId.");
}

// 8-9. Movement preserves both endpoint IDs.
{
  const before = sync([k8sResource("source", "resource-source"), k8sResource("target", "resource-target"), connector("c1", "arrow", "source", "target")]);
  const after = sync([{ ...k8sResource("source", "resource-source"), x: 900, y: 700 }, { ...k8sResource("target", "resource-target"), x: 1200, y: 800 }, connector("c1", "arrow", "source", "target")]);
  check(relationshipFrom(before, "c1")?.sourceResourceId === relationshipFrom(after, "c1")?.sourceResourceId, "Moving source changed sourceResourceId.");
  check(relationshipFrom(before, "c1")?.targetResourceId === relationshipFrom(after, "c1")?.targetResourceId, "Moving target changed targetResourceId.");
}

// 10. Multiple relationships remain independent.
{
  const elements = sync([
    k8sResource("a", "resource-a"),
    k8sResource("b", "resource-b"),
    k8sResource("c", "resource-c"),
    connector("c1", "arrow", "a", "b"),
    connector("c2", "line", "a", "c"),
  ]);
  check(relationshipFrom(elements, "c1")?.relationshipId === "k8s-relationship-c1", "First relationship identity changed.");
  check(relationshipFrom(elements, "c2")?.relationshipId === "k8s-relationship-c2", "Second relationship identity changed.");
  check(relationshipFrom(elements, "c1")?.targetResourceId === "resource-b", "First relationship target changed.");
  check(relationshipFrom(elements, "c2")?.targetResourceId === "resource-c", "Second relationship target changed.");
}

// 11. Kubernetes -> normal shape does not create Kubernetes metadata.
{
  const elements = sync([k8sResource("k8s", "resource-k8s"), { id: "shape", type: "rectangle" }, connector("c1", "arrow", "k8s", "shape")]);
  check(!relationshipFrom(elements, "c1"), "Kubernetes -> normal shape incorrectly created Kubernetes metadata.");
}

// 12. AWS -> Kubernetes does not create Kubernetes metadata.
{
  const elements = sync([awsResource("aws", "aws-1"), k8sResource("k8s", "resource-k8s"), connector("c1", "arrow", "aws", "k8s")]);
  check(!relationshipFrom(elements, "c1"), "AWS -> Kubernetes incorrectly created Kubernetes relationship metadata.");
}

// 13. AWS -> AWS remains an AWS relationship and receives no Kubernetes metadata.
{
  const base = [awsResource("aws-a", "aws-a"), awsResource("aws-b", "aws-b"), connector("c1", "arrow", "aws-a", "aws-b")];
  const awsElements = syncAwsRelationshipMetadata(base).elements;
  const k8sElements = syncKubernetesRelationshipMetadata(awsElements).elements;
  check(Boolean(getAwsRelationship(k8sElements.find((element) => element.id === "c1"))), "AWS -> AWS behavior was changed.");
  check(!getKubernetesRelationship(k8sElements.find((element) => element.id === "c1")), "AWS -> AWS received Kubernetes relationship metadata.");
}

// 14. Line connectors work.
{
  const elements = sync([k8sResource("a", "resource-a"), k8sResource("b", "resource-b"), connector("line-1", "line", "a", "b")]);
  check(relationshipFrom(elements, "line-1")?.relationshipType === "connects-to", "Line connector did not create Kubernetes relationship.");
}

// 15. Arrow connectors work.
{
  const elements = sync([k8sResource("a", "resource-a"), k8sResource("b", "resource-b"), connector("arrow-1", "arrow", "a", "b")]);
  check(relationshipFrom(elements, "arrow-1")?.relationshipType === "connects-to", "Arrow connector did not create Kubernetes relationship.");
}

// 16. Deleted Kubernetes resource causes stale metadata cleanup.
{
  const initial = sync([k8sResource("a", "resource-a"), k8sResource("b", "resource-b"), connector("c1", "arrow", "a", "b")]);
  const deleted = sync([{ ...initial.find((element) => element.id === "a"), isDeleted: true }, initial.find((element) => element.id === "b"), initial.find((element) => element.id === "c1")]);
  check(!relationshipFrom(deleted, "c1"), "Deleted Kubernetes resource left stale relationship metadata.");
  check(deleted.find((element) => element.id === "c1")?.type === "arrow", "Stale cleanup deleted or changed the connector.");
}

// 17. Normal unbound connectors remain normal.
{
  const elements = sync([connector("unbound", "arrow", null, null)]);
  check(!relationshipFrom(elements, "unbound"), "Unbound connector incorrectly received Kubernetes metadata.");
  check(elements.find((element) => element.id === "unbound")?.type === "arrow", "Unbound connector was changed.");
}

// 18. All five relationship types can be stored/read while identity fields remain stable.
{
  for (const relationshipType of KUBERNETES_RELATIONSHIP_TYPES) {
    const elements = sync([k8sResource("a", "resource-a"), k8sResource("b", "resource-b"), connector("c1", "arrow", "a", "b")]);
    const before = relationshipFrom(elements, "c1");
    const updated = updateKubernetesRelationshipMetadata(elements, before.relationshipId, { relationshipType });
    const after = relationshipFrom(updated.elements, "c1");
    check(after.relationshipType === relationshipType, `Relationship type ${relationshipType} was not stored/read correctly.`);
    check(after.relationshipId === before.relationshipId, `Relationship type ${relationshipType} changed relationshipId.`);
    check(after.sourceResourceId === before.sourceResourceId, `Relationship type ${relationshipType} changed sourceResourceId.`);
    check(after.targetResourceId === before.targetResourceId, `Relationship type ${relationshipType} changed targetResourceId.`);
  }
}

// 19. Scene synchronization preserves an explicitly updated semantic relationship type.
{
  const elements = sync([k8sResource("a", "resource-a"), k8sResource("b", "resource-b"), connector("c1", "arrow", "a", "b")]);
  const before = relationshipFrom(elements, "c1");
  const updated = updateKubernetesRelationshipMetadata(elements, before.relationshipId, { relationshipType: "schedules" });
  const resynced = sync(updated.elements);
  const after = relationshipFrom(resynced, "c1");
  check(after.relationshipType === "schedules", "Scene synchronization reverted the updated Kubernetes relationship type to connects-to.");
  check(after.relationshipId === before.relationshipId, "Scene synchronization changed relationshipId.");
  check(after.sourceResourceId === before.sourceResourceId, "Scene synchronization changed sourceResourceId.");
  check(after.targetResourceId === before.targetResourceId, "Scene synchronization changed targetResourceId.");
}

// 20. Invalid relationship types normalize to the existing default.
{
  const elements = sync([k8sResource("a", "resource-a"), k8sResource("b", "resource-b"), connector("c1", "arrow", "a", "b")]);
  const before = relationshipFrom(elements, "c1");
  const updated = updateKubernetesRelationshipMetadata(elements, before.relationshipId, { relationshipType: "invalid-type" });
  const after = relationshipFrom(updated.elements, "c1");
  check(after.relationshipType === "connects-to", "Invalid relationship type was not normalized to connects-to.");
  check(after.relationshipId === before.relationshipId, "Invalid relationship type changed relationshipId.");
  check(after.sourceResourceId === before.sourceResourceId, "Invalid relationship type changed sourceResourceId.");
  check(after.targetResourceId === before.targetResourceId, "Invalid relationship type changed targetResourceId.");
}

// Protected areas: K3B relationship behavior must not change. K5 may integrate validation on top of K3B.
for (const [file, forbidden] of [
  ["src/features/architecture/awsArchitectureRules.js", /kubernetesRelationship/i],
  ["src/persistence.js", /kubernetesRelationship/i],
  ["public/service-worker.js", /kubernetesRelationship/i],
]) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  check(!forbidden.test(content), `${file} contains Kubernetes relationship integration.`);
}

const relationshipService = fs.readFileSync(path.join(root, "src/features/kubernetes-relationships/kubernetesRelationshipService.js"), "utf8");
check(/kubernetesRelationship/.test(relationshipService), "Kubernetes relationship service metadata key is missing.");
check(/k8s-relationship-\$\{connector\.id\}/.test(relationshipService), "Stable connector-derived Kubernetes relationship ID is missing.");
check(/connects-to|contains|schedules|exposes|runs-on/.test(relationshipService), "K3B relationship vocabulary is missing.");

console.log(`Kubernetes relationship tests: ${failures.length ? "FAIL" : "PASS"}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
