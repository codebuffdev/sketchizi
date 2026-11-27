import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DOCK_SLOTS, ALL_CHILDREN, defaultSlotMemory, isGroupedSlot, isPersistentTool,
  resolveActiveChild, sectionBreakAfter, tooltipLabel, HIGHLIGHTER_DEFAULTS,
} from "../src/components/app/primaryDockModel.js";
import { buildPresetSkeleton, presetPoints, PRESET_KINDS } from "../src/features/canvas/presetShapes.js";
import { filterStyleForTool, stylePatchToAppState } from "../src/features/canvas/toolStylePresets.js";

const dock = readFileSync(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");

test("9 slots in three sections with the specified children", () => {
  assert.equal(DOCK_SLOTS.length, 9);
  const counts = Object.fromEntries(DOCK_SLOTS.map((s) => [s.id, s.tools.length]));
  assert.deepEqual(counts, { selection: 2, hand: 1, shapes: 9, connectors: 6, freehand: 2, text: 3, media: 2, eraser: 2, todo: 1 });
  assert.deepEqual(DOCK_SLOTS.map((s, i) => sectionBreakAfter(s, i)).map(Number), [0, 1, 0, 0, 0, 0, 1, 0, 0]);
});

test("every child has its own distinct icon", () => {
  // .jsx cannot be imported in plain Node, so read the icon map from source.
  const src = readFileSync(new URL("../src/components/app/primaryDockIcons.jsx", import.meta.url), "utf8");
  const icons = new Map();
  for (const m of src.matchAll(/^  (?:"([a-z-]+)"|([a-z]+)): (.+),$/gm)) icons.set(m[1] || m[2], m[3]);
  for (const child of ALL_CHILDREN) assert.ok(icons.has(child.id), `no icon for ${child.id}`);
  const bodies = [...icons.values()];
  assert.equal(new Set(bodies).size, bodies.length, "two sub-tools share an identical icon");
  assert.match(icons.get("ellipse"), /<circle/);
  assert.match(icons.get("rectangle"), /rx="0"/);
  assert.match(icons.get("rounded-rectangle"), /rx="6\.5"/);
  assert.match(src, /strokeWidth="1\.75"/);
  assert.match(src, /viewBox="0 0 24 24"/);
});

test("slot memory defaults to each slot's first tool; resolveActiveChild honours it", () => {
  const memory = defaultSlotMemory();
  assert.equal(memory.shapes, "rectangle");
  assert.equal(resolveActiveChild({ activeToolType: "rectangle", slotMemory: memory }).id, "rectangle");
  assert.equal(resolveActiveChild({ activeToolType: "rectangle", slotMemory: { ...memory, shapes: "rounded-rectangle" } }).id, "rounded-rectangle");
  assert.equal(resolveActiveChild({ activeToolType: "arrow", slotMemory: { ...memory, connectors: "curved-arrow" } }).id, "curved-arrow");
  assert.equal(resolveActiveChild({ activeToolType: "lasso", slotMemory: memory }).id, "lasso");
  assert.equal(resolveActiveChild({ activeToolType: "freedraw", customTool: "highlighter", slotMemory: memory }).id, "highlighter");
  assert.equal(resolveActiveChild({ activeToolType: "selection", selectedType: "ellipse", slotMemory: memory }).id, "ellipse");
  assert.equal(resolveActiveChild({ activeToolType: "selection", slotMemory: memory }).id, "select");
});

test("only persistent tools are re-activated by a touch tap on the parent", () => {
  assert.ok(isPersistentTool(ALL_CHILDREN.find((c) => c.id === "ellipse")));
  assert.ok(isPersistentTool(ALL_CHILDREN.find((c) => c.id === "highlighter")));
  for (const id of ["triangle", "sticky-note", "ai-assist", "library"]) assert.ok(!isPersistentTool(ALL_CHILDREN.find((c) => c.id === id)));
});

test("shortcut hints exist only on real, non-colliding keys and appear in tooltip labels", () => {
  assert.equal(tooltipLabel(ALL_CHILDREN.find((c) => c.id === "rectangle")), "Rectangle (R)");
  assert.equal(tooltipLabel(ALL_CHILDREN.find((c) => c.id === "diamond")), "Diamond");
  const hinted = ALL_CHILDREN.filter((c) => c.keyHint).map((c) => c.keyHint);
  for (const k of ["D", "G", "P", "M", "F", "X", "U", "Y", "W", "S", "Q"]) assert.ok(!hinted.includes(k), `${k} must not be hinted`);
});

test("closed preset polygons repeat their first point and use the specified vertex counts", () => {
  const expected = { triangle: 4, hexagon: 7, funnel: 7 };
  for (const [kind, n] of Object.entries(expected)) {
    const pts = presetPoints(kind, 160, 140);
    assert.equal(pts.length, n, kind);
    assert.deepEqual(pts[0], pts.at(-1), `${kind} is not closed`);
  }
  const cyl = buildPresetSkeleton("cylinder", { cx: 0, cy: 0 });
  assert.deepEqual(cyl.map((e) => e.type), ["ellipse", "line"]);
  assert.equal(cyl[1].points.length, 5);
  for (const kind of PRESET_KINDS) for (const el of buildPresetSkeleton(kind)) assert.ok(["line", "ellipse", "rectangle"].includes(el.type));
});

test("sticky note is a note per the repo's isNote convention", () => {
  const [note] = buildPresetSkeleton("sticky-note", { cx: 10, cy: 10 });
  assert.equal(note.customData.isNote, true);
  assert.equal(note.type, "rectangle");
});

test("connector and rectangle variants round-trip through the tool-preset store into currentItem* state", () => {
  const byId = (id) => ALL_CHILDREN.find((c) => c.id === id);
  const app = (id) => { const r = byId(id).record; return stylePatchToAppState(filterStyleForTool(r.targets[0], r.patch)); };
  assert.equal(app("arrow").currentItemArrowType, "sharp");
  assert.equal(app("arrow").currentItemStartArrowhead, null);
  assert.equal(app("double-arrow").currentItemStartArrowhead, "arrow");
  assert.equal(app("curved-arrow").currentItemArrowType, "round");
  assert.equal(app("elbow-arrow").currentItemArrowType, "elbow");
  assert.equal(app("dashed-arrow").currentItemStrokeStyle, "dashed");
  assert.equal(app("rectangle").currentItemRoundness, "sharp");
  assert.equal(app("rounded-rectangle").currentItemRoundness, "round");
});

test("highlighter uses the brief's 14 / 38 style and the existing save/restore flow", () => {
  assert.equal(HIGHLIGHTER_DEFAULTS.strokeWidth, 14);
  assert.equal(HIGHLIGHTER_DEFAULTS.opacity, 38);
  assert.match(dock, /highlighterSavedRef\.current = \{/);
  assert.match(dock, /const restoreHighlighter = \(\) => \{/);
  assert.match(dock, /sketchizi:clear-custom-tool/);
});

test("child rail structure: a DOM child of the nav, outside the inert list, no portal", () => {
  assert.doesNotMatch(dock, /createPortal/);
  const listStart = dock.indexOf('className="sketchizi-tool-sidebar-list"');
  const slotStart = dock.indexOf('className="tool-slot"', listStart);
  const railStart = dock.indexOf('className="sketchizi-tool-sidebar-child-rail sub-dock"', slotStart);
  assert.ok(listStart >= 0 && slotStart > listStart && railStart > slotStart, "rail must be nested in its owning tool slot inside the list");
  assert.match(dock, /event\.pointerType !== "mouse"/);
  assert.match(dock, /CHILD_OPEN_INTENT_MS = 90/);
  assert.match(dock, /CHILD_CLOSE_GRACE_MS = 160/);
  assert.match(dock, /SINGLE_TOOLTIP_DELAY_MS = 180/);
  assert.match(dock, /const idealTop = buttonRect\.top \+ buttonRect\.height \/ 2 - railHeight \/ 2/);
});

test("parent tooltips are only produced for single-tool slots and never while a rail is open", () => {
  assert.match(dock, /if \(!openSlotRef\.current\) setTooltip/);
  assert.match(dock, /\{tooltip && !openSlotId && \(/);
  const groupedBranch = dock.slice(dock.indexOf("if (isGroupedSlot(slot)) {"), dock.indexOf("// Single slot"));
  assert.doesNotMatch(groupedBranch, /setTooltip\(\{/);
});

test("no breakpoint makes the dock, rail or bridge a scroll container", () => {
  assert.match(css, /overflow: visible !important/);
  for (const file of ["responsive-fluid", "canvas-top-controls", "hud-capsules"]) {
    const text = readFileSync(new URL(`../src/styles/${file}.css`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /sketchizi-tool-sidebar-list[^{]*\{[^}]*overflow-x:\s*auto/);
  }
});
