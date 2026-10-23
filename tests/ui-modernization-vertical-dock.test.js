import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('vertical dock parent expands instead of clipping the native toolbar', () => {
  assert.match(css, /App-toolbar-container:has\(\.App-toolbar\[data-sketchizi-orientation="vertical"\]\)/);
  assert.match(css, /max-width:\s*78px\s*!important/);
  assert.match(css, /overflow:\s*visible\s*!important/);
});

test('vertical dock retains scrollable height and keeps native tool children visible', () => {
  assert.match(css, /data-sketchizi-orientation="vertical"\][\s\S]*?max-height:\s*calc\(100vh - 16px\)\s*!important/);
  assert.match(css, /data-sketchizi-orientation="vertical"\]\s*>\s*\*\s*\{[\s\S]*?visibility:\s*visible\s*!important/);
  assert.match(css, /overflow-y:\s*auto\s*!important/);
});
