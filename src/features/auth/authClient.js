const AUTH_ME_URL = "/api/auth/me";
const AUTH_CSRF_URL = "/api/auth/csrf";
const AUTH_LOGOUT_URL = "/api/auth/logout";

export async function fetchCurrentUser(signal) {
  const response = await fetch(AUTH_ME_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, signal });
  if (response.status === 401) return { authenticated: false, user: null };
  if (!response.ok) throw new Error("Could not check sign-in status.");
  const payload = await response.json();
  return { authenticated: Boolean(payload.authenticated), user: payload.user || null };
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
}
