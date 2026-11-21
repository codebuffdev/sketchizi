import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("all contextual dropdowns share one choice-menu implementation", () => {
  assert.ok(dock.includes("function DockChoiceMenu("));
  assert.ok(dock.includes("return <DockChoiceMenu"));
  assert.equal(dock.split("createPortal(").length - 1, 1);
  assert.ok(dock.includes("document.body,"));
});

test("choice menus expose visible labels and accessible checked state", () => {
  assert.ok(dock.includes('role="menu" aria-label={label}'));
  assert.ok(dock.includes('role="menuitemradio"'));
  assert.ok(dock.includes("aria-checked={active}"));
  assert.ok(dock.includes("sk-tool-choice-option-label"));
  assert.ok(styles.includes(".sk-tool-choice-option-label"));
});

test("choice menus dismiss on Escape, outside pointer, resize, and scroll", () => {
  assert.ok(dock.includes('event.key === "Escape"'));
  assert.ok(dock.includes('event.type === "pointerdown"'));
  assert.ok(dock.includes('event.type === "resize" || event.type === "scroll"'));
  assert.ok(dock.includes("menuRef.current?.contains(event.target)"));
});

test("choice selection applies the actual option value and restores trigger focus", () => {
  assert.ok(dock.includes("onChange(option.value)"));
  assert.ok(dock.includes("setOpen(false)"));
  assert.ok(dock.includes("triggerRef.current?.focus()"));
});

test("sloppiness remains available for shapes, lines, arrows, and draw-to-shape", () => {
  assert.ok(dock.includes('const isShape = ["rectangle", "diamond", "ellipse"].includes(type)'));
  assert.ok(dock.includes('const isLine = ["line", "arrow"].includes(type)'));
  assert.ok(dock.includes('<DockGroup label="Shape modifiers & layers">'));
  assert.ok(dock.includes('<VisualOptionSelect label="Roughness"'));
  for (const label of ["Architect", "Artist", "Cartoonist"]) assert.ok(dock.includes(`label: "${label}"`));
  assert.ok(dock.includes("onChange={(value) => update({ roughness: Number(value) })}"));
});

test("stroke, fill, corner, arrowhead, font, and pressure controls use the shared menu", () => {
  for (const label of ["Stroke width", "Corner radius", "Start arrowhead", "End arrowhead", "Font family", "Pen pressure"]) {
    assert.ok(dock.includes(label), `missing choice control: ${label}`);
  }
  assert.ok(dock.includes('isHighlighter ? "Fill style"'));
  assert.ok(!dock.includes("function VisualOptionSelect({ label, value, onChange, kind, options }) {\n  const [open"));
});

test("unified menu has deliberate sizing, labels, selected, focus, and reduced-motion styles", () => {
  assert.ok(styles.includes(".sk-tool-choice-trigger"));
  assert.ok(styles.includes("width: 42px"));
  assert.ok(styles.includes(".sk-tool-choice-option.is-selected"));
  assert.ok(styles.includes(".sk-tool-choice-option-label"));
  assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"));
});
