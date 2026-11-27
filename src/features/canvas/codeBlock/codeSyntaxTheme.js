/**
 * Syntax + chrome palettes for the Code Block tool.
 * "light" is Day Mode (white surface, slate border); "dark" is Dark Mode.
 * Colours are high-contrast against their surface (>= 4.5:1).
 */

export const CODE_BORDER_WIDTH = 1.5;

export const CODE_THEMES = Object.freeze({
  light: Object.freeze({
    surface: "#ffffff",
    border: "#94a3b8",
    headerText: "#334155",
    badgeText: "#475569",
    badgeFill: "#eef2f7",
    badgeBorder: "#cbd5e1",
    tokens: Object.freeze({
      plain: "#0f172a",
      keyword: "#6d28d9",
      type: "#0e7490",
      string: "#15803d",
      number: "#b45309",
      function: "#1d4ed8",
      decorator: "#be185d",
      operator: "#475569",
      punctuation: "#475569",
      comment: "#64748b",
      property: "#0f766e",
      tag: "#be123c",
      attr: "#a16207",
    }),
  }),
  dark: Object.freeze({
    surface: "#111522",
    border: "#3d4a63",
    headerText: "#cbd5e1",
    badgeText: "#a8b4cb",
    badgeFill: "#1a2032",
    badgeBorder: "#2f3b55",
    tokens: Object.freeze({
      plain: "#e6eaf5",
      keyword: "#c4a7ff",
      type: "#5eead4",
      string: "#86efac",
      number: "#fbbf24",
      function: "#7cb7ff",
      decorator: "#f9a8d4",
      operator: "#9fb0cc",
      punctuation: "#9fb0cc",
      comment: "#7d8aa6",
      property: "#67e8f9",
      tag: "#fb7185",
      attr: "#fcd34d",
    }),
  }),
});

export const normalizeCodeTheme = (theme) => (theme === "dark" ? "dark" : "light");
export const getCodeTheme = (theme) => CODE_THEMES[normalizeCodeTheme(theme)];

/** Comments are the only italic token. */
export const isItalicToken = (type) => type === "comment";
