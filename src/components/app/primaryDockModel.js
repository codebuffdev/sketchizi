/**
 * Data model for the Primary Dock: 9 slots in 3 sections.
 *
 * Framework-free so slot/child structure, shortcut hints and active-tool
 * resolution can be unit-tested in plain Node.
 *
 * child.kind
 *   "tool"        -> api.setActiveTool({ type: child.tool }), optionally after
 *                    recording a style patch into the per-canvas tool presets
 *   "highlighter" -> freedraw + highlighter style (save/restore handled by the dock)
 *   "preset"      -> inserts real Excalidraw elements (see presetShapes.js)
 *   "custom"      -> activates a Sketchizi canvas tool through its event bridge
 *                    (bucketfill, codeblock; highlighter has its own kind)
 *   "action"      -> opens a workspace surface
 *
 * keyHint is ONLY set where the key really triggers the tool and is not also
 * bound by an app-level handler (useSketchiziPreferences.js binds D, G, P, M, F).
 * "C" is owned by CodeBlockLayer (window keydown, ignored while typing).
 */

export const HIGHLIGHTER_DEFAULTS = Object.freeze({ strokeColor: "#ffd60a", opacity: 38, strokeWidth: 14 });

const ARROW_BASE = { lineGeometry: "straight", startArrowhead: null, endArrowhead: "arrow", strokeStyle: "solid" };

export const DOCK_SLOTS = Object.freeze([
  { id: "selection", label: "Select", section: "A", tools: [
    { id: "select", label: "Select", kind: "tool", tool: "selection", keyHint: "V" },
    { id: "lasso", label: "Lasso Select", kind: "tool", tool: "lasso" },
  ] },
  { id: "hand", label: "Hand Pan", section: "A", tools: [
    { id: "hand", label: "Pan Canvas", kind: "tool", tool: "hand", keyHint: "H" },
  ] },
  { id: "shapes", label: "Shapes", section: "B", tools: [
    { id: "rectangle", label: "Rectangle", kind: "tool", tool: "rectangle", keyHint: "R", record: { targets: ["rectangle"], patch: { roundness: null } } },
    { id: "rounded-rectangle", label: "Rounded Rectangle", kind: "tool", tool: "rectangle", record: { targets: ["rectangle"], patch: { roundness: { type: 3 } } } },
    { id: "ellipse", label: "Ellipse", kind: "tool", tool: "ellipse", keyHint: "O" },
    { id: "diamond", label: "Diamond", kind: "tool", tool: "diamond" },
    { id: "triangle", label: "Triangle", kind: "preset", preset: "triangle" },
    { id: "hexagon", label: "Hexagon", kind: "preset", preset: "hexagon" },
    { id: "cylinder", label: "Cylinder / Database", kind: "preset", preset: "cylinder" },
    { id: "funnel", label: "Funnel", kind: "preset", preset: "funnel" },
    { id: "bucketfill", label: "Bucket Fill", kind: "custom", tool: "bucketfill", keyHint: "B" },
  ] },
  { id: "connectors", label: "Arrow", section: "B", tools: [
    { id: "arrow", label: "Arrow", kind: "tool", tool: "arrow", keyHint: "A", record: { targets: ["arrow"], patch: { ...ARROW_BASE } } },
    { id: "double-arrow", label: "Double Arrow", kind: "tool", tool: "arrow", record: { targets: ["arrow"], patch: { ...ARROW_BASE, startArrowhead: "arrow" } } },
    { id: "curved-arrow", label: "Curved Arrow", kind: "tool", tool: "arrow", record: { targets: ["arrow"], patch: { ...ARROW_BASE, lineGeometry: "curved" } } },
    { id: "elbow-arrow", label: "Elbow Arrow", kind: "tool", tool: "arrow", record: { targets: ["arrow"], patch: { ...ARROW_BASE, lineGeometry: "elbow" } } },
    { id: "dashed-arrow", label: "Dashed Arrow", kind: "tool", tool: "arrow", record: { targets: ["arrow"], patch: { ...ARROW_BASE, strokeStyle: "dashed" } } },
    { id: "line", label: "Line", kind: "tool", tool: "line" },
  ] },
  { id: "freehand", label: "Pen", section: "B", tools: [
    { id: "pen", label: "Fine Pencil", kind: "tool", tool: "freedraw" },
    { id: "highlighter", label: "Highlighter", kind: "highlighter", tool: "freedraw" },
  ] },
  { id: "text", label: "Text", section: "B", tools: [
    { id: "text", label: "Text Block", kind: "tool", tool: "text", keyHint: "T" },
    { id: "sticky-note", label: "Sticky Note", kind: "preset", preset: "sticky-note" },
    // Click-to-place syntax-highlighted code card (see features/canvas/codeBlock).
    { id: "code-block", label: "Code Block", kind: "custom", tool: "codeblock", keyHint: "C" },
  ] },
  { id: "media", label: "Image", section: "B", tools: [
    // Sketchizi exposes the image tool on the I shortcut.
    { id: "image", label: "Upload Image", kind: "tool", tool: "image", keyHint: "I" },
    { id: "frame", label: "Frame", kind: "tool", tool: "frame" },
  ] },
  { id: "eraser", label: "Eraser", section: "C", tools: [
    { id: "eraser", label: "Eraser", kind: "tool", tool: "eraser", keyHint: "E" },
    { id: "laser", label: "Laser Pointer", kind: "tool", tool: "laser", keyHint: "K" },
  ] },
  { id: "todo", label: "Todo List", section: "C", tools: [
    { id: "todo", label: "Todo List", kind: "action", action: "todo", keyHint: "L" },
  ] },
]);

export const ALL_CHILDREN = Object.freeze(DOCK_SLOTS.flatMap((slot) => slot.tools.map((tool) => ({ ...tool, slotId: slot.id }))));

export const isGroupedSlot = (slot) => slot.tools.length > 1;
export const findSlot = (slotId) => DOCK_SLOTS.find((slot) => slot.id === slotId) || null;
export const findChild = (childId) => ALL_CHILDREN.find((child) => child.id === childId) || null;

/** Persistent tools can be re-activated by tapping the parent slot. Presets/actions cannot. */
export const isPersistentTool = (child) => child?.kind === "tool" || child?.kind === "highlighter" || child?.kind === "custom";

export function defaultSlotMemory() {
  return Object.fromEntries(DOCK_SLOTS.map((slot) => [slot.id, slot.tools[0].id]));
}

/** Section break after the last slot of A and B. */
export function sectionBreakAfter(slot, index) {
  const next = DOCK_SLOTS[index + 1];
  return Boolean(next && next.section !== slot.section);
}

const ELEMENT_TYPE_TO_TOOL = Object.freeze({
  text: "text", arrow: "arrow", line: "line", rectangle: "rectangle", diamond: "diamond",
  ellipse: "ellipse", freedraw: "freedraw", frame: "frame", image: "image",
});

/**
 * Which slot/child the dock should show as active.
 * Excalidraw's activeTool stays "selection" while an element is selected; the
 * dock only changes presentation (same rule as before the redesign).
 */
export function resolveActiveChild({ activeToolType, customTool, selectedType, selectedRounded, slotMemory }) {
  if (customTool === "highlighter" || customTool === "bucketfill") return findChild(customTool);
  if (customTool === "codeblock") return findChild("code-block");
  const type = activeToolType && activeToolType !== "selection"
    ? activeToolType
    : (ELEMENT_TYPE_TO_TOOL[selectedType] || activeToolType || "selection");
  const candidates = ALL_CHILDREN.filter((child) => child.kind === "tool" && child.tool === type);
  if (!candidates.length) return null;
  const remembered = candidates.find((child) => child.id === slotMemory?.[child.slotId]);
  if (remembered) return remembered;
  if (type === "rectangle" && selectedRounded) return findChild("rounded-rectangle");
  return candidates[0];
}

export function tooltipLabel(child) {
  return child.keyHint ? `${child.label} (${child.keyHint})` : child.label;
}
