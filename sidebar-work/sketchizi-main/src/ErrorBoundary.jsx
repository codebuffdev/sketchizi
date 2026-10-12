import { Component } from "react";
import { logger } from "./logging/logger";

export default class ErrorBoundary extends Component {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unexpected application error." };
  }

  componentDidCatch(error) {
    logger.error("Sketchizi runtime error", error, { category: "error", source: "react-error-boundary" });
  }

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="app-error" role="alert">
        <div className="app-error-card">
          <div className="app-error-mark">!</div>
          <div className="app-error-eyebrow">SKETCHIZI</div>
          <h1>Something went wrong</h1>
          <p>The editor hit an unexpected error. Your browser may recover after a reload.</p>
          {this.state.message && <code>{this.state.message}</code>}
          <button type="button" onClick={this.handleReload}>Reload Sketchizi</button>
        </div>
      </main>
    );
  }
}
