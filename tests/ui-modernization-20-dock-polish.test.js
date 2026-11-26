import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('dock labels never depend on a custom body-level tooltip that could be clipped', () => {
  const primary = readFileSync(new URL('../src/components/app/PrimaryDock.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(canvas, /document\.body\.appendChild\(toolbarTooltip\)|toolbarTooltip\.remove\(\)/);
  // Tooltips are DOM descendants of the dock (never portalled) and native titles are not used.
  assert.match(primary, /data-tip=\{tooltipLabel\(child\)\}/);
  assert.match(primary, /className="sketchizi-tool-sidebar-tooltip" role="tooltip"/);
  assert.doesNotMatch(primary, /createPortal|\stitle=\{/);
});

test('dock buttons preserve accessible names and release their window listeners on cleanup', () => {
  const primary = readFileSync(new URL('../src/components/app/PrimaryDock.jsx', import.meta.url), 'utf8');
  assert.match(primary, /aria-label=\{label\}/);
  assert.match(primary, /aria-label=\{child\.label\}/);
  assert.match(primary, /window\.removeEventListener\("click", clearCustomTool, true\)/);
  assert.doesNotMatch(canvas, /button\.removeAttribute\("title"\)/);
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


test('duplicate native Scroll back to content tooltip is suppressed', () => {
  const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const suppressNativeScrollBackTooltip = \(\) => \{/);
  assert.match(canvas, /tooltip\.classList\.contains\("sketchizi-toolbar-tooltip"\)/);
  assert.match(canvas, /tooltip\.style\.setProperty\("display", "none", "important"\)/);
  assert.match(canvas, /tooltipObserver\.observe\(document\.body, \{ childList: true, subtree: true \}\)/);
});

test('Scroll back to content keeps its accessible name and sits above the contextual dock when they overlap', () => {
  assert.match(canvas, /return \/scroll back to content\/i\.test\(label\)|\/scroll back to content\/i\.test\(label\)/);
  assert.match(canvas, /button\.dataset\.sketchiziTooltip = "Scroll back to content"/);
  assert.match(canvas, /const liftedTop = contextualRect\.top - buttonHeight - 12/);
  assert.match(canvas, /position\.top = Math\.min\(position\.top, Math\.round\(liftedTop\)\)/);
});
