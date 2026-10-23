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
