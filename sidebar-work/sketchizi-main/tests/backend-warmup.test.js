import test from "node:test";
import assert from "node:assert/strict";
import { ensureBackendReady, wakeBackendOnPageLoad } from "../src/features/backend/backendWarmup.js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function response(status = 200) {
  return new Response(JSON.stringify({ status: status === 200 ? "UP" : "STARTING" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("backend warm-up retries transient startup failures and succeeds when ready", async () => {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "/api/ai/warmup");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    calls += 1;
    return calls === 1 ? response(503) : response(200);
  };

  const result = await ensureBackendReady({ force: true, timeoutMs: 5000 });
  assert.equal(result.ready, true);
  assert.equal(calls, 2);
});

test("concurrent login and AI readiness checks share a single probe loop", async () => {
  let calls = 0;
  let release;
  globalThis.fetch = async () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };

  const first = ensureBackendReady({ force: true, timeoutMs: 5000 });
  const second = ensureBackendReady({ force: true, timeoutMs: 5000 });
  for (let attempt = 0; attempt < 10 && !release; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(calls, 1);
  release(response(200));
  assert.equal((await first).ready, true);
  assert.equal((await second).ready, true);
  assert.equal(calls, 1);
});

test("page-load warm-up is best effort and does not throw synchronously", () => {
  globalThis.fetch = async () => response(200);
  assert.doesNotThrow(() => wakeBackendOnPageLoad());
});
