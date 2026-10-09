import test from "node:test";
import assert from "node:assert/strict";
import { mergeSnapshot, chooseElement, MAX_ELEMENTS, MAX_FILES } from "../server/collaborationSyncCore.mjs";

function sceneElement({ id = "e1", version = 1, versionNonce = 1, isDeleted = false, type = "rectangle", x = 0 } = {}) {
  return { id, version, versionNonce, isDeleted, type, x, y: 0, width: 20, height: 20 };
}

function emptyRoom() {
  return { id: "room-sync-test-0001", elements: new Map(), files: new Map(), authorship: new Map() };
}

test("server merge accepts new elements and higher-version edits and tracks authorship", () => {
  const room = emptyRoom();
  const created = mergeSnapshot(room, [sceneElement({ version: 1 })], [], "participant-a");
  assert.equal(created.elements.length, 1);
  assert.equal(room.authorship.get("e1").createdBy, "participant-a");

  const edited = mergeSnapshot(room, [sceneElement({ version: 2, versionNonce: 2, x: 30 })], [], "participant-b");
  assert.equal(edited.elements.length, 1);
  assert.equal(room.elements.get("e1").x, 30);
  assert.equal(room.authorship.get("e1").lastModifiedBy, "participant-b");
});

test("older versions and exact-version duplicates are skipped", () => {
  const room = emptyRoom();
  mergeSnapshot(room, [sceneElement({ version: 7, versionNonce: 77, x: 70 })], [], "a");
  assert.equal(mergeSnapshot(room, [sceneElement({ version: 6, versionNonce: 99, x: 60 })], [], "b").elements.length, 0);
  assert.equal(mergeSnapshot(room, [sceneElement({ version: 7, versionNonce: 77, x: 75 })], [], "b").elements.length, 0);
  assert.equal(room.elements.get("e1").x, 70);
});

test("equal-version conflicts use versionNonce as the deterministic tie-breaker", () => {
  const current = sceneElement({ version: 4, versionNonce: 10, x: 10 });
  const incomingLowerNonce = sceneElement({ version: 4, versionNonce: 8, x: 8 });
  const incomingHigherNonce = sceneElement({ version: 4, versionNonce: 12, x: 12 });
  assert.equal(chooseElement(current, incomingLowerNonce), current);
  assert.equal(chooseElement(current, incomingHigherNonce), incomingHigherNonce);

  const room = emptyRoom();
  mergeSnapshot(room, [current], [], "first");
  assert.equal(mergeSnapshot(room, [incomingLowerNonce], [], "second").elements.length, 0);
  assert.equal(mergeSnapshot(room, [incomingHigherNonce], [], "third").elements[0].x, 12);
});

test("delete-versus-edit behavior follows the same version and nonce comparison", () => {
  const room = emptyRoom();
  mergeSnapshot(room, [sceneElement({ version: 1, x: 1 })], [], "a");
  const tombstone = sceneElement({ version: 2, versionNonce: 2, isDeleted: true, x: 1 });
  assert.equal(mergeSnapshot(room, [tombstone], [], "a").elements[0].isDeleted, true);
  assert.equal(mergeSnapshot(room, [sceneElement({ version: 1, versionNonce: 99, x: 99 })], [], "b").elements.length, 0);
  assert.equal(room.elements.get("e1").isDeleted, true);
});

test("duplicate and reordered updates converge to the highest version/nonce under the current merge rule", () => {
  const room = emptyRoom();
  const updates = [
    sceneElement({ version: 2, versionNonce: 20, x: 20 }),
    sceneElement({ version: 1, versionNonce: 90, x: 10 }),
    sceneElement({ version: 2, versionNonce: 25, x: 25 }),
    sceneElement({ version: 2, versionNonce: 25, x: 25 }),
  ];
  const acceptedCounts = updates.map((entry) => mergeSnapshot(room, [entry], [], "writer").elements.length);
  assert.deepEqual(acceptedCounts, [1, 0, 1, 0]);
  assert.equal(room.elements.get("e1").x, 25);
  assert.equal(room.elements.get("e1").versionNonce, 25);
});

test("file records are accepted and an invalid file is rejected", () => {
  const room = emptyRoom();
  const valid = { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AA==" };
  assert.equal(mergeSnapshot(room, [], { f1: valid }).files.length, 1);
  assert.throws(() => mergeSnapshot(room, [], { f2: { id: "different", mimeType: "image/png", dataURL: "data" } }), /invalid collaboration file/i);
});

test("existing server size limits remain in effect", () => {
  assert.equal(MAX_ELEMENTS, 10000);
  assert.equal(MAX_FILES, 500);
  const room = emptyRoom();
  assert.throws(() => mergeSnapshot(room, new Array(MAX_ELEMENTS + 1), []), /invalid collaboration scene/i);
  assert.throws(() => mergeSnapshot(room, [], new Array(MAX_FILES + 1).fill(null)), /too many collaboration files/i);
});


test("an equal-version edit can win over a tombstone if its versionNonce is higher", () => {
  const room = emptyRoom();
  mergeSnapshot(room, [sceneElement({ version: 5, versionNonce: 10, isDeleted: true })], [], "delete-writer");
  const edit = sceneElement({ version: 5, versionNonce: 11, isDeleted: false, x: 88 });
  const accepted = mergeSnapshot(room, [edit], [], "edit-writer");
  assert.equal(accepted.elements.length, 1);
  assert.equal(room.elements.get("e1").isDeleted, false);
  assert.equal(room.elements.get("e1").x, 88);
});
