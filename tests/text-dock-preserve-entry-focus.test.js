import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");

test("text font-family menu preserves the active text editor focus", () => {
  assert.match(source, /const preserveTextEditorFocus = isText && Boolean\(appState\.editingTextElement\)/);
  assert.match(source, /preserveFocus=\{preserveTextEditorFocus\}/);
  assert.match(source, /if \(!preserveFocus\) menuRef\.current\?\.querySelector/);
  assert.match(source, /onPointerDown=\{preserveFocus \? \(event\) => event\.preventDefault\(\) : undefined\}/);
  assert.match(source, /if \(!preserveFocus\) triggerRef\.current\?\.focus\(\)/);
});

test("pending text size can be adjusted without moving focus away from the text editor", () => {
  assert.match(source, /readOnly=\{preserveTextEditorFocus\}/);
  assert.match(source, /onPointerDown=\{preserveTextEditorFocus \? \(event\) => event\.preventDefault\(\) : undefined\}[\s\S]*?aria-label="Decrease font size"/);
  assert.match(source, /onPointerDown=\{preserveTextEditorFocus \? \(event\) => event\.preventDefault\(\) : undefined\}[\s\S]*?aria-label="Increase font size"/);
  assert.match(source, /if \(preserveTextEditorFocus\) event\.preventDefault\(\)/);
});
