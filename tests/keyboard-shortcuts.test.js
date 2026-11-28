import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SHORTCUT_DEFINITIONS, RESERVED_COMBOS, ariaKeyShortcuts, createShortcutKeydownHandler, detectPlatform,
  findShortcutConflicts, formatShortcut, getShortcutsForTool, installShortcutListener, isTypingTarget,
  matchShortcut, shortcutLabelsForTool, shouldIgnoreShortcutEvent, signature,
} from "../src/features/commands/keyboardShortcutRegistry.js";
import {
  ALL_CHILDREN, DOCK_SLOTS, defaultSlotMemory, resolveActiveChild, tooltipLabel, tooltipLabelWithShortcuts, tooltipShortcutText,
} from "../src/components/app/primaryDockModel.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const dockSource = read("../src/components/app/PrimaryDock.jsx");
const css = read("../src/styles/ipad-radial-tool-wheel.css");

const ev = (over = {}) => ({ key: "", code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false, target: { tagName: "DIV", closest: () => null }, ...over });
const press = (d, over = {}) => d.modifiers.alt
  ? ev({ code: d.code, key: "Dead", altKey: true, shiftKey: true, ...over }) // macOS Option rewrites key
  : ev({ key: d.key.toLowerCase(), code: d.code, ...over });

const PRIMARY_TABLE = { select: "V", hand: "H", rectangle: "R", arrow: "A", pen: "P", text: "T", image: "I", eraser: "E", "code-block": "C", todo: "L" };
const subTools = ALL_CHILDREN.filter((c) => !["hand", "todo"].includes(c.id)); // tools that live in a real sub-dock
const sub = (id) => SHORTCUT_DEFINITIONS.find((d) => d.scope === "sub" && d.toolId === id);
const primary = (id) => SHORTCUT_DEFINITIONS.find((d) => d.scope === "primary" && d.toolId === id);

test("every primary dock tool has its documented plain-letter shortcut", () => {
  for (const [toolId, key] of Object.entries(PRIMARY_TABLE)) {
    const d = primary(toolId);
    assert.ok(d, toolId);
    assert.equal(d.key, key);
    assert.deepEqual({ ...d.modifiers }, {});
    assert.ok(ALL_CHILDREN.some((c) => c.id === toolId), `${toolId} must be a real dock tool`);
    assert.equal(matchShortcut(ev({ key: key.toLowerCase(), code: `Key${key}` }))?.toolId, toolId);
    assert.equal(matchShortcut(ev({ key, code: `Key${key}` }))?.toolId, toolId, "caps lock / uppercase key");
  }
});

test("every sub-dock tool has its own Alt+Shift chord and none is missing", () => {
  assert.equal(subTools.length, 26);
  for (const child of subTools) {
    const d = sub(child.id);
    assert.ok(d, `no sub shortcut for ${child.id}`);
    assert.equal(d.slotId, child.slotId, `${child.id} registered under the wrong slot`);
    assert.deepEqual({ ...d.modifiers }, { alt: true, shift: true });
  }
  assert.equal(SHORTCUT_DEFINITIONS.filter((d) => d.scope === "sub").length, subTools.length, "no orphan chords");
});

test("shortcut conflict detection: no duplicates and no reserved combos", () => {
  const { duplicates, reserved } = findShortcutConflicts();
  assert.deepEqual(duplicates, []);
  assert.deepEqual(reserved, []);
  const sigs = SHORTCUT_DEFINITIONS.map(signature);
  assert.equal(new Set(sigs).size, sigs.length);
  // The detector itself works.
  const dup = [...SHORTCUT_DEFINITIONS, { ...SHORTCUT_DEFINITIONS[0], id: "x" }];
  assert.equal(findShortcutConflicts(dup).duplicates.length, 1);
  const clash = [{ id: "t", scope: "primary", toolId: "t", key: "D", modifiers: {}, handler: "dock" }];
  assert.equal(findShortcutConflicts(clash).reserved.length, 1);
  assert.ok(RESERVED_COMBOS.some((r) => r.combo === "Alt+Z"));
});

test("sub-tool chords never use Ctrl/Cmd and avoid the Zen (Alt+Z) shortcut", () => {
  for (const d of SHORTCUT_DEFINITIONS.filter((x) => x.scope === "sub")) {
    assert.ok(!d.modifiers.mod);
    assert.notEqual(d.code, "KeyZ");
  }
});

test("matching is exact on modifiers (Ctrl/Cmd/Alt/Shift never trigger plain tools)", () => {
  const r = { key: "r", code: "KeyR" };
  assert.equal(matchShortcut(ev(r))?.toolId, "rectangle");
  for (const mod of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) assert.equal(matchShortcut(ev({ ...r, [mod]: true }))?.scope === "primary", false, mod);
  // Ctrl+R / Cmd+R stay the browser's reload.
  assert.equal(matchShortcut(ev({ ...r, ctrlKey: true })), null);
  assert.equal(matchShortcut(ev({ ...r, metaKey: true }), { platform: "mac" }), null);
});

test("sub-tool chords match Alt+Shift on the physical key, including macOS Option remapping", () => {
  for (const child of subTools) {
    const d = sub(child.id);
    assert.equal(matchShortcut(press(d))?.id, d.id, child.id);
    assert.equal(matchShortcut(press(d), { platform: "mac" })?.id, d.id, `${child.id} (mac)`);
    assert.equal(matchShortcut(press(d, { shiftKey: false })), null, `${child.id} needs Shift`);
    assert.equal(matchShortcut(press(d, { altKey: false })), null, `${child.id} needs Alt`);
    assert.equal(matchShortcut(press(d, { ctrlKey: true })), null, `${child.id} + Ctrl is not ours`);
    assert.equal(matchShortcut(press(d, { metaKey: true })), null, `${child.id} + Cmd is not ours`);
  }
});

test("Ctrl on Windows/Linux and Cmd on macOS for 'mod' definitions", () => {
  const defs = [{ id: "m", scope: "x", toolId: "m", key: "J", code: "KeyJ", modifiers: { mod: true }, handler: "dock" }];
  const k = { key: "j", code: "KeyJ" };
  assert.ok(matchShortcut(ev({ ...k, ctrlKey: true }), { platform: "other", definitions: defs }));
  assert.equal(matchShortcut(ev({ ...k, metaKey: true }), { platform: "other", definitions: defs }), null);
  assert.ok(matchShortcut(ev({ ...k, metaKey: true }), { platform: "mac", definitions: defs }));
  assert.equal(matchShortcut(ev({ ...k, ctrlKey: true }), { platform: "mac", definitions: defs }), null);
  assert.equal(formatShortcut(defs[0], "mac"), "⌘J");
  assert.equal(formatShortcut(defs[0], "other"), "Ctrl+J");
});

test("platform detection and label formatting", () => {
  assert.equal(detectPlatform({ platform: "MacIntel" }), "mac");
  assert.equal(detectPlatform({ platform: "Win32" }), "other");
  assert.equal(detectPlatform({ platform: "Linux x86_64" }), "other");
  assert.equal(formatShortcut(sub("rectangle"), "mac"), "⌥⇧R");
  assert.equal(formatShortcut(sub("rectangle"), "other"), "Alt+Shift+R");
  assert.equal(formatShortcut(primary("pen"), "mac"), "P");
  assert.deepEqual(shortcutLabelsForTool("pen", "other"), ["P", "Alt+Shift+P"]);
  assert.equal(ariaKeyShortcuts("rectangle", "other"), "R Alt+Shift+R");
  assert.equal(getShortcutsForTool("nope").length, 0);
});

test("typing fields and canvas text editing are excluded", () => {
  const typing = [
    { tagName: "INPUT", closest: () => null }, { tagName: "TEXTAREA", closest: () => null }, { tagName: "SELECT", closest: () => null },
    { tagName: "DIV", isContentEditable: true, closest: () => null },
    { tagName: "DIV", closest: (sel) => (sel.includes("excalidraw-textEditorContainer") ? {} : null) },
  ];
  for (const target of typing) {
    assert.equal(isTypingTarget(target), true);
    for (const d of [primary("rectangle"), sub("rectangle")]) assert.equal(shouldIgnoreShortcutEvent({ ...press(d), target }), true);
  }
  assert.equal(shouldIgnoreShortcutEvent(ev({}), { isEditingCanvasText: () => true }), true);
  assert.equal(shouldIgnoreShortcutEvent(ev({ repeat: true })), true);
  assert.equal(shouldIgnoreShortcutEvent(ev({ isComposing: true })), true);
  assert.equal(shouldIgnoreShortcutEvent(ev({ defaultPrevented: true })), true);
  assert.equal(shouldIgnoreShortcutEvent(ev({})), false);
});

function harness(ctx = {}) {
  const activated = [];
  const handler = createShortcutKeydownHandler({
    getContext: () => ({ platform: "other", canEdit: true, isEditingCanvasText: () => false, isBlocked: () => false, ...ctx }),
    activate: (d) => activated.push(d.toolId),
  });
  const fire = (e) => {
    const calls = { prevent: 0, stop: 0, stopImmediate: 0 };
    handler({ ...e, preventDefault: () => calls.prevent++, stopPropagation: () => calls.stop++, stopImmediatePropagation: () => calls.stopImmediate++ });
    return calls;
  };
  return { activated, fire };
}

test("dispatcher activates every dock-owned primary and sub-tool directly (no sub-dock needed) and blocks browser defaults", () => {
  const h = harness();
  const dockOwned = SHORTCUT_DEFINITIONS.filter((d) => d.handler === "dock");
  assert.ok(dockOwned.length >= 8 + 26);
  for (const d of dockOwned) {
    const before = h.activated.length;
    const calls = h.fire(press(d));
    assert.equal(h.activated.length, before + 1, d.id);
    assert.equal(h.activated.at(-1), d.toolId);
    assert.deepEqual(calls, { prevent: 1, stop: 1, stopImmediate: 1 });
    assert.ok(findChildById(d.toolId), `${d.toolId} resolves to a real dock child (same path as a click)`);
  }
});
const findChildById = (id) => ALL_CHILDREN.find((c) => c.id === id);

test("owner/native shortcuts (C, L, O, B, K) are labelled but never intercepted by the dock listener", () => {
  const h = harness();
  for (const id of ["code-block", "todo", "ellipse", "bucketfill", "laser"]) {
    const d = primary(id);
    assert.notEqual(d.handler, "dock", id);
    const calls = h.fire(press(d));
    assert.deepEqual(calls, { prevent: 0, stop: 0, stopImmediate: 0 });
  }
  assert.deepEqual(h.activated, []);
});

test("dispatcher stays silent when typing, editing canvas text, read-only, or a welcome surface is open", () => {
  const d = primary("pen");
  assert.equal(harness({ canEdit: false }).fire(press(d)).prevent, 0);
  assert.equal(harness({ isBlocked: () => true }).fire(press(d)).prevent, 0);
  assert.equal(harness({ isEditingCanvasText: () => true }).fire(press(d)).prevent, 0);
  assert.equal(harness().fire(press(d, { target: { tagName: "INPUT", closest: () => null } })).prevent, 0);
  assert.equal(harness().fire(press(sub("pen"), { target: { tagName: "TEXTAREA", closest: () => null } })).prevent, 0);
  assert.equal(harness().fire(press(d, { ctrlKey: true })).prevent, 0);
});

test("activating any sub-tool highlights it in the sub-dock and updates the primary dock indicator", () => {
  for (const child of ALL_CHILDREN.filter((c) => ["tool", "highlighter", "custom"].includes(c.kind))) {
    // Mirrors PrimaryDock: rememberChild() then runChild() sets activeTool / customTool.
    const slotMemory = { ...defaultSlotMemory(), [child.slotId]: child.id };
    const customTool = child.kind === "highlighter" ? "highlighter" : child.kind === "custom" ? child.tool : null;
    const resolved = resolveActiveChild({ activeToolType: child.tool, customTool, selectedType: null, selectedRounded: false, slotMemory });
    assert.equal(resolved?.id, child.id, `${child.id} must be the highlighted child`);
    assert.equal(resolved.slotId, child.slotId, "primary dock pill follows the sub-tool's slot");
  }
});

test("tool configuration is not reset: keyboard path reuses runChild (record/preset logic) untouched", () => {
  assert.match(dockSource, /const chooseChildFromKeyboard = \(child\) => \{\s*rememberChild\(child\);\s*runChild\(child\);\s*\};/);
  assert.match(dockSource, /const chooseChild = \(child, \{ keepOpen = false \} = \{\}\) => \{\s*rememberChild\(child\);\s*runChild\(child\);/);
  // runChild is where style records / highlighter save-restore live; shortcuts add no style writes of their own.
  const from = dockSource.indexOf("keyboard shortcuts */");
  const to = dockSource.indexOf("const rememberedChild");
  assert.ok(from > 0 && to > from, "keyboard block must be located");
  const keyboardBlock = dockSource.slice(from, to);
  assert.match(keyboardBlock, /createShortcutKeydownHandler/);
  assert.doesNotMatch(keyboardBlock, /updateScene|onToolStyleChange|setActiveTool\(/);
});

test("one centralized listener: registry installs it once, replaces rather than duplicates, and cleans up", () => {
  const listeners = [];
  const target = { addEventListener: (t, fn, cap) => listeners.push([t, fn, cap]), removeEventListener: (t, fn) => { const i = listeners.findIndex((l) => l[1] === fn); if (i >= 0) listeners.splice(i, 1); } };
  const a = () => {}; const b = () => {};
  const disposeA = installShortcutListener(target, a);
  assert.equal(listeners.length, 1);
  const disposeB = installShortcutListener(target, b);
  assert.equal(listeners.length, 1, "re-install must not stack listeners");
  assert.equal(listeners[0][1], b);
  assert.equal(listeners[0][2], true, "capture phase so Excalidraw's own keys do not double-handle");
  disposeA(); // stale disposer must not remove the live one... it removes only its own handler
  disposeB();
  assert.equal(listeners.length, 0);
  assert.match(dockSource, /return installShortcutListener\(window, handler\);/);
  assert.equal((dockSource.match(/createShortcutKeydownHandler\(/g) || []).length, 1);
  assert.doesNotMatch(read("../src/components/app/primaryDockModel.js"), /addEventListener/);
});

test("tooltips show shortcuts: legacy format preserved, registry chords appended", () => {
  const rect = findChildById("rectangle");
  assert.equal(tooltipLabel(rect), "Rectangle (R)");
  assert.equal(tooltipLabelWithShortcuts(rect, "other"), "Rectangle (R) · Alt+Shift+R");
  assert.equal(tooltipLabelWithShortcuts(rect, "mac"), "Rectangle (R) · ⌥⇧R");
  assert.equal(tooltipShortcutText(findChildById("pen"), "other"), "P · Alt+Shift+P");
  for (const child of subTools) {
    const text = tooltipLabelWithShortcuts(child, "other");
    assert.match(text, /Alt\+Shift\+/, `${child.id} tooltip lacks its shortcut`);
  }
  assert.match(tooltipLabelWithShortcuts(findChildById("hand"), "other"), /\(H\)/);
  assert.match(tooltipLabelWithShortcuts(findChildById("todo"), "other"), /\(L\)/);
  assert.match(dockSource, /data-tip=\{tooltipLabel\(child\)\}/);
  assert.match(dockSource, /aria-keyshortcuts=/);
  assert.match(css, /content: attr\(data-tip\) attr\(data-shortcut-tail\);/);
});

function luminance(hex) {
  const [r, g, b] = hex.match(/\w\w/g).map((v) => parseInt(v, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test("tooltip is readable in Light and Dark Mode (fixed dark surface, white text, dark-mode outline)", () => {
  const tip = css.match(/\.sketchizi-tool-sidebar-tooltip,\s*\.sketchizi-tool-sidebar-child::after \{([^}]*)\}/)?.[1] || "";
  const full = (h) => (h && h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join("")}` : h);
  const bg = full(tip.match(/background:\s*(#[0-9a-f]{3,6})\b/i)?.[1]);
  const fg = full(tip.match(/[^-]color:\s*(#[0-9a-f]{3,6})\b/i)?.[1]);
  assert.ok(bg && fg);
  assert.ok(contrast(bg, fg) >= 7, `tooltip contrast ${contrast(bg, fg).toFixed(1)}`);
  // The tooltip rule is theme-independent, so light and dark share it; dark mode only adds an outline.
  assert.match(css, /\.sketchizi-tool-sidebar\.is-dark \.sketchizi-tool-sidebar-child::after \{ box-shadow: 0 0 0 1px #3F3F46; \}/);
  assert.ok(contrast(bg, "#3F3F46") < contrast(bg, fg), "outline is subtle, text is not");
});

test("Help dialog lists registry shortcuts and Properties moved off plain P", () => {
  const help = read("../src/ShortcutHelp.jsx");
  assert.match(help, /getShortcutsForTool/);
  assert.match(help, /\["Shift\+P", "Toggle Properties/);
  const prefs = read("../src/features/navigation/useSketchiziPreferences.js");
  assert.match(prefs, /key === "p" && event\.shiftKey && selectedCount > 0/);
});

test("regression: no dock tool or slot was removed or renamed", () => {
  const ids = ALL_CHILDREN.map((c) => c.id);
  for (const id of ["select", "lasso", "hand", "rectangle", "rounded-rectangle", "ellipse", "diamond", "triangle", "hexagon", "cylinder", "funnel", "bucketfill", "arrow", "double-arrow", "curved-arrow", "elbow-arrow", "dashed-arrow", "line", "pen", "highlighter", "text", "sticky-note", "code-block", "image", "frame", "eraser", "laser", "todo"]) assert.ok(ids.includes(id), id);
  assert.deepEqual(DOCK_SLOTS.map((s) => s.id), ["selection", "hand", "shapes", "connectors", "freehand", "text", "media", "eraser", "todo"]);
  assert.equal(findChildById("rectangle").keyHint, "R"); // legacy hints untouched
  assert.equal(findChildById("pen").keyHint, undefined);
});

test("regression: shortcut wiring is declared after everything it reads (no 'before initialization' crash)", () => {
  const at = (needle) => { const i = dockSource.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  const wiring = at("shortcutRef.current = {");
  for (const dep of ["const runChild = ", "const rememberChild = ", "const chooseChildFromKeyboard = "]) {
    assert.ok(at(dep) < wiring, `${dep.trim()} must be declared before the shortcut wiring reads it`);
  }
});
