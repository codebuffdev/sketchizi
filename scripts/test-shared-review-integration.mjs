#!/usr/bin/env node
/**
 * Opt-in, two-user Supabase integration check for architecture review collaboration.
 * Uses only the public PostgREST API; never accepts or logs a service-role key.
 */
import { randomUUID } from 'node:crypto';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_USER_A_JWT', 'SUPABASE_USER_B_JWT', 'SUPABASE_WORKSPACE_ID'];
const missing = required.filter((key) => !String(process.env[key] || '').trim());
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('See docs/design-studio/phase24-multi-user-collaboration-validation.md');
  process.exit(2);
}
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY;
const workspaceId = process.env.SUPABASE_WORKSPACE_ID;
const reviewId = `integration-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const headersFor = (jwt, extra = {}) => ({ apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...extra });
async function request(userJwt, path, options = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...options, headers: headersFor(userJwt, options.headers) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) {
    const error = new Error(`${options.method || 'GET'} ${path} returned ${response.status}: ${body?.message || body?.hint || raw || response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { status: response.status, body };
}
const table = 'architecture_review_collaborations';
const filter = `workspace_id=eq.${encodeURIComponent(workspaceId)}&review_id=eq.${encodeURIComponent(reviewId)}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const report = [];
try {
  const initialPayload = { schemaVersion: 1, reviewId, owner: 'integration-user-a', reviewers: [{ id: 'reviewer-a', name: 'User A', status: 'pending' }], comments: [], updatedAt: new Date().toISOString() };
  const created = await request(process.env.SUPABASE_USER_A_JWT, table, {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ workspace_id: workspaceId, review_id: reviewId, payload: initialPayload }),
  });
  assert(Array.isArray(created.body) && created.body.length === 1, 'User A could not create a shared review. Check membership role and insert RLS policy.');
  report.push('PASS User A can create a review in the configured workspace');

  const visibleToB = await request(process.env.SUPABASE_USER_B_JWT, `${table}?${filter}&select=workspace_id,review_id,payload,updated_at`);
  assert(Array.isArray(visibleToB.body) && visibleToB.body.length === 1, 'User B cannot read User A review. Check workspace membership and select RLS policy.');
  report.push('PASS User B can read the shared review');

  const firstRead = visibleToB.body[0];
  const changedPayload = { ...firstRead.payload, owner: 'updated-by-user-a', updatedAt: new Date().toISOString() };
  const updateA = await request(process.env.SUPABASE_USER_A_JWT, `${table}?${filter}&updated_at=eq.${encodeURIComponent(firstRead.updated_at)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ payload: changedPayload }),
  });
  assert(Array.isArray(updateA.body) && updateA.body.length === 1, 'User A conditional update failed despite using the current timestamp.');
  report.push('PASS User A can update using the current version timestamp');

  const stalePayload = { ...firstRead.payload, owner: 'stale-overwrite-attempt' };
  const staleUpdate = await request(process.env.SUPABASE_USER_B_JWT, `${table}?${filter}&updated_at=eq.${encodeURIComponent(firstRead.updated_at)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ payload: stalePayload }),
  });
  assert(Array.isArray(staleUpdate.body) && staleUpdate.body.length === 0, 'Stale update was not rejected; verify updated_at trigger and conditional-write logic.');
  const latest = await request(process.env.SUPABASE_USER_B_JWT, `${table}?${filter}&select=payload,updated_at`);
  assert(latest.body?.[0]?.payload?.owner === 'updated-by-user-a', 'Stale write changed the latest review unexpectedly.');
  report.push('PASS stale concurrent write affects zero rows and preserves the latest version');

  const forbidden = await request(process.env.SUPABASE_USER_B_JWT, `${table}?${filter}&select=review_id`).catch((error) => error);
  // Viewers are expected to be read-only, but the supplied User B role may be editor/reviewer.
  // This script validates a stale-write guard; use a separately provisioned viewer JWT to test role denial.
  if (forbidden instanceof Error) report.push('INFO User B read check after conflict returned an error; inspect workspace membership if unexpected');
  else report.push('INFO role-specific viewer write denial requires a separately provisioned viewer session');
  console.log(`Shared review integration passed (${reviewId})`);
  for (const line of report) console.log(line);
  console.log('The test review is intentionally retained. Remove it with a trusted admin workflow if desired.');
} catch (error) {
  console.error(`Shared review integration FAILED (${reviewId})`);
  for (const line of report) console.error(line);
  console.error(error.message);
  process.exitCode = 1;
}
