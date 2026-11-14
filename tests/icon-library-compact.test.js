import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStoredViewMode, VIEW_MODE_STORAGE_KEY } from '../src/features/icon-library/iconPanelUtils.js';

const panel = readFileSync(new URL('../src/IconLibraryPanel.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/icon-panel-compact.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('compact library CSS is loaded after the expanded panel theme', () => {
  assert.ok(entry.indexOf('./styles/icon-panel-compact.css') > entry.indexOf('./styles/icon-panel-v2.css'));
  assert.match(styles, /width: min\(320px, calc\(100vw - 28px\)\) !important/);
  assert.match(styles, /height: min\(460px, calc\(100dvh/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test('all icon catalogs remain accessible from shortcuts or overflow menu', () => {
  for (const id of ['aws', 'kubernetes', 'networking', 'mindmaps', 'uml', 'eraser']) {
    assert.ok(panel.includes('id: "' + id + '"'), 'missing catalog ' + id);
  }
  assert.match(panel, /primaryCatalogTabs/);
  assert.match(panel, /extraCatalogTabs/);
  assert.match(panel, /aria-haspopup="menu"/);
  assert.match(panel, /aria-expanded=\{moreCollectionsOpen\}/);
  assert.match(panel, /role="menuitemradio"/);
  assert.match(panel, /if \(moreCollectionsOpen\) setMoreCollectionsOpen\(false\)/);
  assert.match(panel, /onClick=\{\(\) => chooseSource\(tab\.id\)\}/);
});

test('icon list defaults to compact while retaining stored grid or list selection', () => {
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => null };
    assert.equal(loadStoredViewMode(), 'list');
    globalThis.localStorage = { getItem: (key) => key === VIEW_MODE_STORAGE_KEY ? 'grid' : null };
    assert.equal(loadStoredViewMode(), 'grid');
    globalThis.localStorage = { getItem: (key) => key === VIEW_MODE_STORAGE_KEY ? 'list' : null };
    assert.equal(loadStoredViewMode(), 'list');
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test('compact presentation retains search, favorites, recent, drag and insert actions', () => {
  assert.match(panel, /className="search sk-search-input"/);
  assert.match(panel, /chooseSource\("favorites"\)/);
  assert.match(panel, /chooseSource\("recent"\)/);
  assert.match(panel, /setViewMode\("grid"\)/);
  assert.match(panel, /setViewMode\("list"\)/);
  assert.match(panel, /toggleFavorite\(icon\)/);
  assert.match(panel, /handleDragStart\(event, icon\)/);
  assert.match(panel, /handleIconClick\(icon\)/);
});
