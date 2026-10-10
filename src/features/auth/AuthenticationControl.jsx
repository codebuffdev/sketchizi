import { useEffect, useState } from "react";
import { fetchCurrentUser, recheckCurrentUserIfStale, signOut, startGoogleSignIn } from "./authClient.js";

export default function AuthenticationControl() {
  const [auth, setAuth] = useState({ status: "loading", user: null, error: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signInContext, setSignInContext] = useState({ message: "Sign in to use account-based features. Your canvas and collaboration remain available without signing in.", returnTo: "" });

  useEffect(() => {
    let mounted = true;
    let lastVisibleCheck = Date.now();
    const applyStatus = ({ authenticated, user }) => {
      if (mounted) setAuth({ status: authenticated ? "authenticated" : "anonymous", user, error: "" });
    };
    const openForHost = (event) => {
      setSignInContext({
        message: event.detail?.message || "Sign in to host a collaboration. Joining an existing collaboration remains available without signing in.",
        returnTo: event.detail?.returnTo || "/?startCollaboration=1",
      });
      setDialogOpen(true);
    };
    window.addEventListener("sketchizi:auth-required", openForHost);
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("authError") === "login_failed") {
      setLoginError(true);
      currentUrl.searchParams.delete("authError");
      window.history.replaceState(window.history.state, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
    }
    const controller = new AbortController();
    fetchCurrentUser(controller.signal)
      .then(applyStatus)
      .catch((error) => {
        if (!mounted || error.name === "AbortError") return;
        setAuth({ status: "unavailable", user: null, error: "Sign-in status is temporarily unavailable. You can keep using Sketchizi; retry to check your session." });
      });
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibleCheck < 30000) return;
      lastVisibleCheck = now;
      recheckCurrentUserIfStale()
        .then(applyStatus)
        .catch(() => {
          if (!mounted) return;
          setAuth((current) => ({ status: "unavailable", user: current.user || null, error: "Sign-in status is temporarily unavailable. You can keep using Sketchizi; retry to check your session." }));
        });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onAuthChanged = (event) => {
      if (event.detail?.signedOut || event.detail?.authenticated === false) {
        setAuth({ status: "anonymous", user: null, error: "" });
      }
    };
    window.addEventListener("sketchizi:auth-changed", onAuthChanged);
    return () => {
      mounted = false;
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("sketchizi:auth-required", openForHost);
      window.removeEventListener("sketchizi:auth-changed", onAuthChanged);
    };
  }, []);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    const close = (event) => { if (event.key === "Escape") setDialogOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dialogOpen]);

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
      ) : auth.status === "unavailable" ? (
        <button className="auth-header-button" type="button" onClick={() => {
          setAuth((current) => ({ ...current, status: "loading" }));
          fetchCurrentUser(undefined, { force: true })
            .then(({ authenticated, user }) => setAuth({ status: authenticated ? "authenticated" : "anonymous", user, error: "" }))
            .catch(() => setAuth((current) => ({ ...current, status: "unavailable", error: "Sign-in status is temporarily unavailable. You can keep using Sketchizi; retry to check your session." })));
        }}>Retry status check</button>
      ) : auth.status === "authenticated" ? (
        <div className="auth-account-control">
          {auth.user?.picture ? <img className="auth-account-avatar" src={auth.user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="auth-account-avatar auth-account-avatar-fallback" aria-hidden="true">{(auth.user?.name || auth.user?.email || "U").slice(0, 1).toUpperCase()}</span>}
          <span className="auth-account-name" title={auth.user?.email || auth.user?.name}>{auth.user?.name || auth.user?.email || "Signed in"}</span>
          <button className="auth-header-button" type="button" onClick={handleSignOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
        </div>
      ) : (
        <button className="auth-header-button" type="button" onClick={() => { setSignInContext({ message: "Sign in to use account-based features. Your canvas and collaboration remain available without signing in.", returnTo: "" }); setDialogOpen(true); }}>Sign in</button>
      )}

      {loginError && <span className="auth-inline-error" role="status">Google sign-in failed. Try again.</span>}
      {auth.error && <span className="auth-inline-error" role="status" title={auth.error}>Auth unavailable</span>}
      {dialogOpen && (
        <div className="auth-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
            <button type="button" className="auth-dialog-close" aria-label="Close sign-in dialog" onClick={() => setDialogOpen(false)}>×</button>
            <div className="auth-dialog-mark" aria-hidden="true">S</div>
            <h2 id="auth-dialog-title">Sign in to Sketchizi</h2>
            <p>{signInContext.message}</p>
            {loginError && <p className="auth-dialog-notice" role="status">Google sign-in did not complete. Please try again.</p>}
            {auth.status === "unavailable" && <p className="auth-dialog-notice" role="status">{auth.error}</p>}
            <button className="auth-google-button" type="button" onClick={() => startGoogleSignIn(signInContext.returnTo || undefined)}>
              <svg aria-hidden="true" viewBox="0 0 48 48" width="19" height="19"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.01 13.22l7.98 6.19C12.88 13.72 18.01 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.64 5.93c4.46-4.12 7.13-10.19 7.13-17.58Z"/><path fill="#FBBC05" d="M10.99 28.59A14.4 14.4 0 0 1 10.22 24c0-1.59.27-3.13.76-4.59L3.01 13.22A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 3.01 10.78l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.87l-7.64-5.93c-2.12 1.42-4.83 2.27-8.26 2.27-5.99 0-11.12-4.22-13.01-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
              Continue with Google
            </button>
            <p className="auth-dialog-footnote">No password is needed. Sketchizi uses Google sign-in.</p>
          </section>
        </div>
      )}
    </div>
  );
}
