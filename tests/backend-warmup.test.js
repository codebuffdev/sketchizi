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

test("periodic backend warm-up sends a same-origin request and cleanup stops future ticks", async () => {
  const { startPeriodicBackendWarmup } = await import("../src/features/backend/backendWarmup.js");
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let tick;
  let cleared = false;
  let calls = 0;
  globalThis.setInterval = (callback, intervalMs) => {
    assert.equal(intervalMs, 14 * 60 * 1000);
    tick = callback;
    return 123;
  };
  globalThis.clearInterval = (id) => {
    assert.equal(id, 123);
    cleared = true;
  };
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(String(url), "/api/ai/warmup");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return response(200);
  };

  try {
    const stop = startPeriodicBackendWarmup();
    for (let attempt = 0; attempt < 10 && calls === 0; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(calls, 1);
    await new Promise((resolve) => setImmediate(resolve));
    tick();
    for (let attempt = 0; attempt < 10 && calls < 2; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(calls, 2);
    stop();
    assert.equal(cleared, true);
    tick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
