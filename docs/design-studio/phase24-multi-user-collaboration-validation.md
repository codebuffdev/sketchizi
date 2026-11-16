# Phase 24 — Multi-user collaboration validation

This phase adds an opt-in integration check against a real Supabase project. Unlike unit tests, it exercises authenticated PostgREST requests and the deployed row-level security policies with two separate user JWTs.

## Required environment

Set these variables in a local shell or protected CI secret store:

- `SUPABASE_URL`: project URL.
- `SUPABASE_ANON_KEY`: public anon/publishable key.
- `SUPABASE_USER_A_JWT`: access token for a workspace owner/editor/reviewer.
- `SUPABASE_USER_B_JWT`: access token for a second workspace member who can read and write reviews.
- `SUPABASE_WORKSPACE_ID`: UUID for a pre-provisioned workspace containing both users.

Do not use service-role credentials. The harness intentionally uses only end-user JWTs so RLS remains active. Ensure both test accounts have appropriate workspace membership through a trusted administrative provisioning path before running it.

## Run

```bash
npm run test:shared-review-integration-contract
npm run test:shared-review-integration
```

The contract test is safe for normal CI and needs no secrets. The live integration command requires the environment variables above and performs these checks:

1. User A inserts a uniquely named review.
2. User B reads the same review through a separate authenticated session.
3. User A updates it using the observed `updated_at` timestamp.
4. User B attempts a stale conditional update using the old timestamp; it must affect zero rows.
5. User B confirms the newer payload is still present.

The integration review row is intentionally retained for auditability. A trusted workspace administrator can remove test rows with the `integration-` review ID prefix when appropriate. The harness does not request broad table deletion privileges.

## Realtime validation

This harness validates authenticated persistence, RLS-backed visibility, and stale-write behavior. It is **not a substitute for testing live Realtime delivery**. To validate subscriptions, open the same review in two authenticated browser sessions, confirm the receiving session reports a subscription state, update the review in the first session, and verify the second receives a notification. Then test reconnects and workspace/review filtering. Record the deployed project, test users (non-sensitive labels only), timestamp, and outcome in the release record.

## Failure interpretation

- `401`: token expired, malformed, or issued for another project.
- `403` / permission denied: RLS policy or workspace membership/role is not provisioned correctly.
- User B cannot read: confirm both accounts are members of the exact workspace.
- Stale update affects a row: check the `updated_at` trigger and conditional filter; do not ship until stale writes are rejected.
- Missing/empty response: confirm PostgREST `Prefer: return=representation` and migration state.

Do not claim multi-user collaboration is production-verified until the live integration check and the two-browser Realtime check both pass against the deployed Supabase project.
