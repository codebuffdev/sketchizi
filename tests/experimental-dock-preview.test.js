import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvas = readFileSync(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dockCss = readFileSync(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");
const stylesEntry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("experimental dock preview is opt-in and reversible without replacing native tool handlers", () => {
  assert.match(canvas, /const \[dockPreviewEnabled, setDockPreviewEnabled\] = useState\(false\)/);
  assert.match(canvas, /dockPreviewSnapshotRef\.current = \{/);
  assert.match(canvas, /root\.dataset\.sketchiziDockPreview = "true"/);
  assert.match(canvas, /container\.setAttribute\("style", snapshot\.containerStyle\)/);
  assert.match(canvas, /Preview new dock/);
  assert.match(canvas, /Exit dock preview/);
  assert.match(canvas, /sketchizi:activate-tool/);
});

test("preview presents a compact left-side dock with theme-aware states", () => {
  assert.match(canvas, /toolbar\.dataset\.sketchiziOrientation = "vertical"/);
  assert.match(canvas, /container\.style\.setProperty\("left", "16px", "important"\)/);
  assert.match(dockCss, /data-sketchizi-dock-preview="true"/);
  assert.match(dockCss, /width: 50px !important/);
  assert.match(dockCss, /border-radius: 16px !important/);
  assert.match(dockCss, /\.app\.theme-dark[\s\S]*?data-sketchizi-dock-preview="true"/);
  assert.match(dockCss, /sketchizi-dock-preview-toggle/);
});

test("experimental preview styles load with the existing toolbar stylesheet", () => {
  assert.match(stylesEntry, /ui-modernization-toolbar-dock\.css/);
});
