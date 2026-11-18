import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");

test("Excalifont is the fallback font for contextual text controls", () => {
  assert.ok(dock.includes("DEFAULT_FONT_FAMILY_ID"));
  assert.ok(dock.includes("rawFontFamily) ? rawFontFamily : DEFAULT_FONT_FAMILY_ID"));
  assert.ok(canvas.includes("currentItemFontFamily: normalizeFontFamilyId(savedSketch?.appState?.currentItemFontFamily) ?? DEFAULT_FONT_FAMILY_ID"));
});

test("font-family trigger icon uses a compact size consistent with the dock", () => {
  assert.ok(dock.includes('String(label).toLowerCase().includes("font") ? " is-font-family"'));
  assert.ok(styles.includes(".sk-tool-choice-trigger-glyph.is-font-family > svg"));
  assert.ok(styles.includes("width: 18px;\n  height: 18px;"));
});

test("text formatting resolves the live Excalidraw selection when applying changes", () => {
  assert.ok(dock.includes("liveState.selectedElementIds"));
  assert.ok(dock.includes("const targetIds = new Set(liveIdsState"));
  assert.ok(dock.includes("const activeEditingText = liveState.editingTextElement?.type === \"text\""));
  assert.ok(dock.includes("const ids = targetIds;"));
});
