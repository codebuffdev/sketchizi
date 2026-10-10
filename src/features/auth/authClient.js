const AUTH_ME_URL = "/api/auth/me";
const AUTH_CSRF_URL = "/api/auth/csrf";
const AUTH_LOGOUT_URL = "/api/auth/logout";

// This is a presentation optimization only. Protected endpoints must always
// authorize requests on the server and never rely on this in-memory result.
export const AUTH_STATUS_TIMEOUT_MS = 8000;
export const AUTH_STATUS_CACHE_TTL_MS = 15000;
const AUTH_STATUS_RECHECK_THROTTLE_MS = 30000;
let cachedStatus = null;
let statusRequest = null;
let lastStatusRequestAt = 0;

function withCallerCancellation(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

/** Fetch current identity, deduplicating concurrent callers and briefly caching successful results. */
export function fetchCurrentUser(signal, { force = false } = {}) {
  if (force) cachedStatus = null;
  const now = Date.now();
  if (!force && cachedStatus && now - cachedStatus.checkedAt < AUTH_STATUS_CACHE_TTL_MS) {
    return withCallerCancellation(Promise.resolve(cachedStatus.value), signal);
  }
  if (!statusRequest) {
    const controller = new AbortController();
    const startedAt = Date.now();
    lastStatusRequestAt = startedAt;
    const timeout = setTimeout(() => controller.abort(new DOMException("Authentication status check timed out.", "TimeoutError")), AUTH_STATUS_TIMEOUT_MS);
    const promise = fetch(AUTH_ME_URL, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      let value;
      if (response.status === 401) {
        value = { authenticated: false, user: null };
      } else {
        if (!response.ok) {
          const error = new Error(`Could not check sign-in status (HTTP ${response.status}).`);
          error.status = response.status;
          throw error;
        }
        const payload = await response.json();
        value = { authenticated: Boolean(payload.authenticated), user: payload.user || null };
      }
      cachedStatus = { value, checkedAt: Date.now() };
      return value;
    }).catch((error) => {
      if (controller.signal.aborted) {
        const timeoutError = new Error("Authentication status check timed out.");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      throw error;
    }).finally(() => {
      clearTimeout(timeout);
      if (statusRequest?.promise === promise) statusRequest = null;
    });
    statusRequest = { promise, startedAt };
  }
  return withCallerCancellation(statusRequest.promise, signal);
}

export function recheckCurrentUserIfStale() {
  if (statusRequest) return statusRequest.promise;
  if (Date.now() - lastStatusRequestAt < AUTH_STATUS_RECHECK_THROTTLE_MS) {
    return cachedStatus ? Promise.resolve(cachedStatus.value) : fetchCurrentUser();
  }
  return fetchCurrentUser(undefined, { force: true });
}

export function invalidateCurrentUserCache() {
  cachedStatus = null;
}

export function startGoogleSignIn(returnTo = window.location.pathname + window.location.search + window.location.hash) {
  const safeReturnTo = typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/";
  window.location.assign(`/api/auth/login/google?returnTo=${encodeURIComponent(safeReturnTo)}`);
}

export async function signOut() {
  const csrfResponse = await fetch(AUTH_CSRF_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (!csrfResponse.ok) throw new Error("Could not prepare a secure sign-out request.");
  const { token, headerName } = await csrfResponse.json();
  const response = await fetch(AUTH_LOGOUT_URL, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { accept: "application/json", [headerName || "X-XSRF-TOKEN"]: token },
  });
  if (!response.ok && response.status !== 204) throw new Error("Sign-out failed. Please try again.");
  invalidateCurrentUserCache();
  window.dispatchEvent(new CustomEvent("sketchizi:auth-changed", { detail: { authenticated: false, signedOut: true } }));
}

export async function fetchHostAuthorization(roomId) {
  if (typeof roomId !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(roomId)) {
    throw new Error("Could not prepare secure collaboration hosting.");
  }
  const csrfResponse = await fetch(AUTH_CSRF_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (!csrfResponse.ok) throw new Error("Could not verify your session. Please try again.");
  const { token, headerName } = await csrfResponse.json();
  const response = await fetch("/api/auth/collaboration-host-token", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json", [headerName || "X-XSRF-TOKEN"]: token },
    body: JSON.stringify({ roomId }),
  });
  if (response.status === 401) throw new Error("Your sign-in session has expired. Please sign in again.");
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not authorize collaboration hosting.");
  }
  const payload = await response.json();
  if (typeof payload.token !== "string" || typeof payload.name !== "string" || !payload.name.trim()) {
    throw new Error("Your account does not have a usable display name. Update your Google profile and try again.");
  }
  return { token: payload.token, name: payload.name.trim() };
}
