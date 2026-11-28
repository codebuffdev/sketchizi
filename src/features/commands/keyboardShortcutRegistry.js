/**
 * Central keyboard-shortcut registry for the Primary Dock and its sub-docks.
 *
 * Framework-free so definitions, matching, formatting, conflict detection and
 * the typing-exclusion rules can be unit-tested in plain Node.
 *
 * CONVENTION
 *   Primary dock tool ......... a plain letter                (R, A, P ...)
 *   Every individual sub-tool . Alt+Shift+<key>  (Option+Shift on macOS)
 *
 * Why Alt+Shift for sub-tools: Ctrl/Cmd+letter is owned by the browser/OS
 * (reload, new tab, print, find ...) and cannot be reliably prevented, and a
 * bare Shift+letter is used by Excalidraw (flip, etc.). Alt+Shift+letter is
 * free in Sketchizi and Excalidraw. Sub-tool chords match on `event.code`
 * (physical key) so macOS Option, which rewrites `event.key`, still works.
 * Alt+Shift+Z is deliberately unused: Alt+Z is the global Zen toggle.
 *
 * Each definition has a `handler`:
 *   "dock"   -> dispatched by the single dock keydown listener
 *               (same code path as a mouse click: PrimaryDock.chooseChild)
 *   "owner"  -> the key is registered here for labels and conflict detection,
 *               but an existing dedicated handler performs it (C arms Code Block in CodeBlockLayer)
 *   "native" -> performed by Excalidraw itself (O, B, K legacy hints)
 */
import { isMacPlatform } from "./platformShortcut.js";

export const SUB_TOOL_MODIFIERS = Object.freeze({ alt: true, shift: true });

const def = (scope, toolId, slotId, key, extra = {}) => ({
  id: `${scope}:${toolId}`,
  scope,
  toolId,
  slotId,
  key,
  code: /^[A-Z]$/.test(key) ? `Key${key}` : /^[0-9]$/.test(key) ? `Digit${key}` : key,
  modifiers: scope === "sub" ? SUB_TOOL_MODIFIERS : Object.freeze({}),
  handler: "dock",
  ...extra,
});

/** Plain-letter shortcuts. */
const PRIMARY = [
  def("primary", "select", "selection", "V"),
  def("primary", "hand", "hand", "H"),
  def("primary", "rectangle", "shapes", "R"),
  def("primary", "arrow", "connectors", "A"),
  def("primary", "pen", "freehand", "P"),
  def("primary", "text", "text", "T"),
  def("primary", "image", "media", "I"),
  def("primary", "eraser", "eraser", "E"),
  // C belongs to Code Block today (no "Smart Flow Connector" tool exists in the dock).
  def("primary", "code-block", "text", "C", { handler: "owner" }),
  // Plain L is the Line tool. Todo List has no keyboard shortcut.
  def("primary", "line", "connectors", "L"),
  // Legacy plain hints already shown in the dock; performed by Excalidraw.
  def("primary", "ellipse", "shapes", "O", { handler: "native" }),
  def("primary", "bucketfill", "shapes", "B", { handler: "native" }),
  def("primary", "laser", "eraser", "K", { handler: "native" }),
];

/** Alt+Shift chords: one per sub-dock tool (26 tools). */
const SUB = [
  ["select", "selection", "V"], ["lasso", "selection", "H"],
  ["rectangle", "shapes", "R"], ["rounded-rectangle", "shapes", "U"], ["ellipse", "shapes", "O"],
  ["diamond", "shapes", "D"], ["triangle", "shapes", "G"], ["hexagon", "shapes", "X"],
  ["cylinder", "shapes", "Y"], ["funnel", "shapes", "N"], ["bucketfill", "shapes", "W"],
  ["arrow", "connectors", "A"], ["double-arrow", "connectors", "Q"], ["curved-arrow", "connectors", "C"],
  ["elbow-arrow", "connectors", "J"], ["dashed-arrow", "connectors", "S"], ["line", "connectors", "L"],
  ["pen", "freehand", "P"], ["highlighter", "freehand", "M"],
  ["text", "text", "T"], ["sticky-note", "text", "K"], ["code-block", "text", "B"],
  ["image", "media", "I"], ["frame", "media", "F"],
  ["eraser", "eraser", "E"], ["laser", "eraser", "1"],
].map(([toolId, slotId, key]) => def("sub", toolId, slotId, key));

export const SHORTCUT_DEFINITIONS = Object.freeze([...PRIMARY, ...SUB].map((d) => Object.freeze(d)));

/**
 * Combinations that already mean something else in Sketchizi, Excalidraw or the
 * browser. No definition may use one. Signatures are canonical (see signature()).
 */
export const RESERVED_COMBOS = Object.freeze([
  { combo: "D", reason: "Toggle dark/light theme" },
  { combo: "G", reason: "Toggle canvas pattern" },
  { combo: "M", reason: "Pin / unpin the Map" },
  { combo: "F", reason: "Fit diagram to viewport" },
  { combo: "\\", reason: "Toggle the dock" },
  { combo: "/", reason: "Open icon library" },
  { combo: "?", reason: "Show keyboard shortcuts" },
  { combo: "S", reason: "Excalidraw color panel" },
  { combo: "Alt+Z", reason: "Zen mode" },
  { combo: "Alt+Shift+Z", reason: "Shadowed by the Zen handler (matches Alt+Z)" },
  { combo: "Mod+R", reason: "Browser reload" },
  { combo: "Mod+T", reason: "Browser new tab" },
  { combo: "Mod+N", reason: "New canvas / browser window" },
  { combo: "Mod+P", reason: "Browser print" },
  { combo: "Mod+K", reason: "Command palette" },
  { combo: "Mod+Shift+P", reason: "Command palette" },
]);

const normalizeKey = (key) => (key === "\\" || key === "/" || key === "?" ? key : String(key).toUpperCase());

/** Canonical order-independent signature, e.g. "Alt+Shift+R", "Mod+K", "V". */
export function signature({ key, modifiers = {} }) {
  const parts = [];
  if (modifiers.mod) parts.push("Mod");
  if (modifiers.alt) parts.push("Alt");
  if (modifiers.shift) parts.push("Shift");
  parts.push(normalizeKey(key));
  return parts.join("+");
}

/** Duplicate signatures between definitions, and definitions using a reserved combo. */
export function findShortcutConflicts(definitions = SHORTCUT_DEFINITIONS) {
  const seen = new Map();
  const duplicates = [];
  const reserved = [];
  const reservedMap = new Map(RESERVED_COMBOS.map((entry) => [entry.combo, entry.reason]));
  for (const definition of definitions) {
    const sig = signature(definition);
    if (seen.has(sig)) duplicates.push({ signature: sig, ids: [seen.get(sig), definition.id] });
    else seen.set(sig, definition.id);
    // Legacy / owner-handled keys are existing behaviour, not new claims.
    if (definition.handler === "dock" && reservedMap.has(sig)) reserved.push({ signature: sig, id: definition.id, reason: reservedMap.get(sig) });
  }
  return { duplicates, reserved };
}

export const getShortcutsForTool = (toolId, definitions = SHORTCUT_DEFINITIONS) => definitions.filter((d) => d.toolId === toolId);

/* ------------------------------------------------------------------ formatting */

export const detectPlatform = (nav) => (isMacPlatform(nav) ? "mac" : "other");

const MAC_KEY = { "\\": "\\" };

export function formatShortcut(definition, platform = "other") {
  const { modifiers = {}, key } = definition;
  const k = MAC_KEY[key] || normalizeKey(key);
  if (platform === "mac") return `${modifiers.mod ? "⌘" : ""}${modifiers.alt ? "⌥" : ""}${modifiers.shift ? "⇧" : ""}${k}`;
  const parts = [];
  if (modifiers.mod) parts.push("Ctrl");
  if (modifiers.alt) parts.push("Alt");
  if (modifiers.shift) parts.push("Shift");
  parts.push(k);
  return parts.join("+");
}

/** "R · Alt+Shift+R" style label for every shortcut of a tool. */
export function shortcutLabelsForTool(toolId, platform = "other", definitions = SHORTCUT_DEFINITIONS) {
  return getShortcutsForTool(toolId, definitions).map((d) => formatShortcut(d, platform));
}

/** `aria-keyshortcuts` value (space separated, ARIA key names). */
export function ariaKeyShortcuts(toolId, platform = "other", definitions = SHORTCUT_DEFINITIONS) {
  return getShortcutsForTool(toolId, definitions)
    .map((d) => [d.modifiers.mod ? (platform === "mac" ? "Meta" : "Control") : null, d.modifiers.alt ? "Alt" : null, d.modifiers.shift ? "Shift" : null, normalizeKey(d.key)].filter(Boolean).join("+"))
    .join(" ");
}

/* ------------------------------------------------------------------ matching */

function modifiersMatch(definition, event, platform) {
  const wantMod = Boolean(definition.modifiers.mod);
  const mac = platform === "mac";
  // "mod" = Cmd on macOS, Ctrl elsewhere. The other one must NOT be held.
  const modOk = wantMod
    ? (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
    : !event.ctrlKey && !event.metaKey;
  return modOk && Boolean(event.altKey) === Boolean(definition.modifiers.alt) && Boolean(event.shiftKey) === Boolean(definition.modifiers.shift);
}

function keyMatches(definition, event) {
  // Chords (Alt held) match the physical key: Option rewrites event.key on macOS.
  if (definition.modifiers.alt) return event.code === definition.code;
  const pressed = String(event.key || "");
  if (/^[a-z]$/i.test(pressed)) return pressed.toUpperCase() === definition.key;
  // Non-latin layouts: fall back to the physical key.
  return event.code === definition.code;
}

export function matchShortcut(event, { platform = "other", definitions = SHORTCUT_DEFINITIONS } = {}) {
  if (!event) return null;
  return definitions.find((d) => modifiersMatch(d, event, platform) && keyMatches(d, event)) || null;
}

/* ------------------------------------------------------------------ typing exclusion */

export function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable === true) return true;
  return Boolean(target.closest?.("input, textarea, select, [contenteditable='true'], [role='textbox'], [role='dialog'], [role='menu'], .excalidraw-textEditorContainer, .monaco-editor, .cm-editor"));
}

/**
 * True when the event must be left alone: auto-repeat, IME composition, already
 * handled, typing in a field, or an active canvas text-editing session.
 */
export function shouldIgnoreShortcutEvent(event, { isEditingCanvasText = () => false } = {}) {
  if (!event || event.repeat || event.isComposing || event.defaultPrevented) return true;
  if (isTypingTarget(event.target)) return true;
  return Boolean(isEditingCanvasText());
}

/* ------------------------------------------------------------------ dispatcher */

/**
 * Builds the one keydown handler. `activate(definition)` must use the same path as a click.
 * `getContext()` -> { platform, canEdit, isEditingCanvasText(), isBlocked() }
 */
export function createShortcutKeydownHandler({ getContext, activate, definitions = SHORTCUT_DEFINITIONS }) {
  return function onShortcutKeyDown(event) {
    const ctx = getContext() || {};
    if (ctx.canEdit === false || ctx.isBlocked?.()) return;
    if (shouldIgnoreShortcutEvent(event, { isEditingCanvasText: ctx.isEditingCanvasText })) return;
    const match = matchShortcut(event, { platform: ctx.platform, definitions });
    if (!match || match.handler !== "dock") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    activate(match);
  };
}

const installed = new WeakMap();

/** Registers the handler on `target` once; re-installing replaces (never duplicates). Returns a disposer. */
export function installShortcutListener(target, handler) {
  installed.get(target)?.();
  target.addEventListener("keydown", handler, true);
  const dispose = () => {
    target.removeEventListener("keydown", handler, true);
    if (installed.get(target) === dispose) installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
