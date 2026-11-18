import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("DockSelect remains defined for contextual controls", () => {
  assert.ok(dock.includes("function DockSelect({ label, value, onChange, icon, children })"));
});

test("sloppiness dropdown is available for shapes, lines, arrows, and draw-to-shape", () => {
  assert.ok(dock.includes('const isShape = ["rectangle", "diamond", "ellipse"].includes(type)'));
  assert.ok(dock.includes('const isLine = ["line", "arrow"].includes(type)'));
  assert.ok(dock.includes('<DockGroup label="Sloppiness">'));
  assert.ok(dock.includes('<VisualOptionSelect label="Sloppiness"'));
  for (const label of ["Architect", "Artist", "Cartoonist"]) {
    assert.ok(dock.includes(`label: "${label}"`));
  }
});

test("sloppiness changes selected elements and the active drawing tool", () => {
  assert.ok(dock.includes('roughness: "currentItemRoughness"'));
  assert.ok(dock.includes("onChange={(value) => update({ roughness: Number(value) })}"));
  assert.ok(dock.includes('const roughness = Number(current("roughness", "currentItemRoughness", 1))'));
});

test("mutually exclusive contextual style choices use compact dropdowns", () => {
  for (const label of ["Stroke width", "Stroke style", "Fill style", "Corners", "Pen pressure"]) {
    assert.ok(dock.includes(`label="${label}"`), `missing dropdown for ${label}`);
  }
  assert.ok(!dock.includes("WIDTHS.map((width) => <ToolButton"));
  assert.ok(!dock.includes('LINE_STYLES.map(([value, label]) => <ToolButton'));
  assert.ok(!dock.includes('FILL_STYLES.map(([value, label]) => <ToolButton'));
});

test("stroke style and sloppiness use visual option menus with accessible names", () => {
  assert.ok(dock.includes("function VisualOptionSelect({ label, value, onChange, kind, options })"));
  assert.ok(dock.includes('role="listbox" aria-label={label}'));
  assert.ok(dock.includes('aria-label={option.label} title={option.label}'));
  assert.ok(dock.includes('kind="line-style"'));
  assert.ok(dock.includes('kind="roughness"'));
});

test("all contextual setting dropdowns are icon-only custom menus", () => {
  assert.ok(dock.includes("function DockOptionGlyph({ label, value })"));
  assert.ok(dock.includes("function DockSelect({ label, value, onChange, icon, children })"));
  assert.ok(dock.includes('role="listbox" aria-label={label}'));
  assert.ok(dock.includes('role="option"'));
  const dockSelect = dock.slice(dock.indexOf("function DockSelect("), dock.indexOf("\nfunction OptionGlyph"));
  assert.ok(!dockSelect.includes("<select"));
  for (const label of ["Stroke width", "Fill style", "Corners", "Start arrowhead", "End arrowhead", "Font family", "Pen pressure"]) {
    assert.ok(dock.includes(`label="${label}"`), `missing icon dropdown for ${label}`);
  }
});

test("icon dropdowns expose selection state and dismiss on outside click or Escape", () => {
  assert.ok(dock.includes("aria-selected={String(option.value) === String(value)}"));
  assert.ok(dock.includes('event.key === "Escape"'));
  assert.ok(dock.includes('event.type === "pointerdown"'));
});

test("custom dropdowns safely normalize option children and empty option lists", () => {
  assert.ok(dock.includes("Children.toArray(children)"));
  assert.ok(dock.includes("isValidElement(child) && child.props?.value !== undefined"));
  assert.ok(dock.includes('|| { value: "", label }'));
  assert.ok(dock.includes("safeOptions = Array.isArray(options)"));
  assert.ok(dock.includes("|| safeOptions[0] || { value: 0, label }"));
});

test("dropdown menus render above the canvas and handle portal clicks", () => {
  assert.equal(dock.split("createPortal(").length - 1, 2);
  assert.equal(dock.split("menuRef.current?.contains(event.target)").length - 1, 2);
  const optionClick = "onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChange(option.value); setOpen(false); }}";
  assert.equal(dock.split(optionClick).length - 1, 2);
  assert.ok(!dock.includes("onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onChange(option.value); setOpen(false); }}"));
});
