import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/workspace/[[path]].js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("gateway fails safely when backend origin is not configured", async () => {
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/workspace/projects"), env: {} });
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("gateway proxies authenticated project reads to the fixed backend origin", async () => {
  let seen;
  globalThis.fetch = async (url, options) => {
    seen = { url: String(url), options };
    return Response.json([{ id: "project-1" }], { headers: { "cache-control": "public, max-age=3600" } });
  };
  const request = new Request("https://sketchizi.pages.dev/api/workspace/projects?limit=10", { headers: { cookie: "SESSION=private", accept: "application/json" } });
  const response = await onRequest({ request, env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" } });
  assert.equal(response.status, 200);
  assert.equal(seen.url, "https://backend.example.test/api/workspace/projects?limit=10");
  assert.equal(seen.options.headers.get("cookie"), "SESSION=private");
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("gateway rejects state-changing requests without a matching Origin", async () => {
  let invoked = false;
  globalThis.fetch = async () => { invoked = true; return new Response("ok"); };
  const request = new Request("https://sketchizi.pages.dev/api/workspace/projects", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example.test" }, body: "{}" });
  const response = await onRequest({ request, env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" } });
  assert.equal(response.status, 403);
  assert.equal(invoked, false);
});

test("gateway forwards CSRF header and revision precondition on saves", async () => {
  let seen;
  globalThis.fetch = async (url, options) => {
    seen = { url: String(url), options };
    return Response.json({ revision: 2 }, { headers: { etag: "\"2\"" } });
  };
  const request = new Request("https://sketchizi.pages.dev/api/workspace/diagrams/diagram-1", {
    method: "PUT",
    headers: { origin: "https://sketchizi.pages.dev", cookie: "SESSION=private", "x-xsrf-token": "csrf", "if-match": "\"1\"", "content-type": "application/json" },
    body: JSON.stringify({ name: "Diagram", format: "excalidraw", revision: 1, document: { elements: [] } })
  });
  const response = await onRequest({ request, env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test", PUBLIC_FRONTEND_ORIGIN: "https://sketchizi.pages.dev" } });
  assert.equal(response.status, 200);
  assert.equal(seen.options.headers.get("x-xsrf-token"), "csrf");
  assert.equal(seen.options.headers.get("if-match"), "\"1\"");
});

test("gateway rejects dot segments and unsupported methods", async () => {
  const pathResponse = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/workspace/../auth/me"), env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" } });
  assert.ok([400,404].includes(pathResponse.status)); // URL parsers normalize traversal before the worker receives it.
  const methodResponse = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/workspace/projects", { method: "OPTIONS" }), env: { AUTH_SERVICE_ORIGIN: "https://backend.example.test" } });
  assert.equal(methodResponse.status, 405);
});
