import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Cloud Workspace opens the existing sign-in dialog for anonymous or unavailable sessions", async () => {
  const source = await read("../src/main.jsx");
  const auth = await read("../src/features/auth/AuthenticationControl.jsx");
  assert.match(source, /get\("editor"\) === "1"/);
  assert.match(source, /if \(workspaceRoute && auth\.status !== "authenticated"\)\s*\{\s*return <PhoneAccessGate><App \/><\/PhoneAccessGate>/);
  assert.match(source, /<WorkspaceDashboard/);
  assert.match(source, /onOpenEditor=\{\(\) => \{ window\.location\.assign\("\/\?editor=1"\); \}\}/);
  assert.match(auth, /Sign in to access Cloud Workspace/);
  assert.match(auth, /setDialogOpen\(true\)/);
  assert.match(auth, /returnTo: window\.location\.pathname \+ window\.location\.search \+ window\.location\.hash/);
  assert.doesNotMatch(source, /Cloud Workspace could not verify your sign-in session\./);
});


test("Cloud Workspace is reachable from the editor Workspaces menu", async () => {
  const app = await read("../src/App.jsx");
  const root = await read("../src/main.jsx");
  assert.match(app, /Cloud Workspace/);
  assert.match(app, /window\.location\.assign\("\/workspace"\)/);
  assert.match(root, /window\.location\.pathname === "\/workspace"/);
  assert.match(root, /if \(workspaceRoute && auth\.status !== "authenticated"\)/);
});

test("Workspace stylesheet is scoped and imported by the dashboard component", async () => {
  const component = await read("../src/features/workspace/WorkspaceDashboard.jsx");
  const stylesheet = await read("../src/features/workspace/workspace.css");
  assert.match(component, /import "\.\/workspace\.css"/);
  assert.match(stylesheet, /\.cloud-workspace\{min-height:100vh/);
  assert.match(stylesheet, /\.cw-layout\{display:grid/);
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

test("cloud diagrams open in the existing editor and autosave with revision protection", async () => {
  const app = await read("../src/App.jsx");
  const dashboard = await read("../src/features/workspace/WorkspaceDashboard.jsx");
  const client = await read("../src/features/workspace/workspaceClient.js");
  assert.match(app, /cloudDiagramId/);
  assert.match(app, /workspaceClient\.getDiagram\(cloudDiagramId\)/);
  assert.match(app, /workspaceClient\.saveDiagram\(session\.diagramId, revision, document\)/);
  assert.match(app, /error\\?\\.status === 409 \\|\\| error\\?\\.status === 412/);
  assert.match(app, /state: conflict \\? "conflict" : "error"/);
  assert.match(app, />Reload latest version<\\/button>/);
  assert.match(app, /Saving to Cloud Workspace/);
  assert.match(app, />Retry save<\/button>/);
  assert.match(app, />Download backup<\/button>/);
  assert.match(dashboard, /cloudDiagramId=/);
  assert.doesNotMatch(dashboard, /Cloud editor integration is the next phase/);
  assert.match(client, /saveDiagram: \(diagramId, revision, document\)/);
  assert.match(client, /"if-match": String\(revision\)/);
});
