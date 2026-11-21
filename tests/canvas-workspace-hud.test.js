import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("canvas HUD uses the shared dark and light glass tokens", () => {
  const css = read("../src/styles/canvas-workspace-hud.css");
  for (const token of [
    "rgba(22, 24, 31, .94)",
    "blur(16px)",
    "rgba(255, 255, 255, .09)",
    "0 12px 32px rgba(0, 0, 0, .45)",
    "rgba(255, 255, 255, .96)",
    "rgba(15, 23, 42, .08)",
    "0 10px 28px rgba(15, 23, 42, .09)",
    "bottom: 20px",
    "height: 46px",
    "cubic-bezier(.22, 1, .36, 1)",
    "cubic-bezier(.4, 0, 1, 1)",
  ]) assert.ok(css.includes(token), `missing HUD token: ${token}`);
});

test("Zen mode supports Alt+Z, Escape, and the standalone AI entry point", () => {
  const canvas = read("../src/components/app/SketchiziCanvas.jsx");
  const app = read("../src/App.jsx");
  assert.ok(canvas.includes('event.altKey && event.key?.toLowerCase() === "z"'));
  assert.ok(canvas.includes('event.key === "Escape" && isZenMode'));
  assert.ok(canvas.includes("event.stopPropagation();") && canvas.includes("setIsZenMode(false)"));
  assert.ok(canvas.includes("sketchizi-zen-mode"));
  assert.ok(canvas.includes("sketchizi:open-ai-assistant"));
  assert.ok(app.includes('window.addEventListener("sketchizi:open-ai-assistant", openAssistant)'));
});

test("contextual dock retains typography and radial opacity controls", () => {
  const dock = read("../src/components/app/ToolOptionsDock.jsx");
  assert.ok(dock.includes('{isText && <DockGroup label="Typography">'));
  assert.ok(dock.includes('inputMode="numeric"'));
  assert.ok(dock.includes("strokeDashoffset={50.265 * (1 - opacityValue / 100)}"));
  assert.ok(dock.includes("[25, 50, 75, 100]"));
});

test("floating tool tray prioritizes the requested drawing tools", () => {
  const primary = read("../src/components/app/PrimaryDock.jsx");
  const order = ["selection", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "highlighter", "laser"];
  let previous = -1;
  for (const tool of order) {
    const next = primary.indexOf(`id: "${tool}"`);
    assert.ok(next > previous, `tool ${tool} is missing or out of order`);
    previous = next;
  }
});

test("fill patterns and corner-radius controls are scoped to supported elements", () => {
  const dock = read("../src/components/app/ToolOptionsDock.jsx");
  assert.ok(dock.includes('label="Fill style"'));
  assert.ok(dock.includes('const showCornerRadius = type === "rectangle" || type === "diamond";'));
  assert.ok(dock.includes('(isShape || isHighlighter) && <VisualOptionSelect label="Fill style"'));
});
