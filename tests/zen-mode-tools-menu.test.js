import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const menu = await readFile(new URL("../src/components/app/MoreTools.jsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/features/navigation/useMoreTools.js", import.meta.url), "utf8");

test("Tools menu exposes a Zen mode command with the Alt+Z shortcut", () => {
  assert.match(menu, /\["zen-mode",\s*"Zen mode",\s*"Alt\+Z"\]/);
  assert.match(menu, /"zen-mode":\s*<><path/);
});

test("selecting Zen mode enables Zen Mode without changing the active drawing tool", () => {
  const zenAction = actions.indexOf('if (tool === "zen-mode")');
  assert.ok(zenAction >= 0, "Zen mode action should be handled by the Tools menu");
  const nextAction = actions.indexOf("api.setActiveTool({ type: tool })", zenAction);
  const block = actions.slice(zenAction, nextAction);
  assert.match(block, /api\.updateScene\(\{ appState: \{ zenModeEnabled: true \} \}\)/);
  assert.doesNotMatch(block, /setActiveTool/);
});
