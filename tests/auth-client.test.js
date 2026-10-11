import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchCurrentUser, invalidateCurrentUserCache } from "../src/features/auth/authClient.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

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


test("concurrent auth checks share one request and one caller can cancel independently", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let resolveResponse;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), "/api/auth/me");
    assert.equal(options.credentials, "same-origin");
    requests += 1;
    return new Promise((resolve) => { resolveResponse = resolve; });
  };
  invalidateCurrentUserCache();
  try {
    const cancelledCaller = new AbortController();
    const first = fetchCurrentUser(cancelledCaller.signal);
    const second = fetchCurrentUser();
    cancelledCaller.abort();
    await assert.rejects(first, (error) => error.name === "AbortError");
    assert.equal(requests, 1);

    resolveResponse(jsonResponse({ authenticated: true, user: { id: "account-1", name: "Test" } }));
    assert.deepEqual(await second, { authenticated: true, user: { id: "account-1", name: "Test" } });
    assert.deepEqual(await fetchCurrentUser(), { authenticated: true, user: { id: "account-1", name: "Test" } });
    assert.equal(requests, 1, "the warm in-memory cache should avoid a second fetch");
  } finally {
    invalidateCurrentUserCache();
    globalThis.fetch = originalFetch;
  }
});

test("auth status cache can be invalidated after an authentication change", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return jsonResponse({ authenticated: false, user: null }, 401);
  };
  invalidateCurrentUserCache();
  try {
    await fetchCurrentUser();
    await fetchCurrentUser();
    assert.equal(requests, 1, "anonymous status should be briefly cached");
    invalidateCurrentUserCache();
    await fetchCurrentUser();
    assert.equal(requests, 2, "an auth change must force a fresh status lookup");
  } finally {
    invalidateCurrentUserCache();
    globalThis.fetch = originalFetch;
  }
});

test("AI Ask marks authentication before waiting for conversation creation", async () => {
  const source = await readFile(new URL("../src/features/ai/AiAskPanel.jsx", import.meta.url), "utf8");
  const authenticatedIndex = source.indexOf('setAuth({ status: "authenticated", user, error: "" });');
  const conversationIndex = source.indexOf("ensureConversation(user.id).catch(() => {});");
  assert.notEqual(authenticatedIndex, -1);
  assert.notEqual(conversationIndex, -1);
  assert.ok(authenticatedIndex < conversationIndex, "authenticated UI should render before conversation initialization finishes");
  assert.match(source, /aiApiRequestWithTimeout\("\/conversations"[\s\S]*?12000\)/);
});
