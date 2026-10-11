import test from "node:test";
import assert from "node:assert/strict";
import { mergeSnapshot, chooseElement, collaborationFileValidationIssue, MAX_ELEMENTS, MAX_FILES, MAX_FILE_DATA_URL } from "../server/collaborationSyncCore.mjs";
import { normalizeCollaborationFiles } from "../src/features/collaboration/normalizeCollaborationFiles.js";

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


test("invalid file diagnostics identify missing record IDs without exposing raw file IDs", () => {
  const room = emptyRoom();
  assert.throws(
    () => mergeSnapshot(room, [], { ["registry-key-sensitive-value".repeat(5)]: { mimeType: "image/png", dataURL: "data:image/png;base64,AA==" } }),
    (error) => error.reason === "file-id-invalid" &&
      error.fileKeyPresent === true &&
      error.fileIdPresent === false &&
      error.fileIdType === "undefined" &&
      error.fileIdLength === -1 &&
      error.fileKeyMatchesId === false &&
      typeof error.fileRef === "string" &&
      !JSON.stringify(error).includes("registry-key-sensitive-value"),
  );
});


test("keyed file registries repair missing and malformed IDs but preserve valid mismatches", () => {
  const file = { mimeType: "image/png", dataURL: "data:image/png;base64,AA==" };
  const normalized = normalizeCollaborationFiles({
    missing: { ...file },
    nullId: { ...file, id: null },
    emptyId: { ...file, id: "" },
    numericId: { ...file, id: 7 },
    whitespaceId: { ...file, id: "   " },
    oversizedId: { ...file, id: "x".repeat(129) },
    mismatchKey: { ...file, id: "a-valid-but-different-id" },
  });

  for (const key of ["missing", "nullId", "emptyId", "numericId", "whitespaceId", "oversizedId"]) {
    assert.equal(normalized[key].id, key, `${key} should use its valid registry key`);
  }
  assert.equal(normalized.mismatchKey.id, "a-valid-but-different-id", "a valid mismatch must remain visible to validation");
});

test("server repairs malformed IDs from keyed snapshot registry without accepting valid mismatches", () => {
  const room = emptyRoom();
  const file = { mimeType: "image/png", dataURL: "data:image/png;base64,AA==" };
  const accepted = mergeSnapshot(room, [], {
    "numeric-id-key": { ...file, id: 3 },
    "missing-id-key": { ...file },
    "whitespace-id-key": { ...file, id: " " },
    "oversized-id-key": { ...file, id: "x".repeat(129) },
  });
  assert.equal(accepted.files.length, 4);
  assert.equal(room.files.get("numeric-id-key").id, "numeric-id-key");
  assert.equal(room.files.get("missing-id-key").id, "missing-id-key");
  assert.equal(room.files.get("whitespace-id-key").id, "whitespace-id-key");
  assert.equal(room.files.get("oversized-id-key").id, "oversized-id-key");

  assert.throws(
    () => mergeSnapshot(room, [], { "map-key": { ...file, id: "valid-other-id" } }),
    (error) => error.reason === "file-id-key-mismatch",
  );
});

test("server accepts a collaboration image that fits the shared 8 MiB message budget", () => {
  const room = emptyRoom();
  const dataURL = `data:image/png;base64,${"A".repeat(7 * 1024 * 1024)}`;
  const image = { id: "large-image", mimeType: "image/png", dataURL };
  assert.ok(MAX_FILE_DATA_URL > 6 * 1024 * 1024, "per-file limit must not contradict the client's supported message size");
  assert.equal(collaborationFileValidationIssue("large-image", image), null);
  assert.equal(mergeSnapshot(room, [], { "large-image": image }).files.length, 1);
});

test("server returns a specific reason for oversized or mismatched collaboration files", () => {
  const room = emptyRoom();
  const oversized = { id: "large-image", mimeType: "image/png", dataURL: `data:image/png;base64,${"A".repeat(MAX_FILE_DATA_URL + 1)}` };
  assert.throws(
    () => mergeSnapshot(room, [], { "large-image": oversized }),
    (error) => error.code === "COLLAB_FILE_DATA_TOO_LARGE" && /supported collaboration file-size limit/i.test(error.message),
  );
  const mismatch = { id: "different-id", mimeType: "image/png", dataURL: "data:image/png;base64,AA==" };
  assert.throws(
    () => mergeSnapshot(room, [], { "map-key": mismatch }),
    (error) => error.code === "COLLAB_FILE_INVALID" && /does not match its record key/i.test(error.message),
  );
});


test("invalid file batches are rejected before any element mutations are applied", () => {
  const room = emptyRoom();
  const existing = sceneElement({ id: "existing", version: 1, versionNonce: 1, x: 10 });
  mergeSnapshot(room, [existing], []);
  const incoming = sceneElement({ id: "incoming", version: 1, versionNonce: 1, x: 90 });
  const invalidFile = { id: "incorrect-id", mimeType: "image/png", dataURL: "data:image/png;base64,AA==" };
  assert.throws(() => mergeSnapshot(room, [incoming], { "file-key": invalidFile }), /file ID does not match its record key/i);
  assert.equal(room.elements.has("incoming"), false);
  assert.equal(room.elements.get("existing").x, 10);
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
