import React from "react";
import ReactDOM from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import PhoneAccessGate from "./PhoneAccessGate.jsx";
import { installGlobalErrorHandlers } from "./logging/logger";

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary><PhoneAccessGate><App /></PhoneAccessGate></ErrorBoundary>,
);
