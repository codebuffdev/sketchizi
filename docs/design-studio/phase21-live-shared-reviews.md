# Phase 21 — Live Shared Reviews

## Scope

The architecture review collaboration panel now exposes shared-workspace operations backed by the existing remote review store:

- Check the authenticated workspace's available review count.
- Save the active review's reviewer assignments, sign-off states, and comments to Supabase.
- Load the matching shared record back into the browser-local collaboration cache.
- Surface permission, configuration, and network errors in the existing live status message.

## Host integration contract

The host application must set `window.__SKETCHIZI_SUPABASE_CLIENT__` to an initialized Supabase client configured with the signed-in user's session. The client must not use a service-role key in the browser. Enter a workspace UUID in the panel. Apply `supabase/migrations/202610230001_architecture_review_collaboration.sql` and provision membership through trusted administrative code before use.

## Security and behavior

- PostgreSQL row-level security is authoritative; client controls do not grant membership.
- Workspace membership is provisioned outside the client. Users cannot self-assign workspace roles through these tables.
- This phase provides explicit manual load/save, not realtime subscriptions, automatic conflict resolution, or merge semantics. Last successful save wins for a given workspace/review key.
- A shared record contains collaboration data (reviewer assignments, sign-off states, comments); the full diagram/review snapshot remains managed by the existing review workflow unless a future schema version expands the remote payload.
- The remote store adapter caps payloads at 1 MB.

## Verification

Run `npm run test:system-design-review-remote-store`, `npm run test:system-design-review-collaboration`, `npm run check:package-lock-consistency`, and `npm run build` in an environment with dependencies installed. Browser-level verification must include two authenticated accounts in the same workspace and a viewer account to validate RLS behavior.
