import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/ai/[[path]].js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

const env = {
  AUTH_SERVICE_ORIGIN: "https://auth.example.test",
  AI_SERVICE_ORIGIN: "https://ai.example.test",
  AI_IDENTITY_HMAC_SECRET: "test-only-shared-secret-with-at-least-32-bytes",
  PUBLIC_FRONTEND_ORIGIN: "https://sketchizi.pages.dev",
};

function postRequest(path = "/api/ai/conversations", options = {}) {
  return new Request(`https://sketchizi.pages.dev${path}`, {
    method: "POST",
    headers: {
      origin: "https://sketchizi.pages.dev",
      cookie: "SESSION=session-value; XSRF-TOKEN=csrf-value",
      "x-xsrf-token": "csrf-value",
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ?? "{}",
  });
}

test("AI gateway verifies the existing session and sends a short-lived signed assertion without browser credentials", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://auth.example.test/api/auth/me") {
      assert.equal(options.headers.cookie, "SESSION=session-value");
      return Response.json({ authenticated: true, user: { id: "google-oidc-subject-123" } });
    }
    assert.equal(String(url), "https://ai.example.test/api/v1/ai/conversations");
    assert.equal(options.headers.has("cookie"), false);
    assert.equal(options.headers.has("authorization"), false);
    assert.equal(options.headers.has("x-user-id"), false);
    const assertion = options.headers.get("x-sketchizi-identity");
    assert.ok(assertion);
    const [headerPart, payloadPart, signaturePart] = assertion.split(".");
    assert.ok(headerPart && signaturePart);
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    assert.equal(payload.sub, "google-oidc-subject-123");
    assert.equal(payload.aud, "sketchizi-ai");
    assert.ok(payload.exp > payload.iat && payload.exp - payload.iat <= 60);
    assert.match(payload.jti, /^[0-9a-f-]{36}$/i);
    const key = await globalThis.crypto.subtle.importKey(
      "raw", new TextEncoder().encode(env.AI_IDENTITY_HMAC_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const expectedSignature = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerPart}.${payloadPart}`)));
    assert.deepEqual(Buffer.from(signaturePart, "base64url"), Buffer.from(expectedSignature));
    assert.match(options.headers.get("x-request-id"), /^[0-9a-f-]{36}$/i);
    return Response.json({ conversationId: "8fe6beba-2a61-49f2-95c1-6b6a92f755c0" });
  };
  const response = await onRequest({ request: postRequest(), env });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(calls.length, 2);
});

test("AI gateway rejects unauthenticated users before forwarding to the AI service", async () => {
  let aiCalled = false;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://auth.example.test/api/auth/me") return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
    aiCalled = true;
    return Response.json({});
  };
  const response = await onRequest({ request: postRequest(), env });
  assert.equal(response.status, 401);
  assert.equal(aiCalled, false);
  assert.equal((await response.json()).code, "authentication_required");
});

test("AI gateway rejects cross-origin and missing-CSRF mutations before any upstream call", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({}); };
  const wrongOrigin = new Request("https://sketchizi.pages.dev/api/ai/conversations", {
    method: "POST", headers: { origin: "https://evil.example", cookie: "SESSION=s; XSRF-TOKEN=c", "x-xsrf-token": "c", "content-type": "application/json" }, body: "{}",
  });
  assert.equal((await onRequest({ request: wrongOrigin, env })).status, 403);
  assert.equal((await onRequest({ request: postRequest("/api/ai/conversations", { headers: { "x-xsrf-token": "wrong" } }), env })).status, 403);
  assert.equal(calls, 0);
});

test("AI gateway avoids caching API results and rejects missing configuration", async () => {
  const missing = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/ai/usage?conversationId=x"), env: {} });
  assert.equal(missing.status, 503);
  assert.match(missing.headers.get("cache-control"), /no-store/);

  globalThis.fetch = async () => Response.json({ remaining: 2 }, { headers: { "cache-control": "public, max-age=3600" } });
  const health = await onRequest({ request: new Request("https://sketchizi.pages.dev/api/ai/health"), env });
  assert.equal(health.status, 200);
  assert.match(health.headers.get("cache-control"), /no-store/);
});


test("gateway forwards a correlation ID and preserves a backend identity-store error status/code", async () => {
  let gatewayRequestId = "";
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "https://auth.example.test/api/auth/me") {
      assert.match(options.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
      return Response.json({ authenticated: true, user: { id: "google-oidc-subject-123" } });
    }
    gatewayRequestId = options.headers.get("x-request-id");
    return Response.json(
      { error: "AI identity verification is temporarily unavailable.", code: "identity_store_unavailable" },
      { status: 503, headers: { "x-request-id": gatewayRequestId } },
    );
  };
  const response = await onRequest({ request: postRequest("/api/ai/chat"), env });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.code, "identity_store_unavailable");
  assert.equal(response.headers.get("x-request-id"), gatewayRequestId);
  assert.match(gatewayRequestId, /^[0-9a-f-]{36}$/i);
});
