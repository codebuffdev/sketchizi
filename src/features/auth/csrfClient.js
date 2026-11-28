// Shared CSRF token handling. Order of preference:
//   1. in-memory cache (populated by an earlier /api/auth/csrf call)
//   2. the readable XSRF-TOKEN cookie (same-origin deployments)
//   3. GET /api/auth/csrf (works cross-origin, where the cookie is not readable)
// clearCsrfTokenCache() drops the cache; forceRefreshCsrfToken() (or
// getCsrfHeaders({ force: true })) skips the cache and cookie and always asks the
// server for a fresh token. fetchWithCsrfRetry() wraps a mutating request so a
// stale/missing token (403) is refreshed and the request replayed once, silently.

export const CSRF_URL = "/api/auth/csrf";
export const CSRF_FAILURE_MESSAGE = "Could not obtain a security token. Refresh the page and retry.";
const DEFAULT_HEADER = "X-XSRF-TOKEN";
const COOKIE_NAME = "XSRF-TOKEN";
const FETCH_TIMEOUT_MS = 12000;
const TRANSIENT_RETRY_DELAY_MS = 600;

let cached = null;
// One shared token request: simultaneous auto-saves never race or overwrite each other's token.
let inFlightCsrfPromise = null;

function readCookieToken() {
  try {
    if (typeof document === "undefined") return "";
    for (const part of String(document.cookie || "").split(";")) {
      const index = part.indexOf("=");
      if (index > 0 && part.slice(0, index).trim() === COOKIE_NAME) return decodeURIComponent(part.slice(index + 1).trim());
    }
  } catch { /* cookie access can be blocked */ }
  return "";
}

export function clearCsrfTokenCache() {
  cached = null;
  inFlightCsrfPromise = null;
}

/** Backwards-compatible alias of clearCsrfTokenCache(). */
export const invalidateCsrfToken = clearCsrfTokenCache;

function failure(cause) {
  const error = new Error(CSRF_FAILURE_MESSAGE);
  error.code = "csrf_unavailable";
  if (cause) error.cause = cause;
  return error;
}

function tokenRequestSignal(callerSignal) {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  if (!callerSignal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([timeout, callerSignal]) : callerSignal;
}

async function fetchTokenOnce(callerSignal) {
  const response = await fetch(CSRF_URL, {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: tokenRequestSignal(callerSignal),
  });
  if (!response.ok) {
    const error = new Error(`CSRF endpoint responded ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  if (!payload?.token) throw new Error("CSRF response had no token");
  return { token: payload.token, headerName: payload.headerName || DEFAULT_HEADER };
}

async function fetchToken(callerSignal) {
  try {
    return await fetchTokenOnce(callerSignal);
  } catch (first) {
    if (callerSignal?.aborted) throw failure(first);
    // One quick retry covers a cold or restarting backend (network error / timeout / 5xx / 429).
    const transient = !first.status || first.status >= 500 || first.status === 429;
    if (!transient) throw failure(first);
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    try { return await fetchTokenOnce(callerSignal); } catch (second) { throw failure(second); }
  }
}

function requestSharedToken(callerSignal) {
  if (!inFlightCsrfPromise) {
    const promise = fetchToken(callerSignal)
      .then((value) => { if (inFlightCsrfPromise === promise) cached = value; return value; })
      .finally(() => { if (inFlightCsrfPromise === promise) inFlightCsrfPromise = null; });
    inFlightCsrfPromise = promise;
  }
  return inFlightCsrfPromise;
}

/** Resolves to { [headerName]: token }. */
export async function getCsrfHeaders({ force = false, signal } = {}) {
  if (force) clearCsrfTokenCache();
  if (!force) {
    const fromCookie = readCookieToken();
    if (cached) {
      // Same-origin gateways double-submit the XSRF-TOKEN cookie, so when a readable cookie
      // has rotated away from the cache the cookie is the truth.
      if (fromCookie && fromCookie !== cached.token) cached = { token: fromCookie, headerName: cached.headerName };
      return { [cached.headerName]: cached.token };
    }
    if (fromCookie) return { [DEFAULT_HEADER]: fromCookie };
  }
  let value;
  try {
    value = await requestSharedToken(signal);
  } catch (error) {
    // The shared request may have been started by another caller that then aborted it; this
    // caller is still live, so it starts its own request once.
    const abortedByOther = !signal?.aborted && error?.cause?.name === "AbortError";
    if (!abortedByOther) throw error;
    value = await requestSharedToken(signal);
  }
  if (signal?.aborted) throw failure(signal.reason);
  return { [value.headerName]: value.token };
}

/** Explicitly discards the cached token and fetches a brand-new one from GET /api/auth/csrf. */
export function forceRefreshCsrfToken(options = {}) {
  return getCsrfHeaders({ ...options, force: true });
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * fetch() for a mutating request: attaches the CSRF header, and when the server answers 403
 * (stale, missing or rotated token) clears the cache, fetches a fresh token and replays the
 * exact same request once. The body must be replayable (string, FormData, Blob).
 */
export async function fetchWithCsrfRetry(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return fetch(input, init);
  const send = async (force) => {
    const headers = new Headers(init.headers || {});
    Object.entries(await getCsrfHeaders({ force, signal: init.signal })).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  };
  const response = await send(false);
  if (response.status !== 403) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!isCsrfRejection(response.status, payload)) return response;
  return send(true);
}

/** True when a response looks like a rejected / stale CSRF token. */
export function isCsrfRejection(status, payload) {
  return status === 403 || payload?.code === "csrf_rejected";
}

if (typeof window !== "undefined") {
  // Sign-in/out changes the session, so never reuse a token across it.
  window.addEventListener("sketchizi:auth-changed", invalidateCsrfToken);
}
