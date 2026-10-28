import { useEffect, useState } from "react";
import App from "../../App.jsx";
import { fetchCurrentUser } from "../auth/authClient.js";
import { saveSketch } from "../../persistence.js";
import { workspaceClient } from "./workspaceClient.js";
import WorkspaceDashboard from "./WorkspaceDashboard.jsx";
import "./workspace.css";

const DIRECT_EDITOR_QUERY_KEYS = [
  "workspace", "diagramId", "startCollaboration", "aiAsk", "room", "roomId",
  "collab", "collaboration", "authError", "githubRepoConnected", "githubRepoError",
];

function loadingScreen(message) {
  return (
    <main className="workspace-entry-loading" aria-live="polite">
      <div className="workspace-entry-loading-inner">
        <img src="/sketchizi-logo.svg" alt="" />
        <strong>{message}</strong>
      </div>
    </main>
  );
}

export default function WorkspaceEntryGate() {
  const [entry, setEntry] = useState({ status: "checking", page: "unknown", user: null, error: "" });
  const url = new URL(window.location.href);
  const pathname = url.pathname;
  const params = url.searchParams;
  const diagramId = params.get("workspace") === "editor" ? params.get("diagramId") : null;
  const isExplicitDashboard = pathname === "/workspace" || pathname === "/workspace/";
  const isSpecialRoute = pathname !== "/" && !isExplicitDashboard;
  const hasIntentQuery = DIRECT_EDITOR_QUERY_KEYS.some((key) => params.has(key));
  const shouldInspectLanding = !isSpecialRoute && (isExplicitDashboard || (!hasIntentQuery && !diagramId));

  useEffect(() => {
    let cancelled = false;

    if (diagramId) {
      setEntry({ status: "loading-diagram", page: "editor", user: null, error: "" });
      workspaceClient.getDiagram(diagramId).then(async (diagram) => {
        const document = diagram.document || {};
        if (!Array.isArray(document.elements) || !document.appState || typeof document.appState !== "object") {
          throw new Error("This cloud diagram has an unsupported document structure. The server copy has not been changed.");
        }
        await saveSketch({
          elements: document.elements,
          appState: document.appState,
          files: document.files || {},
          metadata: document.metadata || {},
          extensions: document.extensions || {},
          format: diagram.format || document.format || "excalidraw",
        }, `workspace:${diagramId}`);
        if (!cancelled) setEntry({ status: "ready", page: "editor", user: null, error: "" });
      }).catch((error) => {
        if (!cancelled) setEntry({ status: "error", page: "editor", user: null, error: error.message || "Could not load this cloud diagram." });
      });
      return () => { cancelled = true; };
    }

    if (!shouldInspectLanding) {
      setEntry({ status: "ready", page: "editor", user: null, error: "" });
      return () => { cancelled = true; };
    }

    setEntry({ status: "checking", page: "unknown", user: null, error: "" });
    const refreshAuth = () => {
      fetchCurrentUser().then(({ authenticated, user }) => {
        if (cancelled) return;
        setEntry({
          status: "ready",
          page: authenticated || isExplicitDashboard ? "dashboard" : "editor",
          user: authenticated ? user : null,
          error: "",
        });
      }).catch(() => {
        if (!cancelled) setEntry({
          status: "ready",
          page: isExplicitDashboard ? "dashboard" : "editor",
          user: null,
          error: "",
        });
      });
    };
    window.addEventListener("sketchizi:auth-changed", refreshAuth);
    refreshAuth();
    return () => {
      cancelled = true;
      window.removeEventListener("sketchizi:auth-changed", refreshAuth);
    };
  }, [diagramId, isExplicitDashboard, shouldInspectLanding]);

  const openLocalEditor = () => {
    window.location.assign("/?workspace=editor");
  };
  const openDiagram = (diagram) => {
    window.location.assign("/?workspace=editor&diagramId=" + encodeURIComponent(diagram.id));
  };

  if (entry.status === "loading-diagram") return loadingScreen("Opening your cloud diagram…");
  if (entry.status === "checking") {
    return (
      <main className="workspace-entry-loading">
        <div className="workspace-entry-loading-inner">
          <img src="/sketchizi-logo.svg" alt="" />
          <strong>Checking your workspace…</strong>
          <button type="button" className="workspace-local-button" onClick={openLocalEditor}>Continue to local editor</button>
        </div>
      </main>
    );
  }
  if (entry.status === "error" && entry.page === "editor") {
    return (
      <main className="workspace-entry-error">
        <h1>Could not open cloud diagram</h1>
        <p>{entry.error}</p>
        <p>Your cloud copy has not been overwritten. Retry loading it, or return to your Workspace.</p>
        <button type="button" onClick={() => window.location.reload()}>Retry</button>
        <button type="button" onClick={() => window.location.assign("/workspace")}>Workspace</button>
      </main>
    );
  }
  if (entry.page === "dashboard") {
    return <WorkspaceDashboard user={entry.user} onOpenLocalEditor={openLocalEditor} onOpenDiagram={openDiagram} />;
  }
  return <App />;
}
