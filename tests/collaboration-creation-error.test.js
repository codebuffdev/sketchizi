import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("collaboration connection failures preserve an actionable reason", async () => {
  const hook = await read("../src/features/collaboration/useCollaboration.js");
  assert.match(hook, /failCollaborationCreation\(message \|\| "The collaboration connection failed/);
  assert.match(hook, /did not complete its handshake within 15 seconds/);
  assert.match(hook, /server's \/health endpoint responds/);
  assert.match(hook, /connectCollaboration\(roomId, name, authenticatedName, token\);[\s\S]*?if \(!collaborationCreationAttemptRef\.current\) return;[\s\S]*?setTimeout/);
  assert.match(hook, /setCollaborationError\(message \|\| "Collaboration failed/);
});

test("header displays the collaboration failure reason and keeps retry", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const app = await read("../src/App.jsx");
  assert.match(header, /collaborationCreationError = ""/);
  assert.match(header, /title=\{collaborationCreationError/);
  assert.match(header, /onClick=\{createCollaboration\}>Try again/);
  assert.match(app, /collaborationCreationError=\{collaborationError\}/);
});


test("server rejection messages are handled even when the server omits roomId", async () => {
  const client = await read("../src/collaboration.js");
  const errorBranch = client.indexOf('if (message.type === "error")');
  const roomGuard = client.indexOf('if (message.roomId !== this.roomId) return;', errorBranch);
  assert.ok(errorBranch >= 0, "the client must inspect server errors before applying the room guard");
  assert.ok(roomGuard > errorBranch, "room-scoped messages should be filtered after server rejection handling");
  const branch = client.slice(errorBranch, roomGuard);
  assert.match(branch, /this\.fail\(reason\)/);
  assert.match(branch, /message\.code/);
});

test("collaboration service logs handshake, join, token rejection and close diagnostics without token values", async () => {
  const server = await read("../server/collaboration-server.mjs");
  const auth = await read("../server/hostAuthorization.mjs");
  for (const event of [
    "Collaboration WebSocket upgrade requested",
    "Collaboration WebSocket connection accepted",
    "Collaboration join request received",
    "Collaboration host authorization rejected",
    "Collaboration WebSocket handshake rejected",
    "Collaboration WebSocket closed",
    "Sketchizi collaboration server listening",
  ]) assert.ok(server.includes(event), `missing structured log event: ${event}`);
  assert.match(server, /hostAuthorizationSecretLengthValid/);
  assert.match(auth, /credential-signature-invalid/);
  assert.match(auth, /claim-room-mismatch/);
});


test("invalid initial snapshots are diagnosed and new rooms are committed only after validation", async () => {
  const server = await read("../server/collaboration-server.mjs");
  const mergeAt = server.indexOf("mergeSnapshot(room, message.snapshot?.elements || [], message.snapshot?.files || {}, clientId)");
  const commitAt = server.indexOf("rooms.set(room.id, room)", mergeAt);
  assert.ok(mergeAt >= 0, "initial snapshot must be validated");
  assert.ok(commitAt > mergeAt, "a new room must not be published before the initial snapshot validates");
  assert.match(server, /invalidFileRef: error\?\.fileRef/);
  assert.match(server, /invalidFileIndex: Number\.isInteger\(error\?\.fileIndex\)/);
  assert.match(server, /Collaboration scene update rejected/);
});


test("logger preserves safe auth configuration metadata while redacting credentials", async () => {
  const logger = await read("../server/logger.mjs");
  assert.match(logger, /safeMetadataKeySuffix/);
  assert.match(logger, /return redactKey\.test\(key\) && !safeMetadataKeySuffix\.test\(key\)/);
  assert.match(logger, /isSensitiveKey\(key\) \? "\[redacted\]"/);
});
