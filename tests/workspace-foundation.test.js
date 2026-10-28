import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Cloud Workspace is opt-in and the existing editor remains the default route", async () => {
  const source = await read("../src/main.jsx");
  assert.match(source, /get\("workspace"\) === "1"/);
  assert.match(source, /if \(!workspaceRoute \|\| auth\.status === "anonymous"\) return <PhoneAccessGate><App \/><\/PhoneAccessGate>/);
  assert.match(source, /<WorkspaceDashboard/);
});

test("Workspace client does not depend on the separate AI service warm-up", async () => {
  const source = await read("../src/features/workspace/workspaceClient.js");
  assert.doesNotMatch(source, /backendWarmup|ensureBackendReady/);
  assert.match(source, /const PREFIX = "\/api\/workspace"/);
  assert.match(source, /const CSRF_URL = "\/api\/auth\/csrf"/);
});

test("Vite development middleware routes Workspace API calls through the Pages Function", async () => {
  const source = await read("../vite.config.js");
  assert.match(source, /import \{ onRequest as workspaceGateway \} from "\.\/functions\/api\/workspace\/\[\[path\]\]\.js"/);
  assert.match(source, /const isWorkspace = path === "\/api\/workspace" \|\| path\.startsWith\("\/api\/workspace\/"\)/);
  assert.match(source, /: isWorkspace\s*\? workspaceGateway/);
});

test("service worker always sends Workspace API requests to the network", async () => {
  const source = await read("../public/service-worker.js");
  assert.match(source, /"\/api\/workspace"/);
  assert.match(source, /Personalized APIs must always reach the network/);
});
