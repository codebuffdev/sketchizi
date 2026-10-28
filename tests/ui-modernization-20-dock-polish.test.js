import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('tooltips are rendered in a body-level portal so the vertical dock cannot clip them', () => {
  assert.match(canvas, /document\.createElement\("div"\)[\s\S]*?className = "sketchizi-toolbar-tooltip"/);
  assert.match(canvas, /document\.body\.appendChild\(toolbarTooltip\)/);
  assert.match(canvas, /toolbar\?\.dataset\.sketchiziOrientation === "vertical"/);
  assert.match(canvas, /side === "right" \? buttonRect\.left - tipRect\.width - 10 : buttonRect\.right \+ 10/);
  assert.match(canvas, /toolbarTooltip\.remove\(\)/);
});

test('toolbar tooltips preserve accessible names and clean up hover and focus handlers', () => {
  assert.match(canvas, /button\.dataset\.sketchiziTooltip = tooltip/);
  assert.match(canvas, /button\.removeAttribute\("title"\)/);
  assert.match(canvas, /button\.addEventListener\("focus", show\)/);
  assert.match(canvas, /button\.addEventListener\("blur", hide\)/);
  assert.match(canvas, /button\.removeEventListener\("pointerenter", show\)/);
});

test('dock hover, active, disabled and keyboard-focus states are explicit and reduced-motion aware', () => {
  assert.match(css, /ToolIcon__icon:hover/);
  assert.match(css, /ToolIcon\.active \.ToolIcon__icon/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('tooltip portal has theme-aware styling and never intercepts drawing pointer input', () => {
  assert.match(css, /\.sketchizi-toolbar-tooltip/);
  assert.match(css, /\.sketchizi-toolbar-tooltip\.theme-light/);
  assert.match(css, /pointer-events:\s*none/);
});


test('Scroll back to content tooltip is placed below the horizontal dock', () => {
  const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const scrollBackTooltip = \/scroll back to content\/i\.test\(label\)/);
  assert.match(canvas, /if \(scrollBackTooltip\) \{[\s\S]*?top = \(toolbar\?\.getBoundingClientRect\(\)\.bottom \?\? buttonRect\.bottom\) \+ 8;/);
});

test('Scroll back to content uses the dock-aware tooltip instead of a native title tooltip', () => {
  const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /Scroll back to content[\s\S]*?button\.removeAttribute\("title"\)[\s\S]*?bindToolbarTooltip\(button\)/);
  assert.match(canvas, /if \(!\/scroll back to content\/i\.test\(label\)\) return;/);
});
