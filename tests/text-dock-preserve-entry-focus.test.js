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

test("font family controls use Excalidraw's text-property interaction hook while editing", () => {
  assert.match(source, /className=\{\`sk-tool-choice-trigger\$\{preserveFocus \? " properties-trigger" : ""\}\`\}/);
  assert.match(source, /className=\{\`sk-tool-choice-option\$\{active \? " is-selected" : ""\}\$\{preserveFocus \? " properties-trigger" : ""\}\`\}/);
  assert.match(source, /const liveAppState = api\.getAppState\?\.\(\) \|\| \{\}/);
  assert.match(source, /Object\.entries\(liveAppState\.selectedElementIds \|\| \{\}\)/);
  assert.match(source, /const selectedFromProps = selectedElements\.filter/);
  assert.match(source, /const liveSelectedIds = Object\.entries\(appState\.selectedElementIds \|\| \{\}\)/);
  assert.match(source, /Prefer the live Excalidraw selection when React.s selectedElements prop/);
  assert.match(source, /activeEditingText\?\.id/);
});

test("nested font picker glyphs cannot bypass Excalidraw's exact properties-trigger target check", () => {
  const styles = readFileSync(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");
  assert.match(styles, /\.properties-trigger > \*[\s\S]*?pointer-events: none !important/);
  assert.match(styles, /\.properties-trigger \*[\s\S]*?pointer-events: none !important/);
});

test("font family changes resolve live selected text and update only text elements", () => {
  assert.match(source, /const liveSelected = \(apiRef\?\.current\?\.getSceneElements\?\.\(\) \|\| \[\]\)\.filter/);
  assert.match(source, /const updateTextFontFamily = \(value\) =>/);
  assert.match(source, /const liveIds = Object\.entries\(liveState\.selectedElementIds \|\| \{\}\)/);
  assert.match(source, /const propTextIds = selectedFromProps[\s\S]*?element\.type === "text"/);
  assert.match(source, /targetIds\.has\(element\.id\) && element\.type === "text"/);
  assert.match(source, /fontFamily: Number\(value\)/);
  assert.match(source, /onChange=\{updateTextFontFamily\} preserveFocus icon=/);
});


test("font picker preserves a selected text element even when it is not in edit mode", () => {
  assert.match(source, /<DockSelect label="Font family"[\\s\\S]*?onChange=\\{updateTextFontFamily\\} preserveFocus icon=/);
});
