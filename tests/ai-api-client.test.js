import test from "node:test";
import assert from "node:assert/strict";
import { aiApiRequest, aiApiRequestWithTimeout, createRequestId } from "../src/features/ai/aiApiClient.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("chat transport retry reuses the same logical request ID and only retries transport errors", async () => {
  const originalFetch = globalThis.fetch;
  const chatBodies = [];
  let chatAttempts = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "/api/auth/csrf") return jsonResponse({ token: "csrf-token", headerName: "X-XSRF-TOKEN" });
    assert.equal(String(url), "/api/ai/chat");
    chatBodies.push(JSON.parse(options.body));
    chatAttempts += 1;
    if (chatAttempts === 1) throw new TypeError("simulated interrupted transport");
    return jsonResponse({ status: "succeeded", requestId: chatBodies.at(-1).requestId, answer: "ok" });
  };
  try {
    const payload = { conversationId: "conv", requestId: "logical-request-id", question: "Explain flow" };
    const result = await aiApiRequest("/chat", { method: "POST", body: payload });
    assert.equal(result.answer, "ok");
    assert.equal(chatAttempts, 2);
    assert.equal(chatBodies[0].requestId, "logical-request-id");
    assert.deepEqual(chatBodies[1], chatBodies[0]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat HTTP errors are not automatically regenerated", async () => {
  const originalFetch = globalThis.fetch;
  let chatAttempts = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/auth/csrf") return jsonResponse({ token: "csrf-token", headerName: "X-XSRF-TOKEN" });
    chatAttempts += 1;
    return jsonResponse({ error: "quota exhausted", code: "account_quota_exceeded" }, 429);
  };
  try {
    await assert.rejects(
      aiApiRequest("/chat", { method: "POST", body: { requestId: "r1" } }),
      (error) => error.status === 429 && error.code === "account_quota_exceeded",
    );
    assert.equal(chatAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("request IDs are RFC 4122 UUIDs", () => {
  assert.match(createRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});


test("usage requests have a finite timeout and report a recoverable timeout code", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  try {
    await assert.rejects(aiApiRequestWithTimeout("/usage?conversationId=conv", {}, 10), (error) => error.code === "request_timeout");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
