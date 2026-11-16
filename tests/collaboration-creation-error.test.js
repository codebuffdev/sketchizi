import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("collaboration connection failures preserve an actionable reason", async () => {
  const hook = await read("../src/features/collaboration/useCollaboration.js");
  assert.match(hook, /failCollaborationCreation\(message \|\| "The collaboration connection failed/);
  assert.match(hook, /WebSocket handshake did not complete within 15 seconds/);
  assert.match(hook, /server's \/health endpoint responds/);
  assert.match(hook, /onJoinSent:\s*\(\)\s*=>/);
  assert.match(hook, /did not acknowledge the join request within 60 seconds after it was sent/);
  assert.match(hook, /onJoinSent[\s\S]*?clearCollaborationCreationTimeout\(\)[\s\S]*?setTimeout[\s\S]*?60000/);
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


test("initial join acknowledgement timeout starts after the payload is queued", async () => {
  const client = await read("../src/collaboration.js");
  const openHandler = client.indexOf("socket.onopen = async () => {");
  const sendJoin = client.indexOf("const joinSent = this.send(joinMessage);", openHandler);
  const joinSentBlock = client.indexOf("if (joinSent) {", sendJoin);
  const ackTimer = client.indexOf("this.startJoinAckTimeout(socket);", joinSentBlock);
  const callback = client.indexOf("this.onJoinSent?.(", joinSentBlock);
  assert.ok(openHandler >= 0, "WebSocket open handler must exist");
  assert.ok(sendJoin > openHandler, "join payload should be sent after socket opens");
  assert.ok(joinSentBlock > sendJoin, "acknowledgement timeout must only start after send succeeds");
  assert.ok(ackTimer > joinSentBlock, "the client must arm its acknowledgement timeout after the join payload is queued");
  assert.ok(callback > ackTimer, "the creation callback must run after the acknowledgement deadline is armed");
  assert.match(client, /Collaboration initial snapshot prepared/);
  assert.match(client, /Collaboration join payload serialized/);
  assert.match(client, /Collaboration join message send completed/);
});
