import assert from "node:assert/strict";
import test from "node:test";
import { getCsrfHeaders, invalidateCsrfToken } from "../src/features/auth/csrfClient.js";
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
