# Phase 20 — Shared Review Persistence

Phase 20 adds a Supabase/Postgres persistence adapter and an RLS migration for sharing architecture review collaboration records across authenticated users in a workspace.

## What is included

- `src/features/architecture/systemDesignReviewRemoteStore.js`: an injected-client adapter with `list`, `load`, and `save` methods. It does not instantiate a Supabase client or embed keys.
- `supabase/migrations/202610230001_architecture_review_collaboration.sql`: workspace membership and collaboration tables, RLS policies, scoped read/write permissions, and an update trigger.
- Tests for validation, workspace scoping, upsert behavior, row mapping, and remote error handling.

## Deployment requirements

1. Enable Supabase Auth and apply the migration to the intended project.
2. Provision workspace membership rows through a trusted server/admin path. Do not expose unrestricted client-side role assignment.
3. Initialize the Supabase client through the host application's existing authenticated session and inject it into `createSystemDesignReviewRemoteStore(client)`.
4. Connect the review UI to the remote adapter in a follow-on integration step. Until then, the existing review panel continues to use browser-local storage.
5. Test RLS with at least two users in the same workspace, a user in a different workspace, and a read-only viewer.

## Security model

- The browser receives no service-role key.
- RLS gates records by workspace membership; writes require owner/editor/reviewer membership.
- Viewer members can read but cannot write collaboration payloads.
- Membership rows are readable by members but have no client insert/update/delete grant in this migration. Trusted administrative code must provision membership.
- The payload is bounded to 1 MB in the client adapter. Database payload size and rate limits should also be enforced at the API layer if exposed publicly.

## Current limitations

This phase adds the remote storage contract and database policy foundation, not a fully enabled live-sync experience. The review panel is not yet wired to the adapter, and real cross-browser synchronization requires host-auth wiring, membership provisioning, conflict handling, and integration tests against a configured Supabase project. The adapter's `save` uses upsert; last successful write wins, so concurrent editing needs revision/optimistic concurrency controls before production use.
