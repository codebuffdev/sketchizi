import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/workspace/[[path]].js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("gateway refuses an unconfigured workspace backend without caching", async () => {
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/workspace/projects"), env: {} });
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("mutating request requires same-origin Origin and CSRF cookie/header pair", async () => {
  const missingOrigin = await onRequest({
    request: new Request("https://sketchizi.pages.dev/api/workspace/projects", {
      method: "POST", headers: { "content-type": "application/json", cookie: "XSRF-TOKEN=token", "x-xsrf-token": "token" }, body: "{}"
    }),
    env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" }
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json()).code, "origin_rejected");

  const missingCsrf = await onRequest({
    request: new Request("https://sketchizi.pages.dev/api/workspace/projects", {
      method: "POST", headers: { origin: "https://sketchizi.pages.dev", "content-type": "application/json" }, body: "{}"
    }),
    env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" }
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal((await missingCsrf.json()).code, "csrf_rejected");
});

test("gateway proxies authenticated request with session, CSRF, and no-store headers", async () => {
  let upstreamUrl;
  let upstreamOptions;
  globalThis.fetch = async (url, options) => {
    upstreamUrl = String(url);
    upstreamOptions = options;
    return Response.json({ ok: true }, { status: 200, headers: { "cache-control": "public, max-age=3600" } });
  };
  const response = await onRequest({
    request: new Request("https://sketchizi.pages.dev/api/workspace/projects?limit=2", {
      headers: { cookie: "SESSION=session-id; XSRF-TOKEN=csrf-token", accept: "application/json" }
    }),
    env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" }
  });
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl, "https://backend.example.test/api/workspace/projects?limit=2");
  assert.equal(upstreamOptions.headers.get("cookie"), "SESSION=session-id; XSRF-TOKEN=csrf-token");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), { ok: true });
});

test("gateway rejects non-workspace paths and disallows arbitrary methods", async () => {
  const badPath = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/workspace/../auth/me"), env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" } });
  assert.ok([400, 404].includes(badPath.status));
  const badMethod = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/workspace/projects", { method: "OPTIONS" }), env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" } });
  assert.equal(badMethod.status, 405);
});


test("gateway rejects duplicate diagram names before forwarding create requests", async () => {
  let forwardedCreate = false;
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (options.method === "GET" && path === "/api/workspace/projects/project-1/diagrams") {
      return Response.json({ diagrams: [{ id: "existing", name: "System Design" }] });
    }
    if (options.method === "POST") forwardedCreate = true;
    return Response.json({ ok: true });
  };
  const response = await onRequest({
    request: new Request("https://sketchizi.pages.dev/api/workspace/diagrams", {
      method: "POST",
      headers: { origin: "https://sketchizi.pages.dev", cookie: "SESSION=session; XSRF-TOKEN=csrf", "x-xsrf-token": "csrf", "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-1", name: "  system   design " }),
    }),
    env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "duplicate_diagram_name");
  assert.equal(forwardedCreate, false);
});

test("gateway rejects duplicate diagram names before forwarding rename requests", async () => {
  let forwardedRename = false;
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (options.method === "GET" && path === "/api/workspace/diagrams/current") {
      return Response.json({ diagram: { id: "current", projectId: "project-1", name: "Old name" } });
    }
    if (options.method === "GET" && path === "/api/workspace/projects/project-1/diagrams") {
      return Response.json({ diagrams: [{ id: "current", name: "Old name" }, { id: "other", name: "New name" }] });
    }
    if (options.method === "PATCH") forwardedRename = true;
    return Response.json({ ok: true });
  };
  const response = await onRequest({
    request: new Request("https://sketchizi.pages.dev/api/workspace/diagrams/current", {
      method: "PATCH",
      headers: { origin: "https://sketchizi.pages.dev", cookie: "SESSION=session; XSRF-TOKEN=csrf", "x-xsrf-token": "csrf", "content-type": "application/json" },
      body: JSON.stringify({ name: "new name" }),
    }),
    env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "duplicate_diagram_name");
  assert.equal(forwardedRename, false);
});
