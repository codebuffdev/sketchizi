export default function ThemeControl({ themeMode, setThemeMode, isDarkTheme }) {
  return (
<div className="theme-control">
  <button
    type="button"
    className={themeMode !== "light" ? "theme-toggle active" : "theme-toggle"}
    onClick={() => setThemeMode((mode) => (mode === "dark" ? "light" : mode === "light" ? "dark" : "dark"))}
    aria-label={`Theme: ${themeMode}`}
    title="Theme (D)"
    aria-haspopup="menu"
    aria-expanded="false"
  >
    <span className="theme-toggle-icon">{isDarkTheme ? "☾" : "☀"}</span>
    <span>{isDarkTheme ? "Dark" : "Light"}</span>
    <span className="theme-chevron">⌄</span>
  </button>
  <div className="theme-menu" role="menu" aria-label="Theme selection">
    {[
      ["dark", "☾", "Dark"],
      ["light", "☀", "Light"],
      ["system", "▣", "System"],
    ].map(([mode, icon, label]) => (
      <button
        key={mode}
        type="button"
        className={themeMode === mode ? "theme-option selected" : "theme-option"}
        onClick={() => setThemeMode(mode)}
        role="menuitemradio"
        aria-checked={themeMode === mode}
      >
        <span className="theme-option-check">{themeMode === mode ? "✓" : ""}</span>
        <span className="theme-option-icon">{icon}</span>
        <span>{label}</span>
      </button>
    ))}
    <div className="theme-menu-divider" />
    <div className="theme-shortcut">Keyboard shortcut <kbd>D</kbd></div>
  </div>
</div>
  );
}
