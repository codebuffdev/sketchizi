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
