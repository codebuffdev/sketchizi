// Lets the contextual formatting toolbar hand a color pick to the rich text box
// that is currently selected, without the toolbar knowing about its internals.
const boxes = new Map();

export function registerRichTextBox(id, handler) {
  boxes.set(id, handler);
  return () => boxes.delete(id);
}

// Returns true when a selected rich text box consumed the color.
export function applyRichTextColor(color) {
  for (const handler of boxes.values()) {
    if (handler.isActive() && handler.applyColor(color)) return true;
  }
  return false;
}
