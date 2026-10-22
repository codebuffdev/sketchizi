import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../src/features/workbench/WorkbenchPanel.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/workbench.css', import.meta.url), 'utf8');

test('HLD component offers a direct action to open its scoped LLD view', () => {
  assert.match(panel, /workbench-model-open-lld/);
  assert.match(panel, /setLldParentId\(entity\.id\); onSwitchView\("lld"\)/);
  assert.match(panel, /IMPLEMENTING HLD COMPONENT/);
});

test('LLD navigator scopes to nearby typed relationships and can return to all LLD elements', () => {
  assert.match(panel, /for \(let depth = 0; depth < 2; depth \+= 1\)/);
  assert.match(panel, /frontier\.has\(relation\.sourceId\)/);
  assert.match(panel, /frontier\.has\(relation\.targetId\)/);
  assert.match(panel, /Show all LLD components/);
  assert.match(panel, /No connected LLD components found yet/);
});

test('HLD-to-LLD navigation controls have separate accessible buttons and responsive styling hooks', () => {
  assert.match(panel, /aria-label=\{`Design LLD for/);
  assert.match(styles, /\.workbench-model-entity-row/);
  assert.match(styles, /\.workbench-lld-parent-context/);
});
