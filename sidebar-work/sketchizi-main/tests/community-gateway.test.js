import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/reviews/[[path]].js";

test("community gateway fails closed when backend origin is missing", async () => {
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/reviews"), env: {} });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control").includes("no-store"), true);
});

test("community gateway forwards request path, query, session and CSRF headers", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://backend.example/api/reviews?sort=highest&page=0");
    assert.equal(init.method, "GET");
    assert.equal(init.headers.get("cookie"), "SESSION=session-value");
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const request = new Request("https://sketchizi.pages.dev/api/reviews?sort=highest&page=0", { headers: { cookie: "SESSION=session-value", "x-xsrf-token": "token" } });
  const response = await onRequest({ request, env: { AUTH_SERVICE_ORIGIN: "https://backend.example" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control").includes("no-store"), true);
});

test("community gateway rejects unsupported HTTP methods", async () => {
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/reviews", { method: "PUT" }), env: { AUTH_SERVICE_ORIGIN: "https://backend.example" } });
  assert.equal(response.status, 405);
});
