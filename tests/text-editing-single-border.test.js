import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/styles/alignment-guides.css");

test("canvas selection border is transparent while the text editor exists, and repainted on open/close", () => {
  assert.match(css, /\.excalidraw:has\(\.excalidraw-textEditorContainer textarea\) \{\s*--color-selection: transparent !important;/);
  const canvas = read("src/components/app/SketchiziCanvas.jsx");
  assert.ok(canvas.includes("MutationObserver"));
  assert.ok(canvas.includes("apiRef?.current?.refresh?.()"));
});

test("the textarea is the only DOM element with a border or focus ring", () => {
  const wrapper = css.match(/\.excalidraw-textEditorContainer \{([^}]*)\}/)[1];
  assert.match(wrapper, /border: none/);
  assert.match(wrapper, /outline: none/);
  const textarea = css.match(/\.excalidraw-textEditorContainer textarea,[\s\S]*?\{([^}]*)\}/)[1];
  assert.match(textarea, /border: 1\.5px solid #6366F1 !important/);
  assert.match(textarea, /border-radius: 6px/);
  assert.match(textarea, /outline: none !important/);
  assert.match(textarea, /box-shadow: none !important/);
  assert.ok(css.includes(".excalidraw-textEditorContainer textarea:focus"));
});

test("no second overlay frame is drawn over the canvas selection", () => {
  assert.equal(existsSync(new URL("../src/components/app/SelectionFrame.jsx", import.meta.url)), false);
  assert.ok(!read("src/components/app/SketchiziCanvas.jsx").includes("SelectionFrame"));
});

test("the font-size badge skips the text box being edited", () => {
  assert.ok(read("src/components/app/TextSizeIndicator.jsx").includes("element.id === editingId"));
});
