# Phase 22 — Realtime collaboration and conflict handling

## What changed

- Added a Supabase Realtime subscription to `architecture_review_collaborations`, scoped by workspace and optionally by review ID.
- The review panel reports subscription state and warns when a remote change arrives. It deliberately does not replace local edits automatically.
- Added optimistic concurrency to the remote store. Call `save(workspaceId, payload, { expectedUpdatedAt })` with the timestamp from the last loaded row. `null` means create-only; a timestamp means update only if the row is unchanged. Stale writes return an error with code `REVIEW_CONFLICT`.
- Added a migration to include the collaboration table in the `supabase_realtime` publication when available.

## Operator steps

1. Apply migrations `202610230001_architecture_review_collaboration.sql` and `202610230002_architecture_review_realtime.sql`.
2. Ensure Supabase Realtime is enabled for the project and the table is in the `supabase_realtime` publication.
3. Provision workspace memberships through a trusted administrative path. Do not permit users to self-assign workspace roles.
4. Configure `window.__SKETCHIZI_SUPABASE_CLIENT__` with the authenticated Supabase client.
5. In two authenticated browsers, load the same review. A change in one browser should notify the other; stale saves must be reloaded and reconciled manually.

## Concurrency behavior

The UI does not perform automatic three-way merge. A remote change invalidates the local known version and asks the user to load the latest copy. Save uses an `updated_at` compare-and-set condition, so concurrent writes cannot silently overwrite the same previously observed revision. If an update races with another update, the caller receives `REVIEW_CONFLICT`.

## Limits

Realtime is best-effort transport, not a durable event log. Refresh/list/load remains the recovery path if a browser misses an event. Manual reconciliation is required; this phase does not merge individual reviewer/comment changes or provide an immutable compliance audit trail.
