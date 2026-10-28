import { ensureBackendReady } from "../backend/backendWarmup.js";

const AUTH_ME_URL = "/api/auth/me";
const AUTH_CSRF_URL = "/api/auth/csrf";
const AUTH_LOGOUT_URL = "/api/auth/logout";
const AUTH_PROVIDERS_URL = "/api/auth/providers";
// Bound the entire sign-in check, including backend warm-up. A stalled warm-up
// must never leave the application stuck on a blank loading screen.
const AUTH_CHECK_TIMEOUT_MS = 12_000;
const AUTHENTICATED_CACHE_MS = 60_000;
const ANONYMOUS_CACHE_MS = 5000;

let currentUserCache = null;
let currentUserPromise = null;
let authCacheEpoch = 0;

/**
 * Invalidates only the in-memory status hint. Protected endpoints still verify
 * the real server-managed session on every request.
 */
export function invalidateCurrentUserCache() {
  authCacheEpoch += 1;
  currentUserCache = null;
  // Detach an older in-flight lookup so a post-login/logout lookup can start.
  // Existing callers of that old promise may still finish independently.
  currentUserPromise = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("sketchizi:auth-changed", invalidateCurrentUserCache);
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function waitForCaller(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  // A caller can stop waiting without aborting the one network request shared
  // by the header, AI Ask, and collaboration controls.
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

async function requestCurrentUser() {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const error = new Error("Checking sign-in status timed out. Please retry or open the editor.");
      error.code = "auth_status_timeout";
      reject(error);
    }, AUTH_CHECK_TIMEOUT_MS);
  });
  const check = (async () => {
    // Authentication is served by its own backend route. Do not gate this
    // request on the unrelated AI Ask warm-up endpoint; a sleeping or broken
    // AI service must not prevent a signed-in user from reaching Workspace.
    const response = await fetch(AUTH_ME_URL, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 401) return { authenticated: false, user: null };
    if (!response.ok) {
      const error = new Error("Could not check sign-in status.");
      error.status = response.status;
      error.code = "auth_status_unavailable";
      throw error;
    }
    const payload = await response.json();
    return { authenticated: Boolean(payload.authenticated), user: payload.user || null };
  })();
  try {
    // The timeout covers warm-up as well as the session endpoint itself.
    return await Promise.race([check, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Checks the current user with one shared in-flight request and a short-lived
 * in-memory hint cache. AbortSignal cancellation applies only to the caller's
 * wait; it never cancels the shared network request for other components.
 */
export function fetchCurrentUser(signal) {
  if (signal?.aborted) return Promise.reject(abortError());

  const now = Date.now();
  if (currentUserCache && currentUserCache.expiresAt > now) {
    return waitForCaller(Promise.resolve(currentUserCache.value), signal);
  }
  if (currentUserCache) currentUserCache = null;

  if (!currentUserPromise) {
    const epochAtStart = authCacheEpoch;
    let sharedPromise;
    sharedPromise = requestCurrentUser()
      .then((value) => {
        if (authCacheEpoch === epochAtStart) {
          const ttl = value.authenticated ? AUTHENTICATED_CACHE_MS : ANONYMOUS_CACHE_MS;
          currentUserCache = { value, expiresAt: Date.now() + ttl };
        }
        return value;
      })
      .finally(() => {
        if (currentUserPromise === sharedPromise) currentUserPromise = null;
      });
    currentUserPromise = sharedPromise;
  }

  return waitForCaller(currentUserPromise, signal);
}

function safeReturnTo(returnTo) {
  return typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/";
}

export async function fetchAuthProviders() {
  await ensureBackendReady();
  const response = await fetch(AUTH_PROVIDERS_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Could not load sign-in options.");
  const payload = await response.json();
  return { google: payload.google === true, github: payload.github === true };
}

export async function startGoogleSignIn(returnTo = window.location.pathname + window.location.search + window.location.hash) {
  await ensureBackendReady();
  window.location.assign(`/api/auth/login/google?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
}

export async function startGitHubSignIn(returnTo = window.location.pathname + window.location.search + window.location.hash) {
  await ensureBackendReady();
  window.location.assign(`/api/auth/login/github?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
}


export async function fetchGitHubRepositoryConnection() {
  await ensureBackendReady();
  const response = await fetch("/api/github/connection", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (response.status === 401) throw new Error("Sign in to Sketchizi first.");
  if (!response.ok) throw new Error("Could not check GitHub repository connection.");
  return response.json();
}

export async function startGitHubRepositoryConnection(returnTo = window.location.pathname + window.location.search + window.location.hash) {
  await ensureBackendReady();
  window.location.assign(`/api/github/connect?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
}

export async function disconnectGitHubRepositoryConnection() {
  await ensureBackendReady();
  const csrfResponse = await fetch(AUTH_CSRF_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (!csrfResponse.ok) throw new Error("Could not prepare a secure GitHub disconnect request.");
  const { token, headerName } = await csrfResponse.json();
  const response = await fetch("/api/github/disconnect", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { accept: "application/json", [headerName || "X-XSRF-TOKEN"]: token },
  });
  if (response.status === 401) throw new Error("Your sign-in session has expired. Please sign in again.");
  if (!response.ok && response.status !== 204) throw new Error("Could not disconnect GitHub. Please try again.");
  return true;
}

export async function signOut() {
  await ensureBackendReady();
  const csrfResponse = await fetch(AUTH_CSRF_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (!csrfResponse.ok) throw new Error("Could not prepare a secure sign-out request.");
  const { token, headerName } = await csrfResponse.json();
  const response = await fetch(AUTH_LOGOUT_URL, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { accept: "application/json", [headerName || "X-XSRF-TOKEN"]: token },
  });
  if (!response.ok && response.status !== 204) throw new Error("Sign-out failed. Please try again.");
  window.dispatchEvent(new CustomEvent("sketchizi:auth-changed", { detail: { authenticated: false, signedOut: true } }));
}

export async function fetchHostAuthorization(roomId) {
  await ensureBackendReady();
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
