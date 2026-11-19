import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('infinity canvas defaults to the plain theme-aware Grid style', () => {
  assert.match(
    app,
    /return \["normal", "focus", "local", "dots", "ruled"\]\.includes\(stored\) \? stored : "normal";/
  );
  assert.match(app, /catch \{ return "normal"; \}/);
});
