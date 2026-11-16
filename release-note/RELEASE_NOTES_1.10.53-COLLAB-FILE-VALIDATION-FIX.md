# Sketchizi 1.10.53 — Collaboration File Validation Fix

## Collaboration creation and file sync

- Raised `MAX_FILE_DATA_URL` from 6 MiB to 7 MiB + 64 KiB, remaining below the existing 8 MiB collaboration message cap to allow JSON envelope overhead. This resolves the disagreement where the browser could send a file the server rejected.
- Added machine-readable file validation reason codes for malformed records, invalid IDs/MIME types/data, oversized image data, and file-key/ID mismatches. User-facing errors now explain the failure rather than showing only `Invalid collaboration file.`
- Expanded structured rejection logs with a hashed file reference, file index, incoming file/element counts, error code, and rejection reason. No file contents, data URLs, host token, or secrets are logged.
- New rooms are now inserted into the active room map only after the initial snapshot passes validation. A failed initial scene can no longer leave behind an empty, unhosted room.
- Added regression tests for a 7 MiB image, oversized-file errors, file ID mismatch diagnostics, and initial room validation order.

## Deployment

Deploy the updated Node collaboration service and frontend together. If a validation error persists, inspect Render logs for `Collaboration initial snapshot rejected` or `Collaboration scene update rejected`; use `rejectionReason`, `errorCode`, and `invalidFileIndex` to determine which file check failed.
