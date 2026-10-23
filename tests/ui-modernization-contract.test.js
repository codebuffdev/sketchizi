import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/ui-modernization.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('premium minimal workspace stylesheet is loaded after existing layers', () => {
  assert.match(entry, /@import\s+["']\.\/styles\/ui-modernization\.css["'];/);
  assert.ok(entry.indexOf('ui-modernization.css') > entry.indexOf('responsive-menu.css'));
});

test('modernization covers resource library, canvas shell, and context panels', () => {
  for (const selector of ['.desktop-app-header', '.desktop-workspace', '.desktop-resources-region', '.desktop-canvas-region', '.desktop-context-region', '.icon-card', '.properties-panel']) {
    assert.ok(css.includes(selector), `missing expected selector: ${selector}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.app\.theme-dark/);
});

test('modernization does not replace application or canvas behavior', () => {
  assert.match(app, /<SketchiziCanvas/);
  assert.match(app, /<IconLibraryPanel/);
  assert.match(app, /<PropertiesPanel/);
  assert.match(app, /<ArchitectureValidationPanel/);
  assert.doesNotMatch(css, /display\s*:\s*none\s*!important/);
});
