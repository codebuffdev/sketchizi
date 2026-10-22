import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../src/features/workbench/WorkbenchPanel.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/workbench.css', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/features/workbench/useWorkbenchController.js', import.meta.url), 'utf8');

test('model navigator reflects the selected canvas entity accessibly', () => {
  assert.match(panel, /selectedEntity\?\.id === entity\.id \? " is-selected"/);
  assert.match(panel, /aria-pressed=\{selectedEntity\?\.id === entity\.id\}/);
});

test('navigator selection focuses the component and opens its properties', () => {
  assert.match(panel, /onFocusFinding\?\.\(\{ entityIds: \[entity\.id\] \}\); changePanelTab\("inspect"\)/);
  assert.match(controller, /api\.updateScene\(\{ appState: \{ \.\.\.api\.getAppState\(\), selectedElementIds: \{ \[container\.id\]: true \}/);
  assert.match(controller, /api\.scrollToContent\?\.\(\[container\]/);
});

test('selected navigator rows have visible light and dark theme states', () => {
  assert.match(styles, /\.workbench-model-entity\.is-selected/);
  assert.match(styles, /\.theme-dark \.workbench-model-entity\.is-selected/);
});
