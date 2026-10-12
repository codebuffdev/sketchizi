# Sketchizi 1.10.56 — Collaboration File Serialization Fix

## Root-cause correction

The collaboration file normalizer previously returned a file object unchanged whenever `file.id` looked valid in JavaScript. If that property was supplied by a getter or was non-enumerable, `JSON.stringify` omitted it. Initial keyed snapshots could sometimes recover an ID from the registry key, but incremental collaboration updates send files as an array and lose that key, causing the server to reject the update with `file ID is missing or invalid`.

## Changes

- Always materialize collaboration file records as plain objects with an explicit, enumerable `id`.
- Explicitly preserve core file payload fields (`mimeType` and `dataURL`) and available metadata.
- Normalize files again immediately before constructing the incremental update array.
- Recover missing/malformed IDs from a valid registry key; keep valid mismatches visible to validation.
- Omit only records for which neither the record nor its registry key contains a usable ID.
- Add regression tests covering non-enumerable and inherited ID getters through JSON serialization and server validation.
