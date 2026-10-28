import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCloudDocument, sanitizeCloudAppState } from "../src/features/workspace/cloudDocument.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("studio menu uses official Kubernetes and Docker brand artwork", async () => {
  const app = await read("../src/App.jsx");
  const kubernetes = await read("../public/icons/kubernetes.svg");
  const docker = await read("../public/icons/docker.svg");
  assert.match(app, /src="\/icons\/kubernetes\.svg"/);
  assert.match(app, /src="\/icons\/docker\.svg"/);
  assert.match(kubernetes, /<title>Kubernetes<\/title>/);
  assert.match(kubernetes, /fill="#326ce5"/);
  assert.match(docker, /<title>Docker<\/title>/);
  assert.match(docker, /fill="#2496ed"/);
  assert.doesNotMatch(kubernetes, />KUB<\/text>/);
  assert.doesNotMatch(docker, />DOC<\/text>/);
});

test("Tool menu only contains tools not already on the dock and uses labeled SVG icons", async () => {
  const menu = await read("../src/components/app/MoreTools.jsx");
  const styles = await read("../src/styles/header-redesign.css");
  assert.match(menu, /aria-label="Tool"/);
  assert.match(menu, /<span>Tool<\/span>/);
  assert.match(menu, /function ToolIcon\(/);
  assert.match(menu, /<ToolIcon name=\{tool\} \/>/);
  assert.match(menu, /\["image", "Insert image", "9"\]/);
  assert.match(menu, /\["frame", "Frame tool", "F"\]/);
  assert.match(menu, /\["embeddable", "Web Embed", ""\]/);
  assert.match(menu, /\["laser", "Laser pointer", "K"\]/);
  assert.match(menu, /\["lasso", "Lasso selection", ""\]/);
  assert.doesNotMatch(menu, /Draw to shape|Bucket fill|Text to diagram|Mermaid to Excalidraw|Wireframe to code|more-tools-section-title/);
  assert.match(styles, /content: none;/);
});

test("editor toolbar uses recognizable icons for workspaces, AI Ask, and validation", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /className="workspaces-menu-icon"[^>]*><path d="M3\.5 7\.5h6l2 2h9/);
  assert.match(app, /className="ai-ask-toggle-icon"[^>]*><path d="M20 11\.5a7\.5 7\.5/);
  assert.match(app, /className="architecture-validation-toggle-icon"[^>]*><path d="M12 3 20 6/);
  assert.doesNotMatch(app, /<span className="ai-ask-toggle-icon" aria-hidden="true">✳<\/span>/);
  assert.doesNotMatch(app, /<span className="architecture-validation-toggle-icon">✓<\/span>/);
});

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

test("Cloud Workspace thumbnails reflect saved diagram elements and the diagram grid scrolls", async () => {
  const dashboard = await read("../src/features/workspace/WorkspaceDashboard.jsx");
  const stylesheet = await read("../src/features/workspace/workspace.css");
  assert.match(dashboard, /const DiagramThumbnail = \(\{ diagram \}\)/);
  assert.match(dashboard, /diagram\?\.document/);
  assert.match(dashboard, /document\.elements/);
  assert.match(dashboard, /<DiagramThumbnail diagram=\{d\} \/>/);
  assert.doesNotMatch(dashboard, /<div className="cw-diagram-preview"><span\/><i\/><span\/><\/div>/);
  assert.match(stylesheet, /\.cw-diagram-grid\{[^}]*max-height:max\(120px,calc\(100vh - 410px\)\)[^}]*overflow-y:auto/);
  assert.match(stylesheet, /\.cw-diagram-grid::-webkit-scrollbar-thumb/);
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

test("New file detaches from an open Cloud Workspace diagram before clearing the canvas", async () => {
  const files = await read("../src/features/files/useFileManager.js");
  const app = await read("../src/App.jsx");
  assert.match(files, /dispatchEvent\(new CustomEvent\("sketchizi:detach-cloud-document"\)\)/);
  assert.match(files, /searchParams\.delete\("cloudDiagramId"\)/);
  assert.match(files, /searchParams\.delete\("cloudProjectId"\)/);
  assert.match(app, /addEventListener\("sketchizi:detach-cloud-document", detachCloudDocument\)/);
  assert.match(app, /cloudSessionRef\.current = \{ active: false, diagramId: "", projectId: "", revision: null, name: "" \}/);
  assert.match(app, /setCloudSaveState\(\{ state: "inactive", error: "" \}\)/);
});

test("cloud diagrams open in the existing editor and autosave with revision protection", async () => {
  const app = await read("../src/App.jsx");
  const dashboard = await read("../src/features/workspace/WorkspaceDashboard.jsx");
  const client = await read("../src/features/workspace/workspaceClient.js");
  assert.match(app, /cloudDiagramId/);
  assert.match(app, /workspaceClient\.getDiagram\(cloudDiagramId\)/);
  assert.match(app, /workspaceClient\.saveDiagram\(session\.diagramId, revision, document\)/);
  assert.match(app, /if \(!Array\.isArray\(elements\) \|\| !elements\.some\(\(element\) => element && !element\.isDeleted\)\) return;/);
  assert.doesNotMatch(app, /allowEmpty: true/);
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
  assert.match(app, /createCloudDocument\(/);
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
  assert.match(app, /if \(!limits\?\.admin\) \{/);
  assert.doesNotMatch(dialog, /MAX_DOCUMENT_BYTES/);
  assert.match(app, /new TextEncoder\(\)\.encode\(serializedDocument\)\.byteLength/);
  assert.match(app, /above the 2 MiB Cloud Workspace limit/);
});


test("cloud document excludes deleted elements and unreferenced cached files", () => {
  const api = {
    getSceneElements: () => [
      { id: "visible-image", type: "image", fileId: "used-file" },
      { id: "deleted-image", type: "image", fileId: "deleted-file", isDeleted: true },
    ],
    getAppState: () => ({ viewBackgroundColor: "#fff" }),
    getFiles: () => ({
      "used-file": { id: "used-file", dataURL: "data:image/png;base64,small" },
      "deleted-file": { id: "deleted-file", dataURL: "data:image/png;base64,deleted" },
      "orphan-file": { id: "orphan-file", dataURL: "data:image/png;base64,unused" },
    }),
  };
  const document = createCloudDocument({ api });
  assert.deepEqual(document.elements.map((element) => element.id), ["visible-image"]);
  assert.deepEqual(Object.keys(document.files), ["used-file"]);
});

test("cloud document refuses to save an empty canvas", () => {
  const api = {
    getSceneElements: () => [],
    getAppState: () => ({}),
    getFiles: () => ({ "stale-file": { id: "stale-file", dataURL: "data:image/png;base64,unused" } }),
  };
  assert.throws(() => createCloudDocument({ api }), /canvas is empty/i);
});

test("existing cloud diagrams can still be saved after all visible elements are deleted", () => {
  const api = {
    getSceneElements: () => [],
    getAppState: () => ({}),
    getFiles: () => ({ "stale-file": { id: "stale-file", dataURL: "data:image/png;base64,unused" } }),
  };
  const document = createCloudDocument({ api, allowEmpty: true });
  assert.deepEqual(document.elements, []);
  assert.deepEqual(document.files, {});
});


test("cloud document sanitizes Excalidraw runtime appState before persistence and restore", () => {
  const collaborators = new Map([["user-1", { username: "Example" }]]);
  const appState = sanitizeCloudAppState({
    viewBackgroundColor: "#fff",
    scrollX: 12,
    scrollY: -8,
    zoom: { value: 1.25 },
    gridModeEnabled: true,
    currentItemFontFamily: 3,
    collaborators,
    selectedElementIds: { element1: true },
    openMenu: "canvas",
  });
  assert.deepEqual(appState, {
    viewBackgroundColor: "#fff",
    scrollX: 12,
    scrollY: -8,
    zoom: { value: 1.25 },
    gridModeEnabled: true,
    currentItemFontFamily: 3,
  });
  assert.equal(Object.hasOwn(appState, "collaborators"), false);
  assert.equal(Object.hasOwn(appState, "selectedElementIds"), false);
});


test("admin cloud-save path bypasses the standard 2 MiB frontend document limit", async () => {
  const app = await read("../src/App.jsx");
  const dialog = await read("../src/features/workspace/CloudSaveDialog.jsx");
  assert.match(app, /if \(!limits\?\.admin\) \{/);
  assert.match(app, /standard accounts/);
  assert.match(dialog, /workspaceClient\.getLimits\(\)/);
  assert.match(dialog, /Administrator accounts are exempt from the standard 2 MiB application limit/);
  assert.doesNotMatch(dialog, /MAX_DOCUMENT_BYTES/);
});
