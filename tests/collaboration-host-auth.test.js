import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyHostAuthorization } from "../server/hostAuthorization.mjs";

const secret = "test-only-shared-secret-with-at-least-32-bytes";
const roomId = "room_123456789012345678901234";
function makeToken(overrides = {}) {
  const claims = { aud: "sketchizi-collaboration-host", sub: "google-subject-123", name: "Authenticated Profile", roomId, exp: 2000, ...overrides };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload, "ascii").digest("base64url");
  return `${payload}.${signature}`;
}

test("accepts a valid room-bound signed host authorization", () => {
  assert.deepEqual(verifyHostAuthorization(makeToken(), roomId, secret, 1700), {
    subject: "google-subject-123", name: "Authenticated Profile", roomId, expiresAt: 2000,
  });
});
test("rejects missing secret, tampering, wrong room, and expired tokens", () => {
  const token = makeToken();
  assert.equal(verifyHostAuthorization(token, roomId, "short", 1700), null);
  assert.equal(verifyHostAuthorization(`${token}x`, roomId, secret, 1700), null);
  assert.equal(verifyHostAuthorization(token, "another_room_123456789012345678", secret, 1700), null);
  assert.equal(verifyHostAuthorization(makeToken({ exp: 1600 }), roomId, secret, 1700), null);
});
test("creation boundary requires a verified host authorization before creating a room", async () => {
  const source = await readFile(new URL("../server/collaboration-server.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(!hostAuthorization\)[\s\S]{0,240}Host authorization required/);
  assert.match(source, /hostSubject: hostAuthorization\.subject/);
  assert.match(source, /displayName: room\.hostName/);
});
test("host dialog omits editable name while join dialog retains guest name", async () => {
  const source = await readFile(new URL("../src/components/app/CollaborationUI.jsx", import.meta.url), "utf8");
  const createBlock = source.split('{mode === "create" && collaborationCreationState === "idle" && <>')[1].split('{mode === "join" && <>')[0];
  assert.doesNotMatch(createBlock, /Your name/);
  const joinBlock = source.split('{mode === "join" && <>')[1].split('{mode === "active" && <>')[0];
  assert.match(joinBlock, /Your name/);
});
test("host authorization uses CSRF-protected same-origin API and does not persist token", async () => {
  const source = await readFile(new URL("../src/features/auth/authClient.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/auth\/collaboration-host-token/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /\[headerName \|\| "X-XSRF-TOKEN"\]: token/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(?:token|auth)/i);
});
