import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');

test('the getting-started card stays removed from the canvas', () => {
  assert.doesNotMatch(canvas, /Start with an idea|Choose a tool from the dock|sketchizi-discovery-hint|discoveryHintDismissed/);
  assert.doesNotMatch(dockCss, /sketchizi-discovery-hint/);
});

test('lightweight discovery removal does not change native shortcut help', () => {
  assert.match(canvas, /<ShortcutHelp open=\{shortcutHelpOpen\} onClose=\{closeShortcuts\} \/>/);
  assert.match(canvas, /closeShortcuts, shortcutHelpOpen/);
});
