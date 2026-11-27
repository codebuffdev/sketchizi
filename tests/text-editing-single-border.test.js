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

test("only the Ink-Adaptive Hairline Ghost wrapper draws a frame; the textarea has none", () => {
  const wrapper = css.match(/\.excalidraw-textEditorContainer \{([^}]*)\}/)[1];
  assert.match(wrapper, /border: none/);
  assert.match(wrapper, /outline: none/);
  const frame = css.match(/\.sketchizi-text-editor-frame \{([^}]*)\}/)[1];
  assert.match(frame, /border: 1px dashed color-mix\(in srgb, var\(--active-ink\) 40%, transparent\)/);
  assert.match(frame, /background: color-mix\(in srgb, var\(--active-ink\) 3%, transparent\)/);
  assert.match(frame, /border-radius: 6px/);
  assert.match(frame, /padding: 4px 6px/);
  const textarea = css.match(/\.excalidraw-textEditorContainer textarea,[\s\S]*?\{([^}]*)\}/)[1];
  assert.match(textarea, /border: none !important/);
  assert.match(textarea, /outline: none !important/);
  assert.match(textarea, /box-shadow: none !important/);
  assert.match(textarea, /background: transparent/);
  assert.ok(css.includes(".excalidraw-textEditorContainer textarea:focus-visible"));
});

test("frame follows strokeColor (--active-ink, caret) and grows around the textarea without moving it", async () => {
  const src = read("src/features/canvas/textEditorFrame.js");
  assert.ok(src.includes('"--active-ink"'));
  assert.ok(src.includes('"caret-color"'));
  assert.ok(src.includes("element?.strokeColor"));
  assert.ok(src.includes("MutationObserver") && src.includes("ResizeObserver") && src.includes('"input"'));
  assert.ok(read("src/components/app/SketchiziCanvas.jsx").includes("attachTextEditorFrame"));
  const { computeFrameBox, safeInk } = await import("../src/features/canvas/textEditorFrame.js");
  assert.deepEqual(computeFrameBox({ left: 100, top: 50, width: 80, height: 24 }), { left: 94, top: 46, width: 92, height: 32 });
  assert.equal(safeInk("red; x"), "#2f2f33");
  assert.equal(safeInk("#d25555"), "#d25555");
});

test("rich-text run coloring is gone; color swatches recolor the whole box and keep editor focus", () => {
  for (const gone of ["RichTextBox.jsx", "richTextColorBridge.js", "richTextModel.js"]) {
    assert.equal(existsSync(new URL(`../src/features/canvas/${gone}`, import.meta.url)), false, gone);
  }
  const toolbar = read("src/components/app/ContextualFormattingToolbar.jsx");
  assert.ok(!toolbar.includes("applyRichTextColor"));
  assert.ok(toolbar.includes("onMouseDown={(e) => e.preventDefault()}"));
});

test("no second overlay frame is drawn over the canvas selection", () => {
  assert.equal(existsSync(new URL("../src/components/app/SelectionFrame.jsx", import.meta.url)), false);
  assert.ok(!read("src/components/app/SketchiziCanvas.jsx").includes("SelectionFrame"));
});

test("the font-size badge skips the text box being edited", () => {
  assert.ok(read("src/components/app/TextSizeIndicator.jsx").includes("element.id === editingId"));
});
