import assert from "node:assert/strict";
import {
  AWS_RELATIONSHIP_TYPES,
  getAwsRelationship,
  syncAwsRelationshipMetadata,
  updateRelationshipType,
} from "../src/features/aws-relationships/awsRelationshipService.js";

function resource(id, name) {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    customData: {
      awsResource: {
        awsResourceId: id,
        properties: { name },
      },
    },
  };
}

function connector(id, sourceId, targetId) {
  return {
    id,
    type: "arrow",
    x: 0,
    y: 0,
    width: 100,
    height: 0,
    startBinding: { elementId: sourceId },
    endBinding: { elementId: targetId },
  };
}

const source = resource("aws-resource-source", "API Gateway");
const target = resource("aws-resource-target", "Lambda");
const line = { ...connector("line-1", source.id, target.id), type: "line" };
const first = connector("arrow-1", source.id, target.id);
const second = connector("arrow-2", source.id, target.id);

let result = syncAwsRelationshipMetadata([source, target, first, second, line]);
assert.equal(result.changed, true);
assert.equal(getAwsRelationship(result.elements.find((e) => e.id === first.id)).relationshipType, "connects-to");
assert.equal(getAwsRelationship(result.elements.find((e) => e.id === line.id)).relationshipType, "connects-to");

const firstRelationship = getAwsRelationship(result.elements.find((e) => e.id === first.id));
const updated = updateRelationshipType(result.elements, firstRelationship.relationshipId, "invokes");
assert.equal(updated.changed, true);
const invokes = getAwsRelationship(updated.elements.find((e) => e.id === first.id));
assert.equal(invokes.relationshipType, "invokes");
assert.equal(invokes.relationshipId, firstRelationship.relationshipId);
assert.equal(invokes.sourceResourceId, firstRelationship.sourceResourceId);
assert.equal(invokes.targetResourceId, firstRelationship.targetResourceId);

const reread = syncAwsRelationshipMetadata(updated.elements);
assert.equal(getAwsRelationship(reread.elements.find((e) => e.id === first.id)).relationshipType, "invokes");

const read = updateRelationshipType(reread.elements, invokes.relationshipId, "reads-from");
assert.equal(getAwsRelationship(read.elements.find((e) => e.id === first.id)).relationshipType, "reads-from");
assert.equal(getAwsRelationship(read.elements.find((e) => e.id === second.id)).relationshipType, "connects-to");

const invalid = updateRelationshipType(read.elements, invokes.relationshipId, "not-a-real-type");
assert.equal(invalid.changed, false);
assert.deepEqual(AWS_RELATIONSHIP_TYPES, [
  "connects-to", "invokes", "reads-from", "writes-to",
  "publishes-to", "subscribes-to", "routes-to", "depends-on",
]);

const deleted = syncAwsRelationshipMetadata(read.elements.filter((e) => e.id !== target.id));
assert.equal(getAwsRelationship(deleted.elements.find((e) => e.id === first.id)), null);
assert.equal(getAwsRelationship(deleted.elements.find((e) => e.id === second.id)), null);
assert.equal(getAwsRelationship(deleted.elements.find((e) => e.id === line.id)), null);

console.log("AWS relationship semantic tests: PASS");
