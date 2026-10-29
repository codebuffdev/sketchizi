import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/app/ContextualFormattingToolbar.jsx", import.meta.url), "utf8");

test("Zen Mode anchors the formatting dock to the canvas viewport instead of the selected element", () => {
  const zenBranch = source.indexOf("if (appState.zenModeEnabled === true)");
  const noSelectionBranch = source.indexOf("if (!elements.length)", zenBranch);
  const selectionBounds = source.indexOf("const sceneBounds = elements.reduce", noSelectionBranch);
  assert.ok(zenBranch >= 0, "Zen Mode-specific positioning branch should exist");
  assert.ok(noSelectionBranch > zenBranch, "the fixed Zen Mode branch should run before selection-based placement");
  assert.ok(selectionBounds > noSelectionBranch, "normal selection placement should remain available after the Zen Mode branch");
  const fixedPosition = source.slice(zenBranch, noSelectionBranch);
  assert.match(fixedPosition, /left:\s*"16px"/);
  assert.match(fixedPosition, /top:\s*"64px"/);
  assert.match(fixedPosition, /--format-popover-side/);
});

test("formatting controls continue to derive their values and actions from the active selection", () => {
  assert.match(source, /const liveSelection = selectedElements\.filter/);
  assert.match(source, /const applyFormatting = \(patch\) =>/);
  assert.match(source, /onClick=\{\(\) => setOpenGroup\(\(current\) => current === group\.id \? null : group\.id\)\}/);
});
