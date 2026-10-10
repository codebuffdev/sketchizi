import { useEffect, useState } from "react";
import { fetchCurrentUser, signOut, startGoogleSignIn, startGitHubSignIn } from "./authClient.js";

export default function AuthenticationControl() {
  const [auth, setAuth] = useState({ status: "loading", user: null, error: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loginError, setLoginError] = useState(false);
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
    if (currentUrl.searchParams.get("authError") === "login_failed") {
      setLoginError(true);
      currentUrl.searchParams.delete("authError");
      window.history.replaceState(window.history.state, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
    }
    const controller = new AbortController();
    fetchCurrentUser(controller.signal)
      .then(({ authenticated, user }) => setAuth({ status: authenticated ? "authenticated" : "anonymous", user, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") setAuth({ status: "unavailable", user: null, error: "Sign-in status is temporarily unavailable. You can keep using Sketchizi." });
      });
    return () => { controller.abort(); window.removeEventListener("sketchizi:auth-required", openForHost); };
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
      ) : auth.status === "authenticated" ? (
        <div className="auth-account-control">
          {auth.user?.picture ? <img className="auth-account-avatar" src={auth.user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="auth-account-avatar auth-account-avatar-fallback" aria-hidden="true">{(auth.user?.name || auth.user?.email || "U").slice(0, 1).toUpperCase()}</span>}
          <span className="auth-account-name" title={auth.user?.email || auth.user?.name}>{auth.user?.name || auth.user?.email || "Signed in"}</span>
          <button className="auth-header-button" type="button" onClick={handleSignOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
        </div>
      ) : (
        <button className="auth-header-button" type="button" onClick={() => { setSignInContext({ message: "Sign in to use account-based features. Your canvas and collaboration remain available without signing in.", returnTo: "" }); setDialogOpen(true); }}>Sign in</button>
      )}

      {loginError && <span className="auth-inline-error" role="status">Sign-in failed. Try again.</span>}
      {auth.error && <span className="auth-inline-error" role="status" title={auth.error}>Auth unavailable</span>}
      {dialogOpen && (
        <div className="auth-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
            <button type="button" className="auth-dialog-close" aria-label="Close sign-in dialog" onClick={() => setDialogOpen(false)}>×</button>
            <h2 id="auth-dialog-title">Sign in to Sketchizi</h2>
            <p>Choose how you'd like to sign in.</p>
            {loginError && <p className="auth-dialog-notice" role="status">Sign-in did not complete. Please try again.</p>}
            {auth.status === "unavailable" && <p className="auth-dialog-notice" role="status">{auth.error}</p>}
            <button className="auth-provider-button" type="button" onClick={() => startGoogleSignIn(signInContext.returnTo || undefined)}>
              Continue with Google
            </button>
            <button className="auth-provider-button" type="button" onClick={() => startGitHubSignIn(signInContext.returnTo || undefined)}>
              Continue with GitHub
            </button>
            <p className="auth-dialog-footnote">No Sketchizi password required.</p>
          </section>
        </div>
      )}
    </div>
  );
}
