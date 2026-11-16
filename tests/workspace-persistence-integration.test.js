import test from "node:test";
import assert from "node:assert/strict";
import { workspaceClient } from "../src/features/workspace/workspaceClient.js";

const jsonResponse = (payload, status = 200, headers = {}) => new Response(
  payload === null ? null : JSON.stringify(payload),
  { status, headers: { "content-type": "application/json", ...headers } },
);

test("cloud diagram document round-trips elements, app state, embedded files, and metadata with revision checks", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let revision = 7;
  let storedDocument = {
    elements: [{ id: "shape-1", type: "rectangle", x: 12, y: 24, width: 160, height: 80, isDeleted: false }],
    appState: { viewBackgroundColor: "#ffffff", gridSize: 20 },
    files: {
      "image-1": {
        id: "image-1",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,aW1hZ2UtZGF0YQ==",
        created: 1730000000000,
      },
    },
    metadata: { title: "Persistence acceptance" },
    extensions: { "sketchizi.architecture": { version: 1 } },
    format: "excalidraw",
  };
  const requests = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "https://sketchizi.test");
    requests.push({ path: url.pathname, method: init.method || "GET", headers: new Headers(init.headers), body: init.body });

    if (url.pathname === "/api/auth/csrf") {
      return jsonResponse({ token: "test-csrf-token", headerName: "x-xsrf-token" });
    }
    if (url.pathname === "/api/workspace/diagrams/diagram-1" && (!init.method || init.method === "GET")) {
      return jsonResponse({
        diagram: {
          id: "diagram-1",
          projectId: "project-1",
          name: "Persistence acceptance",
          revision,
          document: structuredClone(storedDocument),
        },
      });
    }
    if (url.pathname === "/api/workspace/diagrams/diagram-1" && init.method === "PUT") {
      const expectedRevision = Number(new Headers(init.headers).get("if-match"));
      if (expectedRevision !== revision) {
        return jsonResponse({ code: "revision_conflict", error: "The diagram was updated elsewhere." }, 412);
      }
      storedDocument = JSON.parse(init.body);
      revision += 1;
      return jsonResponse({ revision });
    }
    return jsonResponse({ error: "Unexpected test request", path: url.pathname }, 404);
  };

  const loaded = await workspaceClient.getDiagram("diagram-1");
  assert.equal(loaded.diagram.revision, 7);
  assert.deepEqual(loaded.diagram.document.elements, storedDocument.elements);
  assert.deepEqual(loaded.diagram.document.appState, storedDocument.appState);
  assert.deepEqual(loaded.diagram.document.files, storedDocument.files);
  assert.deepEqual(loaded.diagram.document.metadata, storedDocument.metadata);
  assert.deepEqual(loaded.diagram.document.extensions, storedDocument.extensions);

  const editedDocument = structuredClone(loaded.diagram.document);
  editedDocument.elements[0].x = 240;
  editedDocument.appState.gridSize = 40;
  editedDocument.metadata.title = "Edited and saved";
  await workspaceClient.saveDiagram("diagram-1", loaded.diagram.revision, editedDocument);
  assert.equal(revision, 8);
  assert.equal(storedDocument.elements[0].x, 240);
  assert.equal(storedDocument.appState.gridSize, 40);
  assert.equal(storedDocument.files["image-1"].dataURL, "data:image/png;base64,aW1hZ2UtZGF0YQ==");
  assert.equal(storedDocument.metadata.title, "Edited and saved");
  assert.deepEqual(storedDocument.extensions, editedDocument.extensions);

  const reopened = await workspaceClient.getDiagram("diagram-1");
  assert.equal(reopened.diagram.revision, 8);
  assert.deepEqual(reopened.diagram.document, editedDocument);

  await assert.rejects(
    workspaceClient.saveDiagram("diagram-1", 7, { ...editedDocument, elements: [] }),
    (error) => error.status === 412 && error.code === "revision_conflict",
  );
  assert.equal(revision, 8, "a stale revision must not overwrite the current cloud document");
  assert.deepEqual(storedDocument, editedDocument);
  assert.ok(requests.some((request) => request.method === "PUT" && request.headers.get("if-match") === "7"));
  assert.ok(requests.some((request) => request.method === "PUT" && request.headers.get("x-xsrf-token") === "test-csrf-token"));
});
