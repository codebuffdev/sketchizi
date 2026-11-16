# Sketchizi 1.11.9 — Kubernetes Validation Actions

## Highlights

- Validation findings can offer buttons to apply a semantically compatible Kubernetes relationship type.
- Every correction requires explicit confirmation and is hidden when the current session is read-only.
- Corrections re-check live endpoint identities, resource types, relationship type, and the suggested choice before applying.
- Duplicate relationship IDs, missing endpoints, stale diagnostics, and incompatible types are rejected without changing the scene.
- A successful correction changes only the relationship type and preserves stable relationship ID, endpoint IDs, and other connector metadata.
- Unknown Kubernetes relationship types now show compatible alternatives and avoid a duplicate semantic-fix finding.
- Fixed provider-aware selection of relationship diagnostics in the validation panel.
- AWS, Networking, collaboration, and normal canvas synchronization paths remain provider-scoped and unchanged by the correction helper.

## Verification

- Focused regression set: 76/76 tests passed across Kubernetes corrections, validation, shared graph, relationships, catalog, design framework, architecture catalog, and Networking.
- JavaScript syntax checks passed for the new correction service and architecture rules.
- ZIP integrity verified.
- A production build was attempted but could not start because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent in the extracted source environment. Run `npm ci` before building or starting Sketchizi. Browser-level verification was not performed.

## Suggested commit message

`feat(kubernetes): add confirmed validation fixes`
