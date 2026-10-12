const HEALTH_URL = "/api/ai/warmup";
const TOTAL_STARTUP_TIMEOUT_MS = 120_000;
const ATTEMPT_TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 1_200;
const READY_CACHE_MS = 15_000;

let readinessPromise = null;
let readyUntil = 0;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createWarmupError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}

async function requestHealth(deadline) {
  const remaining = Math.max(1, deadline - Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(ATTEMPT_TIMEOUT_MS, remaining));
  try {
    const response = await fetch(HEALTH_URL, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (response.ok) return true;

    // Configuration, route, and authorization errors will not be fixed by waiting
    // for Render to start. Fail fast instead of leaving the user waiting 2 minutes.
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw createWarmupError(
        "Sketchizi could not reach the backend readiness endpoint. Please refresh and try again.",
        "backend_warmup_rejected",
        response.status,
      );
    }
    return false;
  } catch (error) {
    if (error?.code === "backend_warmup_rejected") throw error;
    // Network failures and per-attempt timeouts are expected while a free Render
    // service is waking. The outer loop retries them until its overall deadline.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitUntilReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await requestHealth(deadline)) {
      readyUntil = Date.now() + READY_CACHE_MS;
      return { ready: true };
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await delay(Math.min(RETRY_DELAY_MS, remaining));
  }
  throw createWarmupError(
    "Sketchizi services are taking longer than expected to start. Please try again.",
    "backend_startup_timeout",
  );
}

/**
 * Wakes the shared Render backend and waits until its public health endpoint is
 * ready. Concurrent callers share one readiness loop. A short cache prevents
 * the login and AI flows from issuing duplicate probes immediately after wakeup.
 */
export function ensureBackendReady({ timeoutMs = TOTAL_STARTUP_TIMEOUT_MS, force = false } = {}) {
  if (!force && readyUntil > Date.now()) return Promise.resolve({ ready: true, cached: true });
  if (readinessPromise) return readinessPromise;

  let sharedPromise;
  sharedPromise = waitUntilReady(timeoutMs).finally(() => {
    if (readinessPromise === sharedPromise) readinessPromise = null;
  });
  readinessPromise = sharedPromise;
  return sharedPromise;
}

/** Best-effort page-load wake-up; a later user action can retry if this fails. */
export function wakeBackendOnPageLoad() {
  void ensureBackendReady().catch(() => {
    // Do not block drawing or show a startup error just because the warm-up failed.
    // Login and AI actions call ensureBackendReady again and surface actionable errors.
  });
}
