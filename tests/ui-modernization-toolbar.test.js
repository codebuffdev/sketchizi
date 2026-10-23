import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/ui-modernization.css', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/components/app/DesktopAppHeader.jsx', import.meta.url), 'utf8');

test('toolbar modernization styles the existing native canvas toolbar without hiding it', () => {
  assert.match(css, /\.desktop-canvas-region \.excalidraw \.Island\.App-toolbar/);
  assert.match(css, /\.App-toolbar \.ToolIcon\.active \.ToolIcon__icon/);
  assert.match(css, /\.App-toolbar \.ToolIcon__icon:hover/);
  assert.doesNotMatch(css, /\.App-toolbar[^{}]*\{[^}]*display:\s*none\s*!important/s);
});

test('top navigation keeps existing command and collaboration actions wired', () => {
  assert.match(header, /command\.execute\?\.\(\)/);
  assert.match(header, /openCommandPalette\?\.\(\)/);
  assert.match(header, /startCollaboration\?\.\(\)/);
  assert.match(css, /\.desktop-app-nav-button/);
  assert.match(css, /\.desktop-app-search-button/);
  assert.match(css, /\.desktop-app-start-collaboration-button/);
});

test('top navigation and toolbar have dark theme and reduced-motion treatments', () => {
  assert.match(css, /\.app\.theme-dark \.desktop-app-nav-button/);
  assert.match(css, /\.app\.theme-dark \.desktop-canvas-region \.excalidraw \.Island\.App-toolbar/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
