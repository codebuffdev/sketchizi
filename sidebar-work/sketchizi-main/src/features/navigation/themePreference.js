export const THEME_PREFERENCE_KEY = "diagram-app-theme";

const VALID_THEME_MODES = new Set(["dark", "light", "system"]);

/**
 * Resolve the initial application theme synchronously, before the first React
 * render. Existing valid preferences always win; missing/invalid/unavailable
 * storage falls back to Dark.
 */
export function getInitialThemeMode(storage) {
  try {
    const preferenceStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    const saved = preferenceStorage?.getItem(THEME_PREFERENCE_KEY);
    return VALID_THEME_MODES.has(saved) ? saved : "dark";
  } catch {
    return "dark";
  }
}
