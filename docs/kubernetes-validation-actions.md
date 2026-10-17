# Kubernetes Validation Actions

## User-confirmed relationship corrections

The architecture validation panel exposes **Use {type}** actions only for Kubernetes relationship findings when both endpoint resource types are known and compatible alternatives can be computed. Corrections are hidden in read-only sessions.

Before changing the scene, Sketchizi asks the user to confirm the selected relationship type. The correction helper then checks the current canvas again: the original relationship must still exist, both endpoints must still exist, the selected type must have been suggested for the finding, the selected type must remain semantically compatible, and the relationship must still be invalid. Stale findings and incompatible choices are rejected.

A successful correction updates only `relationshipType`. The Kubernetes relationship ID, source and target resource IDs, connector element ID, other connector metadata, and endpoint resources are preserved. The change is applied through Excalidraw's immediate scene update path, so normal scene persistence and collaboration hooks can observe it.

The selection logic uses the metadata key's provider namespace rather than expecting the relationship metadata object itself to contain a `provider` field. AWS and Networking relationship selection and validation behavior remain provider-scoped and otherwise unchanged.
