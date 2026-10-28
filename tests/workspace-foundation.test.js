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
  assert.ok(app.includes("error?.status === 409 || error?.status === 412"));
  assert.ok(app.includes('state: conflict ? "conflict" : "error"'));
  assert.ok(app.includes(">Reload latest version</button>"));
  assert.match(app, /Saving to Cloud Workspace/);
  assert.match(app, />Retry save<\/button>/);
  assert.match(app, />Download backup<\/button>/);
  assert.match(dashboard, /cloudDiagramId=/);
  assert.doesNotMatch(dashboard, /Cloud editor integration is the next phase/);
  assert.match(client, /saveDiagram: \(diagramId, revision, document\)/);
  assert.match(client, /"if-match": String\(revision\)/);
});


test("authenticated users keep the editor as the default route; Workspace is opt-in", async () => {
  const source = await read("../src/main.jsx");
  assert.match(source, /if \(!workspaceRoute\) return <PhoneAccessGate><App \/><\/PhoneAccessGate>/);
  assert.match(source, /return <WorkspaceDashboard/);
  assert.match(source, /const workspaceRoute = window\.location\.pathname === "\/workspace"/);
});

test("cloud-opened diagrams use their saved name in the editor identity", async () => {
  const source = await read("../src/App.jsx");
  assert.match(source, /currentDocumentName=\{cloudDiagramId \? \(cloudSessionRef\.current\.name \|\| "Cloud diagram"\)/);
  assert.match(source, /name: diagram\.name \|\| "Cloud diagram"/);
  const stylesheet = await read("../src/features/workspace/workspace.css");
  assert.match(stylesheet, /cloud-editor-save-status:not\(\.cloud-editor-save-status-error\):not\(\.cloud-editor-save-status-conflict\)\{display:none!important\}/);
});


test("editor exposes an explicit Save to Cloud action and creates a cloud diagram from the current document", async () => {
  const app = await read("../src/App.jsx");
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const dialog = await read("../src/features/workspace/CloudSaveDialog.jsx");
  assert.match(header, /desktop-app-save-to-cloud-button/);
  assert.match(header, /Save to Cloud/);
  assert.match(app, /workspaceClient\.createDiagram\(/);
  assert.match(app, /files: api\.getFiles\?\.\(\) \|\| \{\}/);
  assert.match(app, /cloudDiagramId=\$\{encodeURIComponent\(diagram\.id\)\}/);
  assert.match(dialog, /workspaceClient\.listProjects\(\)/);
  assert.match(dialog, /Save to Cloud Workspace/);
});


test("Workspace API requests time out instead of leaving save operations pending forever", async () => {
  const client = await read("../src/features/workspace/workspaceClient.js");
  const dialog = await read("../src/features/workspace/CloudSaveDialog.jsx");
  const app = await read("../src/App.jsx");
  assert.match(client, /REQUEST_TIMEOUT_MS = 12000/);
  assert.match(client, /signal: timeoutSignal\(\)/);
  assert.match(client, /Cloud Workspace request timed out/);
  assert.match(dialog, /MAX_DOCUMENT_BYTES = 2 \* 1024 \* 1024/);
  assert.match(app, /new TextEncoder\(\)\.encode\(serializedDocument\)\.byteLength/);
  assert.match(app, /above the 2 MiB Cloud Workspace limit/);
});
