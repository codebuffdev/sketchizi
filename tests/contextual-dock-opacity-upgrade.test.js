import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/contextual-dock-polish.css", import.meta.url), "utf8");

test("opacity is the final shared dock module for every supported tool", () => {
  assert.ok(source.includes('<DockGroup label="Opacity">'));
  assert.ok(source.lastIndexOf('<DockGroup label="Opacity">') > source.lastIndexOf('<DockGroup label="Layer order">'));
  assert.ok(source.includes('className={`sk-tool-opacity-scrubber${opacityDragging ? " is-dragging" : ""}${opacityPopoverOpen ? " is-open" : ""}`}'));
  assert.ok(source.includes('role="slider" tabIndex={0}'));
  assert.ok(source.includes("opacityPointerStartRef"));
  assert.ok(source.includes('data-tooltip="Drag to adjust · Click for presets"'));
  assert.ok(source.includes('aria-expanded={opacityPopoverOpen}'));
  assert.ok(source.includes('className="sk-tool-opacity-chevron"'));
  assert.ok(source.includes("const step = event.shiftKey ? 5 : 1"));
});

test("opacity pill uses an accessible radial gauge with precision controls", () => {
  assert.ok(source.includes('className="sk-tool-opacity-ring"'));
  assert.ok(source.includes('strokeDasharray="50.265"'));
  assert.ok(source.includes('strokeDashoffset={50.265 * (1 - opacityValue / 100)}'));
  assert.ok(source.includes('aria-label="Precise opacity"'));
  assert.ok(source.includes("[25, 50, 75, 100]"));
  assert.ok(css.includes(".sk-tool-opacity-ring-track"));
  assert.ok(css.includes(".sk-tool-opacity-ring-progress"));
  assert.ok(css.includes("#A5C4FA"));
  assert.ok(css.includes("#4F46E5"));
  assert.ok(css.includes("min-width: 96px"));
  assert.ok(css.includes("height: 36px"));
});

test("dock architecture keeps the active tool independent and groups tool-specific controls", () => {
  const sidebar = readFileSync(new URL("../src/styles/ipad-radial-tool-wheel.css", import.meta.url), "utf8");
  assert.ok(css.includes("background: rgba(22, 24, 31, .94)"));
  assert.ok(css.includes("background: rgba(255,255,255,.96)"));
  assert.ok(css.includes("padding: 0 6px"));
  assert.ok(sidebar.includes("left: 20px !important"));
  assert.ok(sidebar.includes("bottom: 20px !important"));
  assert.ok(source.includes('<DockGroup label="Stroke & connector">'));
  assert.ok(source.includes('<DockGroup label="Typography">'));
  assert.ok(source.includes('<DockGroup label="Shape modifiers & layers">'));
});
