# Phase 23 — Review Conflict Resolution

## Purpose

Give reviewers an explicit decision point when local collaboration data differs from the latest shared copy. The interface never silently overwrites local edits.

## Behavior

- Loading a shared copy stages it for comparison rather than immediately replacing local data.
- A stale optimistic save fetches the latest remote copy and opens the same comparison flow.
- The summary shows reviewer conflicts, local-only and remote-only reviewer records, local-only and remote-only comments, conflicting comments, and owner mismatch.
- **Keep local copy** retains browser data and records the observed remote timestamp as the base for the next explicit save.
- **Use remote copy** replaces local collaboration data with the staged remote copy.
- **Merge non-conflicting changes** unions reviewer and comment IDs. Local values win when the same reviewer ID has conflicting edits; local owner wins when both owners differ. Comments are deduplicated by ID and ordered by timestamp.
- Resolution changes only the local copy. Saving to the remote store remains an explicit action.

## Limitations

This is a conservative manual merge, not a CRDT or field-by-field conflict editor. Same-ID comment conflicts retain local data during merge. Reviewers should inspect the merged result and explicitly save it. Authorization continues to be enforced by Supabase RLS.
