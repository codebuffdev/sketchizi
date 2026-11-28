// Shared CSRF token handling. Order of preference:
//   1. in-memory cache (populated by an earlier /api/auth/csrf call)
//   2. the readable XSRF-TOKEN cookie (same-origin deployments)
//   3. GET /api/auth/csrf (works cross-origin, where the cookie is not readable)
// invalidateCsrfToken() drops the cache; getCsrfHeaders({ force: true }) skips
// the cache and cookie and always asks the server for a fresh token.

export const CSRF_URL = "/api/auth/csrf";
export const CSRF_FAILURE_MESSAGE = "Could not obtain a security token. Refresh the page and retry.";
const DEFAULT_HEADER = "X-XSRF-TOKEN";
const COOKIE_NAME = "XSRF-TOKEN";
const FETCH_TIMEOUT_MS = 12000;
const TRANSIENT_RETRY_DELAY_MS = 600;

let cached = null;
let inflight = null;

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

export function invalidateCsrfToken() {
  cached = null;
  inflight = null;
}

function failure(cause) {
  const error = new Error(CSRF_FAILURE_MESSAGE);
  error.code = "csrf_unavailable";
  if (cause) error.cause = cause;
  return error;
}

async function fetchTokenOnce(signal) {
  const response = await fetch(CSRF_URL, {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: signal || AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

async function fetchToken(signal) {
  try {
    return await fetchTokenOnce(signal);
  } catch (first) {
    if (signal?.aborted) throw failure(first);
    // One quick retry covers a cold or restarting backend (network error / 5xx).
    const transient = !first.status || first.status >= 500 || first.status === 429;
    if (!transient) throw failure(first);
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    try { return await fetchTokenOnce(signal); } catch (second) { throw failure(second); }
  }
}

/** Resolves to { [headerName]: token }. */
export async function getCsrfHeaders({ force = false, signal } = {}) {
  if (force) invalidateCsrfToken();
  if (!force) {
    if (cached) return { [cached.headerName]: cached.token };
    const fromCookie = readCookieToken();
    if (fromCookie) return { [DEFAULT_HEADER]: fromCookie };
  }
  if (!inflight) {
    inflight = fetchToken(signal)
      .then((value) => { cached = value; return value; })
      .finally(() => { inflight = null; });
  }
  const value = await inflight;
  return { [value.headerName]: value.token };
}

/** True when a response looks like a rejected / stale CSRF token. */
export function isCsrfRejection(status, payload) {
  return status === 403 || payload?.code === "csrf_rejected";
}

if (typeof window !== "undefined") {
  // Sign-in/out changes the session, so never reuse a token across it.
  window.addEventListener("sketchizi:auth-changed", invalidateCsrfToken);
}
