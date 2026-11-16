/**
 * Smart Theme Palettes for Sketchizi
 * 1-click aesthetic diagram beautifier with cohesive color harmony
 */

export const SMART_THEMES = [
  {
    id: "cloud-native",
    name: "Cloud Native",
    description: "Vibrant cyan, electric indigo, and deep slate accents",
    swatch: ["#3b82f6", "#60a5fa", "#dbeafe"],
    colors: {
      primaryStroke: "#3b82f6",
      secondaryStroke: "#60a5fa",
      accentStroke: "#2563eb",
      containerStroke: "#93c5fd",
      primaryFill: "#dbeafe",
      secondaryFill: "#eff6ff",
      textStroke: "#1e40af",
    }
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    description: "High-contrast hot pink, electric violet, and deep cosmic ink",
    swatch: ["#ec4899", "#8b5cf6", "#ede9fe"],
    colors: {
      primaryStroke: "#ec4899",
      secondaryStroke: "#8b5cf6",
      accentStroke: "#d946ef",
      containerStroke: "#f472b6",
      primaryFill: "#fdf2f8",
      secondaryFill: "#faf5ff",
      textStroke: "#831843",
    }
  },
  {
    id: "pastel-boardroom",
    name: "Pastel Boardroom",
    description: "Executive presentation soft amber, sage green, and warm cream",
    swatch: ["#d97706", "#059669", "#fef3c7"],
    colors: {
      primaryStroke: "#d97706",
      secondaryStroke: "#059669",
      accentStroke: "#2563eb",
      containerStroke: "#fcd34d",
      primaryFill: "#fef3c7",
      secondaryFill: "#ecfdf5",
      textStroke: "#78350f",
    }
  },
  {
    id: "minimalist-monokai",
    name: "Minimalist Slate",
    description: "Clean modern monochrome slate with crisp neutral outlines",
    swatch: ["#475569", "#94a3b8", "#f1f5f9"],
    colors: {
      primaryStroke: "#334155",
      secondaryStroke: "#64748b",
      accentStroke: "#0f172a",
      containerStroke: "#94a3b8",
      primaryFill: "#f8fafc",
      secondaryFill: "#f1f5f9",
      textStroke: "#0f172a",
    }
  },
  {
    id: "architectural-blueprint",
    name: "Blueprint Navy",
    description: "Classic architectural engineering blueprint with vivid cyan lines",
    swatch: ["#0284c7", "#38bdf8", "#e0f2fe"],
    colors: {
      primaryStroke: "#0284c7",
      secondaryStroke: "#38bdf8",
      accentStroke: "#0369a1",
      containerStroke: "#7dd3fc",
      primaryFill: "#e0f2fe",
      secondaryFill: "#f0f9ff",
      textStroke: "#075985",
    }
  }
];

export function applySmartThemeToElements(elements, themeId) {
  const theme = SMART_THEMES.find((t) => t.id === themeId);
  if (!theme || !Array.isArray(elements)) return elements;

  return elements.map((el) => {
    if (!el || el.isDeleted || el.deleted) return el;
    
    // Don't recolor raw images / icons
    if (el.type === "image") return el;

    const copy = { ...el };

    if (el.type === "text") {
      copy.strokeColor = theme.colors.textStroke;
    } else if (el.type === "arrow" || el.type === "line") {
      copy.strokeColor = theme.colors.secondaryStroke;
    } else if (["rectangle", "diamond", "ellipse"].includes(el.type)) {
      copy.strokeColor = theme.colors.primaryStroke;
      if (copy.backgroundColor && copy.backgroundColor !== "transparent") {
        copy.backgroundColor = theme.colors.primaryFill;
      }
    }

    return copy;
  });
}
