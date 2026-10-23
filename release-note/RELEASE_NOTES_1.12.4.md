# Sketchizi 1.12.4

## Revalidation-aware deployment review

- Tracks review state against a fingerprint of each finding, not only its diagnostic ID.
- A changed finding is treated as a new, unreviewed version.
- Findings that disappear during revalidation are moved to a **Resolved since last review** history.
- Adds dismiss controls for resolved-history entries.
- Keeps the review workflow in-memory and non-mutating; no diagram data or validation output is changed.
- Adds regression coverage for stale review-state invalidation and resolved-history behavior.

Production build and browser-level verification remain outstanding.
