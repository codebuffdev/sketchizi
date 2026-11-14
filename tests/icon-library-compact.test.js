import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStoredViewMode, VIEW_MODE_STORAGE_KEY } from '../src/features/icon-library/iconPanelUtils.js';

const panel = readFileSync(new URL('../src/IconLibraryPanel.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/icon-panel-compact.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('compact library CSS is loaded after the expanded panel theme', () => {
  assert.ok(entry.indexOf('./styles/icon-panel-compact.css') > entry.indexOf('./styles/icon-panel-v2.css'));
  assert.match(styles, /width: min\(320px, calc\(100vw - 28px\)\) !important/);
  assert.match(styles, /height: min\(460px, calc\(100dvh/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test('portal host lifts the compact drawer above mobile header without altering canvas', () => {
  assert.match(app, /import \{ createPortal \} from "react-dom"/);
  assert.match(app, /libraryOverlayHost && createPortal\(/);
  assert.match(app, /sk-icon-library-portal-host/);
  assert.match(styles, /\.app > \.sk-icon-library-portal-host\.mobile-resource-open\s*\{[^}]*position: fixed !important;[^}]*z-index: 900 !important;/s);
  assert.match(styles, /\.sk-icon-library-portal-host\.mobile-resource-closed\s*\{[^}]*display: none !important;/s);
});

test('one compact category selector exposes all real catalogs and subcategories', () => {
  for (const id of ['aws', 'kubernetes', 'networking', 'mindmaps', 'uml', 'eraser']) {
    assert.ok(panel.includes('id: "' + id + '"'), 'missing catalog ' + id);
  }
  assert.match(panel, /className="sk-unified-category-select"/);
  assert.match(panel, /aria-label="Icon category"/);
  assert.match(panel, /getSubcategoryOptions/);
  assert.match(panel, /chooseSource\(value\)/);
  assert.doesNotMatch(panel, /primaryCatalogTabs|catalogMenuTabs|sk-catalog-tabs/);
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

test('compact results count and footer guidance have panel-sized typography', () => {
  assert.match(panel, /sk-icon-compact-results-meta/);
  assert.match(panel, /sk-icon-compact-hint/);
  assert.match(styles, /\.sk-icon-compact-results-meta\s*\{[^}]*font-size: 10\.5px !important/s);
  assert.match(styles, /\.sk-icon-compact-hint\s*\{[^}]*font-size: 10px !important/s);
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
