import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeLldBlueprint } from '../src/features/workbench/lldBlueprint.js';

test('LLD blueprint rejects unsupported or missing HLD parent', () => {
  assert.equal(proposeLldBlueprint(null).valid, false);
  assert.equal(proposeLldBlueprint({ id: 'db1', kind: 'data.postgresql-database' }).valid, false);
});

test('LLD blueprint creates reviewable implementation elements and typed relationship suggestions', () => {
  const result = proposeLldBlueprint({ id: 'svc-1', kind: 'backend.rest-service', name: 'Order Service' });
  assert.equal(result.valid, true);
  assert.equal(result.parentId, 'svc-1');
  assert.equal(result.elements.length, 4);
  assert.deepEqual(result.elements.map((item) => item.kind), ['backend.rest-controller', 'backend.java-class', 'backend.repository', 'design.domain-entity']);
  assert.equal(result.relationships.length, 3);
  assert.ok(result.relationships.every((item) => item.kind === 'uses'));
  assert.ok(result.decisions.length >= 3);
  assert.match(result.notice, /not inferred business requirements/);
});

test('LLD blueprint remains deterministic for the same parent', () => {
  const parent = { id: 'svc-1', kind: 'backend.worker', name: 'Notification Worker' };
  assert.deepEqual(proposeLldBlueprint(parent), proposeLldBlueprint(parent));
});
