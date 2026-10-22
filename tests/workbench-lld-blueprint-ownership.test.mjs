import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controller = readFileSync(new URL('../src/features/workbench/useWorkbenchController.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/workbench/WorkbenchPanel.jsx', import.meta.url), 'utf8');

test('component creation accepts explicit blueprint names and assigns implementation parent ownership', () => {
  assert.match(controller, /const addComponent = useCallback\(\(componentKind, options = \{\}\)/);
  assert.match(controller, /name: typeof options\.name === "string"/);
  assert.match(controller, /implementationParentId: options\.parentHldId/);
});

test('LLD blueprint Add actions pass the selected HLD parent and proposed element name', () => {
  assert.match(panel, /onAddComponent\?\.\(item\.kind, \{ name: item\.name, parentHldId: lldBlueprint\.parentId \}\)/);
  assert.match(panel, /Added blueprint elements are named and assigned to this HLD service automatically/);
});
