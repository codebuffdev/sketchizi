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
  const editorRoute = new URLSearchParams(window.location.search).get("editor") === "1";
  const workspaceRoute = window.location.pathname === "/workspace" || window.location.pathname.startsWith("/workspace/");
  const communityRoute = /^\/(reviews|feedback|admin|join-team)(?:\/|$)/.test(window.location.pathname);

  useEffect(() => {
    if (communityRoute || editorRoute) return undefined;
    let active = true;
    const check = () => fetchCurrentUser()
      .then((result) => {
        if (active) setAuth({ status: result.authenticated ? "authenticated" : "anonymous", user: result.user });
      })
      .catch(() => {
        if (active) setAuth({ status: "unavailable", user: null });
      });
    void check();
    window.addEventListener("sketchizi:auth-changed", check);
    return () => {
      active = false;
      window.removeEventListener("sketchizi:auth-changed", check);
    };
  }, [communityRoute, editorRoute]);

  if (communityRoute) return <CommunityApp />;

  // A direct Workspace navigation should explain an authentication outage
  // instead of silently dropping the user back into the drawing editor.
  if (workspaceRoute && auth.status === "unavailable") {
    return <main className="cw-startup" role="alert"><div><p>Cloud Workspace could not verify your sign-in session.</p><p>Please retry after the authentication service is reachable.</p><button onClick={() => window.location.reload()}>Retry</button> <a href="/?editor=1">Open the editor</a></div></main>;
  }

  // The Cloud Workspace is strictly for a verified, authenticated user.
  // The editor remains available without an account or during auth outages.
  if (editorRoute || auth.status === "anonymous" || auth.status === "unavailable") {
    return <PhoneAccessGate><App /></PhoneAccessGate>;
  }
  if (auth.status === "checking") {
    return <main className="cw-startup" role="status">Loading Sketchizi…</main>;
  }

  return <WorkspaceDashboard
    user={auth.user}
    onOpenEditor={() => { window.location.assign("/?editor=1"); }}
    onSignOut={async () => {
      try {
        await signOut();
        window.location.assign("/");
      } catch (error) {
        window.alert(error.message || "Sign out failed.");
      }
    }}
  />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<ErrorBoundary><RootApp /></ErrorBoundary>);
