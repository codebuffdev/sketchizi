import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("contextual formatting dock is fixed to the bottom center instead of following selection bounds", () => {
  assert.match(source, /left: "50%"/);
  assert.match(source, /bottom: "16px"/);
  assert.match(source, /transform: "translateX\(-50%\)"/);
  assert.match(source, /"--format-popover-side": "top"/);
  assert.match(styles, /\.format-options-popover\.side-top[\s\S]*?bottom: calc\(100% \+ 10px\)/);
});

test("formatting controls continue to derive their values and actions from the active selection", () => {
  assert.match(source, /const liveSelection = selectedElements\.filter/);
  assert.match(source, /const applyFormatting = \(patch\) =>/);
  assert.match(source, /onClick=\{\(\) => setOpenGroup\(\(current\) => current === group\.id \? null : group\.id\)\}/);
});


test("Zen Mode formatting dock retains Smart Themes for applicable selected objects", () => {
  assert.match(source, /id: "themes", label: "Smart Themes"/);
  assert.match(source, /const applySmartTheme = \(themeId\) =>/);
  assert.match(source, /applySmartThemeToElements\(\[element\], themeId\)/);
  assert.match(source, /iconOnlySelection && \["stroke", "opacity", "themes"\]/);
  assert.doesNotMatch(source, /group\.id === "themes" \|\| \(activeToolMode/);
});
