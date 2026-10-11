# Sketchizi 1.10.54 — Collaboration File ID Normalization and Diagnostics

## Fix

- Normalize collaboration file records from Excalidraw's ID-keyed binary-file registry before sending a host snapshot or scene update. When a record has no non-empty `id`, its trusted registry key supplies the missing ID.
- Preserve a non-empty record ID even when it differs from its registry key, so the server continues to reject real key/record mismatches instead of silently rewriting them.
- Keep normalized file records consistent across initial snapshots, synchronization baselines, local updates, and signature comparison.

## Diagnostics

- Promote rejected collaboration initial snapshots and scene updates to error-level structured Render logs.
- Include validation reason, file index, hashed file reference, whether the registry key and record ID are present, ID type/length, and whether the values match. No raw file ID, image data, host token, or secret is logged.
- Diagnostic fields are included in the regular service logger and do not depend on `SKETCHIZI_SYNC_DIAGNOSTICS=1`.

## Tests

- Cover missing-ID normalization for join snapshots and incremental updates.
- Verify mismatched non-empty IDs are preserved for server rejection.
- Verify validation logs can differentiate a missing record ID without emitting raw identifiers.
