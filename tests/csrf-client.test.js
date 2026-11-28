import assert from "node:assert/strict";
import test from "node:test";
import { clearCsrfTokenCache, fetchWithCsrfRetry, forceRefreshCsrfToken, getCsrfHeaders, invalidateCsrfToken } from "../src/features/auth/csrfClient.js";
import { workspaceClient } from "../src/features/workspace/workspaceClient.js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; invalidateCsrfToken(); });

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("fetches /api/auth/csrf with credentials and caches the token in memory", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push([url, options]); return json({ token: "t1", headerName: "X-XSRF-TOKEN" }); };
  assert.deepEqual(await getCsrfHeaders(), { "X-XSRF-TOKEN": "t1" });
  assert.deepEqual(await getCsrfHeaders(), { "X-XSRF-TOKEN": "t1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/auth/csrf");
  assert.equal(calls[0][1].credentials, "include");
  await getCsrfHeaders({ force: true });
  assert.equal(calls.length, 2);
});

test("a transient token failure is retried once before surfacing the banner message", async () => {
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? json({}, 503) : json({ token: "t2", headerName: "X-XSRF-TOKEN" }));
  assert.deepEqual(await getCsrfHeaders(), { "X-XSRF-TOKEN": "t2" });
  invalidateCsrfToken();
  globalThis.fetch = async () => json({}, 503);
  await assert.rejects(getCsrfHeaders(), /Could not obtain a security token/);
});

test("a 403 on a cloud save refreshes the token once and retries the save automatically", async () => {
  const seen = [];
  let tokenN = 0;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/auth/csrf") return json({ token: `tok${++tokenN}`, headerName: "X-XSRF-TOKEN" });
    seen.push(options.headers.get("x-xsrf-token"));
    return seen.length === 1 ? json({ error: "forbidden", code: "csrf_rejected" }, 403) : json({ id: "d1", revision: 2 });
  };
  const result = await workspaceClient.saveDiagram("d1", 1, { elements: [] });
  assert.equal(result.revision, 2);
  assert.deepEqual(seen, ["tok1", "tok2"]);
});

test("a second 403 is surfaced instead of looping", async () => {
  let writes = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/auth/csrf") return json({ token: "x", headerName: "X-XSRF-TOKEN" });
    writes += 1; return json({ error: "forbidden" }, 403);
  };
  await assert.rejects(workspaceClient.saveDiagram("d1", 1, {}), (e) => e.status === 403);
  assert.equal(writes, 2);
});

test("clearCsrfTokenCache and forceRefreshCsrfToken always hit /api/auth/csrf", async () => {
  let n = 0;
  globalThis.fetch = async () => json({ token: `t${++n}`, headerName: "X-XSRF-TOKEN" });
  assert.deepEqual(await getCsrfHeaders(), { "X-XSRF-TOKEN": "t1" });
  assert.deepEqual(await forceRefreshCsrfToken(), { "X-XSRF-TOKEN": "t2" });
  assert.deepEqual(await getCsrfHeaders(), { "X-XSRF-TOKEN": "t2" });
  clearCsrfTokenCache();
  assert.deepEqual(await getCsrfHeaders(), { "X-XSRF-TOKEN": "t3" });
});

test("concurrent token requests share one in-flight fetch", async () => {
  let n = 0;
  globalThis.fetch = async () => { n += 1; await new Promise((r) => setTimeout(r, 15)); return json({ token: "shared", headerName: "X-XSRF-TOKEN" }); };
  const results = await Promise.all([getCsrfHeaders(), getCsrfHeaders(), getCsrfHeaders()]);
  assert.equal(n, 1);
  results.forEach((r) => assert.deepEqual(r, { "X-XSRF-TOKEN": "shared" }));
});

test("fetchWithCsrfRetry replays a 403 mutating request once with a fresh token", async () => {
  const seen = [];
  let tokenN = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/auth/csrf") return json({ token: `tok${++tokenN}`, headerName: "X-XSRF-TOKEN" });
    seen.push([options.method, options.headers.get("x-xsrf-token"), options.body]);
    return seen.length === 1 ? new Response(null, { status: 403 }) : json({ ok: true });
  };
  const response = await fetchWithCsrfRetry("/api/reviews", { method: "POST", body: "{\"a\":1}" });
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [["POST", "tok1", "{\"a\":1}"], ["POST", "tok2", "{\"a\":1}"]]);
});

test("fetchWithCsrfRetry does not touch GET requests or add a token", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return json({ ok: true }); };
  await fetchWithCsrfRetry("/api/reviews", { method: "GET" });
  assert.equal(calls, 1);
});

test("Retry save refreshes the security token before queueing the save", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const block = app.slice(app.indexOf(">Retry save</button>") - 600, app.indexOf(">Retry save</button>"));
  assert.ok(block.indexOf("await forceRefreshCsrfToken()") > -1);
  assert.ok(block.indexOf("forceRefreshCsrfToken()") < block.indexOf("queueSketchSave("));
});
