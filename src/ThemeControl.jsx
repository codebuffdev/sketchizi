export default function ThemeControl({ setThemeMode, isDarkTheme }) {
  return (
    <button
      type="button"
      className={`theme-toggle desktop-app-theme-toggle ${isDarkTheme ? "dark" : "light"}`}
      onClick={() => setThemeMode?.(isDarkTheme ? "light" : "dark")}
      role="switch"
      aria-checked={isDarkTheme}
      aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
      title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="theme-toggle-option sun" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.58 4.58l1.42 1.42M18 18l1.42 1.42M2.5 12h2M19.5 12h2M4.58 19.42 6 18M18 6l1.42-1.42" />
        </svg>
      </span>
      <span className="theme-toggle-option moon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
        </svg>
      </span>
    </button>
  );
}
