import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/github/[[path]].js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("GitHub gateway reports a missing backend without caching", async () => {
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/github/connection"), env: {} });
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("repository authorization redirects remain on the same-origin gateway", async () => {
  let target;
  globalThis.fetch = async (url) => {
    target = String(url);
    return new Response(null, { status: 302, headers: { location: "https://github.com/login/oauth/authorize?client_id=test&state=abc" } });
  };
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/github/connect?returnTo=%2F"), env: { AUTH_SERVICE_ORIGIN: "https://auth.example.test" } });
  assert.equal(target, "https://auth.example.test/api/github/connect?returnTo=%2F");
  assert.equal(response.headers.get("location"), "https://github.com/login/oauth/authorize?client_id=test&state=abc");
});

test("GitHub callback and query are proxied to the backend without rewriting the path", async () => {
  let target;
  globalThis.fetch = async (url) => { target = String(url); return new Response(null, { status: 302, headers: { location: "https://sketchizi.pages.dev/?githubRepoConnected=true" } }); };
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/github/callback?code=sample&state=opaque"), env: { AUTH_SERVICE_ORIGIN: "https://auth.example.test" } });
  assert.equal(target, "https://auth.example.test/api/github/callback?code=sample&state=opaque");
  assert.equal(response.headers.get("location"), "https://sketchizi.pages.dev/?githubRepoConnected=true");
});

test("GitHub disconnect forwards the CSRF header and never caches the response", async () => {
  let seen;
  globalThis.fetch = async (url, options) => { seen = { url: String(url), options }; return new Response(null, { status: 204 }); };
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/github/disconnect", { method: "POST", headers: { "x-xsrf-token": "csrf-value" } }), env: { AUTH_SERVICE_ORIGIN: "https://auth.example.test" } });
  assert.equal(seen.url, "https://auth.example.test/api/github/disconnect");
  assert.equal(seen.options.headers.get("x-xsrf-token"), "csrf-value");
  assert.equal(response.status, 204);
  assert.match(response.headers.get("cache-control"), /no-store/);
});
