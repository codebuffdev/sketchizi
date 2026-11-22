import test from "node:test";
import assert from "node:assert/strict";
import { sceneFingerprint, createRevisionRegistry, classifyConflict, isRevisionConflict } from "../src/features/workspace/cloudSaveGuard.js";

const el = (id, version = 1, extra = {}) => ({ id, version, versionNonce: version * 7, ...extra });

test("fingerprint ignores deleted elements and order, reacts to edits and files", () => {
  const a = sceneFingerprint([el("a"), el("b")], {});
  assert.equal(a, sceneFingerprint([el("b"), el("a"), el("z", 3, { isDeleted: true })], {}));
  assert.notEqual(a, sceneFingerprint([el("a", 2), el("b")], {}));
  assert.notEqual(a, sceneFingerprint([el("a"), el("b")], { f1: {} }));
});

test("revision registry only moves forward and beats stale session copies", () => {
  const r = createRevisionRegistry();
  r.note("d", 5); r.note("d", 3);
  assert.equal(r.get("d"), 5);
  assert.equal(r.effective("d", 2), 5);
  assert.equal(r.effective("d", 9), 9);
  assert.equal(r.effective("other", 4), 4);
});

test("conflict classification", () => {
  const base = { attemptedFingerprint: "A", savedFingerprint: "S", localFingerprint: "L" };
  assert.equal(classifyConflict({ ...base, remoteFingerprint: "A" }), "self-echo");
  assert.equal(classifyConflict({ ...base, remoteFingerprint: "R", localFingerprint: "S" }), "reload");
  assert.equal(classifyConflict({ ...base, remoteFingerprint: "R" }), "conflict");
  assert.ok(isRevisionConflict({ status: 409 }) && isRevisionConflict({ code: "revision_conflict" }) && !isRevisionConflict({ status: 500 }));
});
