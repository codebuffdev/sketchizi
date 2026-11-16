import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('compact grip explicitly resets global native button chrome', () => {
  assert.match(css, /button\.sketchizi-dock-grip[\s\S]*?appearance:\s*none\s*!important/);
  assert.match(css, /button\.sketchizi-dock-grip[\s\S]*?border:\s*0\s*!important/);
  assert.match(css, /button\.sketchizi-dock-grip[\s\S]*?box-shadow:\s*none\s*!important/);
  assert.match(css, /button\.sketchizi-dock-grip[\s\S]*?width:\s*8px\s*!important/);
  assert.match(css, /button\.sketchizi-dock-grip[\s\S]*?height:\s*20px\s*!important/);
});

test('grip keeps a visible keyboard focus indicator', () => {
  assert.match(css, /button\.sketchizi-dock-grip:focus-visible[\s\S]*?outline:\s*2px solid #b9b2ff\s*!important/);
});

test('toolbar dock stylesheet is imported before all CSS rules', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const importIndex = styles.indexOf('@import "./styles/ui-modernization-toolbar-dock.css";');
  assert.notEqual(importIndex, -1, 'toolbar dock stylesheet import exists');
  const firstRuleIndex = styles.search(/\n(?!\s*@import\b)(?!\s*\/\*)\s*[^\s/]/);
  assert.ok(firstRuleIndex === -1 || importIndex < firstRuleIndex, 'import must appear before ordinary CSS rules');
});
