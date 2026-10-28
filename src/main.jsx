import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import App from "./App.jsx";
import CommunityApp from "./features/community/CommunityApp.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import PhoneAccessGate from "./PhoneAccessGate.jsx";
import { installGlobalErrorHandlers } from "./logging/logger";
import { fetchCurrentUser, signOut } from "./features/auth/authClient.js";
import WorkspaceDashboard from "./features/workspace/WorkspaceDashboard.jsx";

installGlobalErrorHandlers();

function RootApp() {
  const [auth, setAuth] = useState({ status: "checking", user: null });
  const forceEditor = new URLSearchParams(window.location.search).get("editor") === "1";
  const communityRoute = /^\/(reviews|feedback|admin|join-team)(?:\/|$)/.test(window.location.pathname);

  useEffect(() => {
    if (communityRoute || forceEditor) return undefined;
    let active = true;
    const check = () => fetchCurrentUser().then((result) => {
      if (active) setAuth({ status: result.authenticated ? "authenticated" : "anonymous", user: result.user });
    }).catch(() => { if (active) setAuth({ status: "unavailable", user: null }); });
    check();
    window.addEventListener("sketchizi:auth-changed", check);
    return () => { active = false; window.removeEventListener("sketchizi:auth-changed", check); };
  }, [communityRoute, forceEditor]);

  if (communityRoute) return <CommunityApp />;
  if (forceEditor || auth.status === "anonymous" || auth.status === "unavailable") return <PhoneAccessGate><App /></PhoneAccessGate>;
  if (auth.status === "checking") return <main className="cw-startup" role="status">Loading your workspace…</main>;
  return <WorkspaceDashboard user={auth.user} onOpenEditor={() => { window.location.href = "/?editor=1"; }} onSignOut={async () => { try { await signOut(); window.location.assign("/"); } catch (error) { window.alert(error.message || "Sign out failed."); } }} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<ErrorBoundary><RootApp /></ErrorBoundary>);
