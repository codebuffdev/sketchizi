// Excalidraw dark canvases use invert(93%) hue-rotate(180deg).
// Convert the color input's visible RGB to/from the stored scene color.
export function canvasColorForDisplay(color, dark) {
  return transform(color, dark, false);
}
export function canvasColorForScene(color, dark) {
  return transform(color, dark, true);
}
function transform(color, dark, inverse) {
  if (!/^#[\da-f]{6}$/i.test(color || "")) return "#ffffff";
  if (!dark) return color.toLowerCase();
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const input = inverse ? channels : channels.map(value => .93 - .86 * value);
  const luminance = input[0] * .213 + input[1] * .715 + input[2] * .072;
  const rotated = input.map(value => 2 * luminance - value);
  const output = inverse ? rotated.map(value => (.93 - value) / .86) : rotated;
  return "#" + output.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")).join("");
}

// Accept pasted CSS-style hex values with an optional hash and short form.
export function normalizeCanvasHex(value) {
  const hex = String(value ?? "").trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) return "#" + [...hex].map(char => char + char).join("").toLowerCase();
  return /^[\da-f]{6}$/i.test(hex) ? "#" + hex.toLowerCase() : null;
}
