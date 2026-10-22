import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../src/features/workbench/WorkbenchPanel.jsx', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/features/workbench/useWorkbenchController.js', import.meta.url), 'utf8');

test('LLD blueprint resolves relationship endpoints by scoped implementation ownership', () => {
  assert.match(panel, /entity\.properties\?\.implementationParentId === lldBlueprint\.parentId/);
  assert.match(panel, /visibleEntityIds\.includes\(source\.id\).*visibleEntityIds\.includes\(target\.id\)/);
});

test('LLD blueprint connection action uses validated typed relationship controller', () => {
  assert.match(panel, /onCreateRelationBetween\?\.\(\{ sourceId: source\.id, kind: item\.kind, targetId: target\.id \}\)/);
  assert.match(controller, /const validation = validateRelationAgainstModel\(kind, sourceEntity, targetEntity, workbench\.entities, workbench\.relations\)/);
  assert.match(controller, /validateRelationAgainstModel/);
});

test('LLD blueprint disables missing or already-created connections', () => {
  assert.match(panel, /disabled=\{!canEdit \|\| busy \|\| !endpointsReady \|\| exists\}/);
  assert.match(panel, /exists \? "Connected" : "Create connection"/);
});
