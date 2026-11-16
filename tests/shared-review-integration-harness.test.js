import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../scripts/test-shared-review-integration.mjs', import.meta.url), 'utf8');
const docs = await readFile(new URL('../docs/design-studio/phase24-multi-user-collaboration-validation.md', import.meta.url), 'utf8').catch(() => '');

test('two-user integration harness requires two distinct authenticated sessions', () => {
  for (const key of ['SUPABASE_USER_A_JWT', 'SUPABASE_USER_B_JWT', 'SUPABASE_WORKSPACE_ID', 'SUPABASE_ANON_KEY']) assert.ok(script.includes(key), `missing ${key}`);
  assert.match(script, /User A can create/);
  assert.match(script, /User B can read/);
});

test('integration harness checks stale conditional writes and verifies latest payload survives', () => {
  assert.match(script, /updated_at=eq\./);
  assert.match(script, /stale update was not rejected/i);
  assert.match(script, /stale write changed the latest review unexpectedly/i);
});

test('integration harness does not require or print a service-role key', () => {
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(script, /never accepts or logs a service-role key/i);
});

test('phase documentation describes required provisioning and limits of validation', () => {
  assert.ok(docs.includes('SUPABASE_USER_A_JWT'));
  assert.ok(docs.includes('Realtime'));
  assert.ok(docs.includes('not a substitute for testing live Realtime delivery'));
});
