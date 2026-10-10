import test from "node:test";
import assert from "node:assert/strict";
import { buildDiagramContext, DiagramContextError } from "../src/features/ai/diagramContextBuilder.js";

test("context includes normalized labels, geometry, explicit bound connectors, and architecture metadata", () => {
  const scene = [
    { id: "client", type: "rectangle", x: 10, y: 20, width: 120, height: 60, text: "Web Client", customData: { awsResource: { definitionId: "aws.ec2", resourceType: "EC2", service: "Compute", properties: { name: "frontend", apiKey: "secret-must-not-send" } } } },
    { id: "api", type: "rectangle", x: 220, y: 20, width: 120, height: 60 },
    { id: "label", type: "text", containerId: "api", text: "API Service" },
    { id: "edge", type: "arrow", startBinding: { elementId: "client" }, endBinding: { elementId: "api" }, startArrowhead: null, endArrowhead: "arrow", text: "HTTPS" },
    { id: "unbound", type: "arrow", startBinding: null, endBinding: null },
    { id: "deleted", type: "rectangle", isDeleted: true },
  ];
  const result = buildDiagramContext(scene);
  assert.equal(result.scope, "complete-current-canvas");
  assert.equal(result.elementCount, 5);
  assert.equal(result.elements.find((item) => item.id === "client").label, "Web Client");
  assert.equal(result.elements.find((item) => item.id === "api").label, "API Service");
  assert.equal(result.elements.find((item) => item.id === "edge").connector.relationshipExplicit, true);
  assert.equal(result.elements.find((item) => item.id === "edge").connector.targetElementId, "api");
  assert.equal(result.elements.find((item) => item.id === "unbound").connector.relationshipExplicit, false);
  const encoded = JSON.stringify(result);
  assert.match(encoded, /aws\.ec2/);
  assert.doesNotMatch(encoded, /must-not-send/);
  assert.doesNotMatch(encoded, /deleted/);
});

test("context is rebuilt with a new snapshot ID for each question", () => {
  const scene = [{ id: "one", type: "ellipse", x: 0, y: 0, width: 20, height: 20 }];
  const first = buildDiagramContext(scene);
  const second = buildDiagramContext(scene);
  assert.notEqual(first.snapshotId, second.snapshotId);
  assert.equal(first.elementCount, second.elementCount);
});

test("oversized diagrams fail clearly rather than silently omitting elements", () => {
  const scene = Array.from({ length: 1501 }, (_, index) => ({ id: `element-${index}`, type: "rectangle" }));
  assert.throws(() => buildDiagramContext(scene), DiagramContextError);
});

test("context preserves networking resource IDs and explicit architecture relationships", () => {
  const scene = [
    { id: "vpc", type: "rectangle", customData: { networkingResource: { networkingResourceId: "network-vpc-1", definitionId: "net.vpc", resourceType: "VPC", properties: { name: "Production VPC" } } } },
    { id: "subnet", type: "rectangle", customData: { networkingResource: { networkingResourceId: "network-subnet-1", definitionId: "net.subnet", resourceType: "Subnet", properties: { name: "Private Subnet" } } } },
    { id: "network-edge", type: "arrow", startBinding: { elementId: "vpc" }, endBinding: { elementId: "subnet" }, customData: { networkingRelationship: { relationshipId: "network-link-1", sourceResourceId: "network-vpc-1", targetResourceId: "network-subnet-1", relationshipType: "contains" } } },
  ];
  const result = buildDiagramContext(scene);
  assert.equal(result.elements.find((item) => item.id === "vpc").architectureResource.resourceId, "network-vpc-1");
  assert.deepEqual(result.elements.find((item) => item.id === "network-edge").architectureRelationship, {
    provider: "networking", relationshipId: "network-link-1", relationshipType: "contains",
    sourceResourceId: "network-vpc-1", targetResourceId: "network-subnet-1",
  });
});
