import React from "react";
import ReactDOM from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import App from "./App.jsx";
import CommunityApp from "./features/community/CommunityApp.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import PhoneAccessGate from "./PhoneAccessGate.jsx";
import WorkspaceEntryGate from "./features/workspace/WorkspaceEntryGate.jsx";
import { installGlobalErrorHandlers } from "./logging/logger";

installGlobalErrorHandlers();

const communityRoute = /^\/(reviews|feedback|admin|join-team)(?:\/|$)/.test(window.location.pathname);
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>{communityRoute ? <CommunityApp /> : <PhoneAccessGate><WorkspaceEntryGate /></PhoneAccessGate>}</ErrorBoundary>,
);
