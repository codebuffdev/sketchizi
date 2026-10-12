import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/auth/[[path]].js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("gateway returns no-store JSON when backend origin is missing", async () => {
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/auth/me"), env: {} });
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.json()).error, "Authentication service is not configured.");
});

test("gateway preserves POST body/status and forwards CSRF header without caching", async () => {
  let seen;
  globalThis.fetch = async (url, options) => {
    seen = { url: String(url), options };
    return new Response(null, { status: 204, headers: { "set-cookie": "SESSION=abc; Path=/; HttpOnly; Secure; SameSite=Lax", "cache-control": "public, max-age=3600" } });
  };
  const request = new Request("https://sketchizi.pages.dev/api/auth/logout?test=1", { method: "POST", headers: { "x-xsrf-token": "csrf-value", "content-type": "application/json" }, body: JSON.stringify({ yes: true }) });
  const response = await onRequest({ request, env: { AUTH_SERVICE_ORIGIN: "https://auth.example.test" } });
  assert.equal(seen.url, "https://auth.example.test/api/auth/logout?test=1");
  assert.equal(seen.options.method, "POST");
  assert.equal(seen.options.headers.get("x-xsrf-token"), "csrf-value");
  assert.deepEqual(await new Response(seen.options.body).json(), { yes: true });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});

test("Google callback path is rewritten to Spring Security callback", async () => {
  let target;
  globalThis.fetch = async (url) => { target = String(url); return new Response("ok"); };
  await onRequest({ request: new Request("https://sketchizi.pages.dev/api/auth/oauth2/callback/google?code=fake&state=fake"), env: { AUTH_SERVICE_ORIGIN: "https://auth.example.test" } });
  assert.equal(target, "https://auth.example.test/login/oauth2/code/google?code=fake&state=fake");
});

test("gateway does not allow arbitrary upstream URLs", async () => {
  let target;
  globalThis.fetch = async (url) => { target = String(url); return new Response("ok"); };
  await onRequest({ request: new Request("https://sketchizi.pages.dev/api/auth/me?next=https://evil.test"), env: { AUTH_SERVICE_ORIGIN: "https://auth.example.test" } });
  assert.equal(new URL(target).origin, "https://auth.example.test");
});

test("gateway rewrites Spring's relative authorization redirect back through the same-origin gateway", async () => {
  let target;
  globalThis.fetch = async (url) => { target = String(url); return new Response(null, { status: 302, headers: { location: "/oauth2/authorization/google" } }); };
  const response = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/auth/login/google?returnTo=%2Fcollab%2Froom"), env: { AUTH_SERVICE_ORIGIN: "https://auth.example.test" } });
  assert.equal(target, "https://auth.example.test/auth/login/google?returnTo=%2Fcollab%2Froom");
  assert.equal(response.headers.get("location"), "https://sketchizi.pages.dev/api/auth/oauth2/authorization/google");
});
