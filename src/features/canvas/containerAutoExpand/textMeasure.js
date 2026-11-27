// Browser text measurement for container fitting. Mirrors how Excalidraw sizes
// text elements: the widest line via canvas metrics in the element's font, and
// height = lines * fontSize * lineHeight, both at 1x world scale.

import * as excalidrawCommon from "@excalidraw/common";

// Fallback only used if the pinned @excalidraw/common stops exporting getFontString.
const FALLBACK_FAMILIES = {
  1: "Virgil", 2: "Helvetica", 3: "Cascadia", 4: "Kalam", 5: "Excalifont",
  6: "Nunito", 7: "Lilita One", 8: "Comic Shanns", 9: "Liberation Sans", 10: "Assistant",
};

let sharedContext = null;
function getContext() {
  if (sharedContext) return sharedContext;
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
  sharedContext = canvas.getContext("2d");
  return sharedContext;
}

function fontString(fontSize, fontFamily) {
  if (typeof excalidrawCommon.getFontString === "function") return excalidrawCommon.getFontString({ fontSize, fontFamily });
  return `${fontSize}px ${FALLBACK_FAMILIES[fontFamily] || "Excalifont"}, sans-serif`;
}

export function measureTextBlock({ text, fontSize, fontFamily, lineHeight }) {
  const context = getContext();
  context.font = fontString(fontSize, fontFamily);
  const lines = String(text).split("\n");
  const width = lines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0);
  return { width: Math.ceil(width), height: lines.length * fontSize * lineHeight };
}
