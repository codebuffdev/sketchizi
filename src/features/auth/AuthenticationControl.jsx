import { useEffect, useState } from "react";
import { fetchAuthProviders, fetchCurrentUser, invalidateCurrentUserCache, signOut, startGitHubSignIn, startGoogleSignIn } from "./authClient.js";

export default function AuthenticationControl() {
  const [auth, setAuth] = useState({ status: "loading", user: null, error: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [providers, setProviders] = useState({ google: true, github: false });
  const [busy, setBusy] = useState(false);
  const [signInContext, setSignInContext] = useState({ message: "Sign in to use account-based features. Your canvas and collaboration remain available without signing in.", returnTo: "" });

  useEffect(() => {
    const openForHost = (event) => {
      setSignInContext({
        message: event.detail?.message || "Sign in to host a collaboration. Joining an existing collaboration remains available without signing in.",
        returnTo: event.detail?.returnTo || "/?startCollaboration=1",
      });
      setDialogOpen(true);
    };
    window.addEventListener("sketchizi:auth-required", openForHost);
    const currentUrl = new URL(window.location.href);
    const returnedAuthError = currentUrl.searchParams.get("authError");
    const returnedFromLoginFailure = returnedAuthError === "login_failed" || returnedAuthError === "github_not_configured";
    if (returnedFromLoginFailure) {
      // OAuth redirects may resume a page from the browser back/forward cache.
      // Do not let an anonymous status cached before the redirect mask a valid
      // server-managed session established during the sign-in round trip.
      invalidateCurrentUserCache();
      setLoginError(returnedAuthError === "github_not_configured" ? "GitHub sign-in is not configured yet. Please use Google or contact the Sketchizi administrator." : "Sign-in failed. Please try again.");
      currentUrl.searchParams.delete("authError");
      window.history.replaceState(window.history.state, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
    }
    const controller = new AbortController();
    fetchAuthProviders().then(setProviders).catch(() => { /* Keep Google sign-in available if provider discovery is unavailable. */ });
    fetchCurrentUser(controller.signal)
      .then(({ authenticated, user }) => {
        setAuth({ status: authenticated ? "authenticated" : "anonymous", user, error: "" });
        // An old OAuth failure flag can remain in component state after a later
        // successful sign-in. A confirmed authenticated session wins over it.
        if (authenticated) setLoginError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setAuth({ status: "unavailable", user: null, error: error.message || "Sign-in status is temporarily unavailable. You can keep using Sketchizi." });
      });
    return () => { controller.abort(); window.removeEventListener("sketchizi:auth-required", openForHost); };
  }, []);

  // Keep the invariant declarative as well as in the request callbacks: an
  // authenticated account must never display a stale OAuth failure banner.
  useEffect(() => {
    if (auth.status === "authenticated") setLoginError("");
  }, [auth.status]);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    const close = (event) => { if (event.key === "Escape") setDialogOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dialogOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".auth-account-control")) return;
      setProfileMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [profileMenuOpen]);

  const retryAuthStatus = async () => {
    invalidateCurrentUserCache();
    setAuth({ status: "loading", user: null, error: "" });
    try {
      const { authenticated, user } = await fetchCurrentUser();
      setAuth({ status: authenticated ? "authenticated" : "anonymous", user, error: "" });
      if (authenticated) setLoginError("");
    } catch (error) {
      setAuth({ status: "unavailable", user: null, error: error.message || "Sign-in status is temporarily unavailable. You can keep using Sketchizi." });
    }
  };

  const handleGoogleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setLoginError("");
    setAuth((current) => ({ ...current, error: "" }));
    try {
      await startGoogleSignIn(signInContext.returnTo || undefined);
    } catch (error) {
      setAuth((current) => ({
        ...current,
        error: error.message || "Sketchizi services are starting. Please try again.",
      }));
    } finally {
      setBusy(false);
    }
  };

  const handleGitHubSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setLoginError("");
    setAuth((current) => ({ ...current, error: "" }));
    try {
      await startGitHubSignIn(signInContext.returnTo || undefined);
    } catch (error) {
      setAuth((current) => ({ ...current, error: error.message || "Sketchizi services are starting. Please try again." }));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      setAuth({ status: "anonymous", user: null, error: "" });
    } catch (error) {
      setAuth((current) => ({ ...current, error: error.message || "Sign-out failed." }));
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-control-root">
      {auth.status === "loading" ? (
        <span className="auth-control-loading" role="status" aria-label="Checking sign-in status">Checking…</span>
      ) : auth.status === "authenticated" ? (
        <div className="auth-account-control">
          <button
            type="button"
            className="auth-account-trigger"
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            aria-label="Open account menu"
            title={auth.user?.email || auth.user?.name || "Account"}
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            {auth.user?.picture ? <img className="auth-account-avatar" src={auth.user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="auth-account-avatar auth-account-avatar-fallback" aria-hidden="true">{(auth.user?.name || auth.user?.email || "U").slice(0, 1).toUpperCase()}</span>}
            <span className="auth-account-name">{auth.user?.name || auth.user?.email || "Signed in"}</span>
            <svg className="auth-account-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          {profileMenuOpen && (
            <div className="auth-account-menu" role="menu" aria-label="Account menu">
              <div className="auth-account-menu-heading">
                <strong>{auth.user?.name || "Signed in"}</strong>
                {auth.user?.email && <span>{auth.user.email}</span>}
              </div>
              <button className="auth-account-menu-item" type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); handleSignOut(); }} disabled={busy}>
                <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H4.8A1.8 1.8 0 0 0 3 4.8v10.4A1.8 1.8 0 0 0 4.8 17H8" /><path d="M11 6l4 4-4 4M15 10H7" /></svg>
                <span>{busy ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <button className="auth-header-button" type="button" onClick={() => { setSignInContext({ message: "Sign in to use account-based features. Your canvas and collaboration remain available without signing in.", returnTo: "" }); setDialogOpen(true); }}>Sign in</button>
      )}

      {loginError && auth.status !== "authenticated" && <span className="auth-inline-error" role="status">{loginError}</span>}
      {auth.error && <span className="auth-inline-error" role="status" title={auth.error}>Auth unavailable</span>}
      {auth.status === "unavailable" && <button className="auth-header-button" type="button" onClick={retryAuthStatus} title="Retry checking your sign-in session">Retry</button>}
      {dialogOpen && (
        <div className="auth-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
            <button type="button" className="auth-dialog-close" aria-label="Close sign-in dialog" onClick={() => setDialogOpen(false)}>×</button>
            <div className="auth-dialog-mark" aria-hidden="true">S</div>
            <h2 id="auth-dialog-title">Sign in to Sketchizi</h2>
            <p>{signInContext.message}</p>
            {loginError && auth.status !== "authenticated" && <p className="auth-dialog-notice" role="status">{loginError}</p>}
            {auth.error && <p className="auth-dialog-notice" role="status">{auth.error}</p>}
            <button className="auth-google-button" type="button" onClick={handleGoogleSignIn} disabled={busy}>
              <svg aria-hidden="true" viewBox="0 0 48 48" width="19" height="19"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.01 13.22l7.98 6.19C12.88 13.72 18.01 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.64 5.93c4.46-4.12 7.13-10.19 7.13-17.58Z"/><path fill="#FBBC05" d="M10.99 28.59A14.4 14.4 0 0 1 10.22 24c0-1.59.27-3.13.76-4.59L3.01 13.22A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 3.01 10.78l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.87l-7.64-5.93c-2.12 1.42-4.83 2.27-8.26 2.27-5.99 0-11.12-4.22-13.01-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
              {busy ? "Starting Sketchizi services…" : "Continue with Google"}
            </button>
            {providers.github && (
              <button className="auth-google-button auth-github-button" type="button" onClick={handleGitHubSignIn} disabled={busy}>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.08c-3.1.67-3.76-1.31-3.76-1.31-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.7 1.15 1.7 1.15.99 1.69 2.6 1.2 3.23.92.1-.72.39-1.2.7-1.48-2.48-.28-5.09-1.24-5.09-5.53 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.11-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.61 5.24-5.1 5.52.4.35.75 1.03.75 2.08V22c0 .29.2.63.76.52A11.1 11.1 0 0 0 12 .9Z" /></svg>
                {busy ? "Redirecting to GitHub…" : "Continue with GitHub"}
              </button>
            )}
            <p className="auth-dialog-footnote">Sign in securely with Google or GitHub. Repository access is a separate permission.</p>
          </section>
        </div>
      )}
    </div>
  );
}
