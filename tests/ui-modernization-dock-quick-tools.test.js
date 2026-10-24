import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(path.join(root, "src/components/app/SketchiziCanvas.jsx"), "utf8");
const styles = readFileSync(path.join(root, "src/styles/ui-modernization-toolbar-dock.css"), "utf8");
const navigation = readFileSync(path.join(root, "src/features/navigation/useMoreTools.js"), "utf8");

test("quick dock keeps Bucket Fill and Draw to Shape in one persistent group", () => {
  assert.match(component, /id: "bucketfill", label: "Bucket Fill"/);
  assert.match(component, /id: "autoshape", label: "Draw to Shape"/);
  assert.match(component, /const eraserButton = \[\.\.\.toolbar\.querySelectorAll\("button, \[role='button'\]"\)\]/);
  assert.match(component, /const directChildFor = \(node\)/);
  assert.match(component, /toolbar\.insertBefore\(quickGroup, insertionPoint\)/);
  assert.match(component, /data-sketchizi-quick-tool="\$\{id\}"/);
  assert.match(component, /quickGroup\.appendChild\(button\)/);
  assert.match(component, /activeIds = new Set\(quickTools\.map/);
  assert.match(component, /quickGroup\.querySelectorAll/);
  assert.match(navigation, /filter\(\(button\) => !button\.closest\("\.sketchizi-dock-quick-tools"\)\)/);\n  assert.match(navigation, /lastButton\.style\.display = "none"/);\n  assert.match(navigation, /node\.style\.display = node\.dataset\.sketchiziOriginalDisplay/);
});

test("quick dock controls are explicitly non-shrinking and visible", () => {
  assert.match(styles, /\.sketchizi-dock-quick-tools[\s\S]*?display: inline-flex !important/);
  assert.match(styles, /flex: 0 0 auto !important/);
  assert.match(styles, /gap: 0;/);
  assert.match(styles, /width: max-content;/);
  assert.match(styles, /visibility: visible/);
  assert.match(styles, /overflow: visible/);
});

test("quick tools activate directly without clicking More Tools", () => {
  assert.match(component, /button\.addEventListener\("pointerdown"/);
  assert.match(component, /button\.addEventListener\("click"/);
  assert.match(component, /pointerActivationAt < 700/);
  assert.match(component, /new CustomEvent\("sketchizi:activate-tool", \{ detail: \{ tool: id \} \}\)/);
  assert.doesNotMatch(component, /querySelector\([^\n]*more-tools-menu[^\n]*\)[\s\S]{0,200}\.click\(/);
});
