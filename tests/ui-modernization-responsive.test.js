import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/ui-modernization-responsive.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('responsive modernization stylesheet is loaded after the shared visual layer', () => {
  assert.match(styles, /ui-modernization\.css/);
  assert.match(styles, /ui-modernization-responsive\.css/);
  assert.ok(styles.indexOf('ui-modernization-responsive.css') > styles.indexOf('ui-modernization.css'));
});

test('panel sizing respects viewport and safe-area bounds', () => {
  assert.match(css, /max-width:\s*calc\(100vw\s*-\s*16px/);
  assert.match(css, /max-height:\s*calc\(100dvh/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
});

test('tablet and phone breakpoints preserve touch-friendly controls and form usability', () => {
  assert.match(css, /min-width:\s*40px/);
  assert.match(css, /min-height:\s*40px/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /max-width:\s*760px/);
  assert.match(css, /max-width:\s*420px/);
});

test('compact landscape and reduced-motion modes are covered', () => {
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /max-height:\s*520px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
