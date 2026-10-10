import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchCurrentUser, invalidateCurrentUserCache, signOut, AUTH_STATUS_TIMEOUT_MS } from "../src/features/auth/authClient.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
  invalidateCurrentUserCache();
});

test("service worker bypasses authentication API cache handling", async () => {
  const source = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
  assert.match(source, /url\.pathname === "\/api\/auth" \|\| url\.pathname\.startsWith\("\/api\/auth\/"\)/);
  assert.match(source, /url\.pathname === "\/api\/ai" \|\| url\.pathname\.startsWith\("\/api\/ai\/"\)/);
  assert.match(source, /Never cache sessions, CSRF tokens, OAuth callbacks, usage quotas, chat responses, or diagram context/);
});

test("auth client uses same-origin endpoints and does not persist credentials", async () => {
  const source = await readFile(new URL("../src/features/auth/authClient.js", import.meta.url), "utf8");
  assert.match(source, /"\/api\/auth\/me"/);
  assert.match(source, /"\/api\/auth\/logout"/);
  assert.match(source, /credentials: "same-origin"/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("fast successful status check returns the current user", async () => {
  globalThis.fetch = async () => Response.json({ authenticated: true, user: { id: "user-1", name: "Test User" } });
  assert.deepEqual(await fetchCurrentUser(undefined, { force: true }), { authenticated: true, user: { id: "user-1", name: "Test User" } });
});

test("concurrent status checks share one network request", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({ authenticated: false });
  };
  const [first, second] = await Promise.all([fetchCurrentUser(undefined, { force: true }), fetchCurrentUser(undefined, { force: true })]);
  assert.equal(calls, 1);
  assert.deepEqual(first, { authenticated: false, user: null });
  assert.deepEqual(second, first);
});

test("HTTP 5xx is unavailable, not an unauthenticated result", async () => {
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(fetchCurrentUser(undefined, { force: true }), /HTTP 503/);
});

test("slow status check is bounded by the client timeout", async () => {
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const started = Date.now();
  await assert.rejects(fetchCurrentUser(undefined, { force: true }), /timed out/i);
  assert.ok(Date.now() - started < AUTH_STATUS_TIMEOUT_MS + 1000);
});

test("caller cancellation resolves by rejecting that caller without marking the session anonymous", async () => {
  globalThis.fetch = async () => Response.json({ authenticated: true, user: { id: "user-2" } });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchCurrentUser(controller.signal), { name: "AbortError" });
});

test("401 explicitly resolves as anonymous", async () => {
  globalThis.fetch = async () => new Response(null, { status: 401 });
  assert.deepEqual(await fetchCurrentUser(undefined, { force: true }), { authenticated: false, user: null });
});

test("status check recovers after a temporary service outage", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("unavailable", { status: 503 });
    return Response.json({ authenticated: true, user: { id: "recovered-user" } });
  };
  await assert.rejects(fetchCurrentUser(undefined, { force: true }), /HTTP 503/);
  assert.deepEqual(await fetchCurrentUser(undefined, { force: true }), { authenticated: true, user: { id: "recovered-user" } });
  assert.equal(calls, 2);
});

test("authentication control rechecks when an inactive tab becomes visible", async () => {
  const source = await readFile(new URL("../src/features/auth/AuthenticationControl.jsx", import.meta.url), "utf8");
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(source, /recheckCurrentUserIfStale\(\)/);
  assert.match(source, /now - lastVisibleCheck < 30000/);
});


test("successful sign-out clears cached identity and broadcasts the auth change", async () => {
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event) };
  globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  let statusCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/auth/me") {
      statusCalls += 1;
      return Response.json({ authenticated: true, user: { id: "signed-in-user" } });
    }
    if (String(url) === "/api/auth/csrf") return Response.json({ token: "csrf", headerName: "X-XSRF-TOKEN" });
    if (String(url) === "/api/auth/logout") return new Response(null, { status: 204 });
    throw new Error(`Unexpected URL ${url}`);
  };
  await fetchCurrentUser(undefined, { force: true });
  await signOut();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "sketchizi:auth-changed");
  assert.equal(events[0].detail.signedOut, true);
  assert.deepEqual(await fetchCurrentUser(), { authenticated: true, user: { id: "signed-in-user" } });
  assert.equal(statusCalls, 2, "the next status check must go to the server instead of using cached identity");
});
