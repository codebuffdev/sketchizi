# Sketchizi 1.10.55 — Collaboration Invalid File ID Fix

## Root cause addressed

The previous client normalization only replaced `undefined`, `null`, and empty-string file IDs. It did not normalize IDs that were present but invalid, such as non-string values, whitespace-only values, or strings longer than the server's 128-character limit. Those records still triggered `file-id-invalid`.

## Changes

- Normalize missing or malformed IDs from valid Excalidraw file-registry keys in the client.
- Apply the same normalization defensively on the server for keyed initial snapshots and object-form updates.
- Preserve valid but mismatched IDs so genuine registry-key/record-ID corruption remains a hard validation error.
- Add regression tests for missing, null, empty, numeric, whitespace-only, and oversized IDs, plus preservation of valid mismatches.

## Deployment and verification

Deploy the same source version to Cloudflare Pages and the Render collaboration service. This release is intended to prevent malformed local records from causing the reported file-ID error. Check Render logs after reproducing; if the error continues, capture the post-click `Collaboration initial snapshot rejected` or `Collaboration scene update rejected` event along with its `rejectionReason` and `errorMessage` fields. Do not rely on the startup logs alone.
