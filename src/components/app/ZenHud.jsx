import React from "react";
import MapDock from "./MapDock.jsx";

/**
 * Bottom-right dock: the Map pill sits immediately left of the Zen pill
 * (Zen is always present; Map is hidden, and its radar unmounted, in Zen
 * Mode). Also renders the standalone top-right AI capsule that replaces the
 * header's AI pill while Zen Mode hides the header.
 */
export default function ZenHud({ hidden = false, isZenMode, onToggleZen, aiOpen, onToggleAi, mapProps = null }) {
  if (hidden) return null;
  return (
    <>
      <div className="sk-hud-dock">
        {!isZenMode && mapProps && <MapDock {...mapProps} />}
        <button
          type="button"
          className={`sk-zen-pill${isZenMode ? " is-active" : ""}`}
          onClick={onToggleZen}
          aria-pressed={isZenMode}
          aria-label={isZenMode ? "Exit Zen mode" : "Enter Zen mode"}
          title={isZenMode ? "Exit Zen mode (Alt+Z / Esc)" : "Zen mode (Alt+Z)"}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {isZenMode
              ? <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3" />
              : <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />}
          </svg>
          <span>{isZenMode ? "Exit Zen" : "Zen"}</span>
        </button>
      </div>
      <button
        type="button"
        className={`sk-zen-ai-capsule${isZenMode ? " is-visible" : ""}${aiOpen ? " is-active" : ""}`}
        onClick={onToggleAi}
        aria-label="AI Ask"
        aria-expanded={aiOpen}
        title="AI Ask"
        tabIndex={isZenMode ? 0 : -1}
        aria-hidden={!isZenMode}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.3l-1.9-5.5-5.6-1.9L10.1 9 12 3.5Z" /></svg>
        <span>AI</span>
      </button>
    </>
  );
}
