import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "playwright";

const { STAGING_BASE_URL, WORKSPACE_TEST_STORAGE_STATE, WORKSPACE_TEST_PROJECT_ID } = process.env;
if (!STAGING_BASE_URL || !WORKSPACE_TEST_STORAGE_STATE || !WORKSPACE_TEST_PROJECT_ID) {
  throw new Error("Use a deployed staging URL, a test account storage-state file, and a disposable Workspace project.");
}
const url = new URL(STAGING_BASE_URL);
assert.equal(url.protocol, "https:");
assert.equal(url.username + url.password, "", "Use a storage-state file for authentication.");
assert.notEqual(url.hostname, "sketchizi.pages.dev", "Use a staging deployment for this write test.");
const context = await request.newContext({
  baseURL: url.origin,
  storageState: WORKSPACE_TEST_STORAGE_STATE,
  maxRedirects: 0,
  timeout: 15000,
});
const createdIds = new Set();
const name = `Staging workspace contract ${randomUUID()}`;
const project = encodeURIComponent(WORKSPACE_TEST_PROJECT_ID);
const document = (text) => ({
  elements: [{ id: "contract-text", type: "text", text }],
  appState: {},
  files: {},
});

async function workspace(path, { method = "GET", data, revision } = {}) {
  const headers = { accept: "application/json" };
  if (method !== "GET") {
    const response = await context.get("/api/auth/csrf");
    assert.equal(response.status(), 200, "Staging test account must have a valid session.");
    const { headerName, token } = await response.json();
    assert.ok(headerName && token, "Expected a CSRF header and token.");
    headers[headerName] = token;
  }
  if (revision != null) headers["if-match"] = String(revision);
  const response = await context.fetch(`/api/workspace${path}`, { method, headers, data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function create(name) {
  const result = await workspace("/diagrams", {
    method: "POST",
    data: { projectId: WORKSPACE_TEST_PROJECT_ID, name, format: "excalidraw", document: document("initial") },
  });
  if (result.status === 201 && result.body?.id) createdIds.add(result.body.id);
  return result;
}

try {
  assert.equal((await workspace(`/projects/${project}`)).status, 200, "Disposable staging project must be accessible.");
  const attempts = await Promise.allSettled([create(name), create(name.toUpperCase())]);
  const rejected = attempts.find(({ status }) => status === "rejected");
  if (rejected) throw rejected.reason;
  const results = attempts.map(({ value }) => value);
  assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409], "Exactly one concurrent normalized-name create must succeed.");
  assert.equal(results.find(({ status }) => status === 409).body?.code, "duplicate_diagram_name");

  const created = results.find(({ status }) => status === 201).body;
  const path = `/diagrams/${encodeURIComponent(created.id)}`;
  const saved = await workspace(path, { method: "PUT", revision: created.revision, data: document("updated") });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, created.revision + 1);
  const reopened = await workspace(path);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.revision, saved.body.revision);
  assert.equal(reopened.body.document.elements[0].text, "updated");
  const conflict = await workspace(path, { method: "PUT", revision: created.revision, data: document("stale") });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body?.code, "revision_conflict");
  const afterConflict = await workspace(path);
  assert.equal(afterConflict.body?.document?.elements?.[0]?.text, "updated");
  console.log("PASS: Workspace uniqueness, save, reopen, and revision conflict hold through the staging gateway.");
} finally {
  const cleanup = await Promise.allSettled([...createdIds].map(async (id) => {
    const result = await workspace(`/diagrams/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (![200, 204, 404].includes(result.status)) throw new Error(`Cleanup returned ${result.status}.`);
  }));
  await context.dispose();
  if (cleanup.some(({ status }) => status === "rejected")) {
    console.error("Could not remove all drawings created by this run. Check the disposable test project.");
    process.exitCode = 1;
  }
}
