# Kubernetes shared architecture graph contract

Kubernetes intelligent resources participate in the provider-neutral architecture graph through `customData.kubernetesResource`. The stable identity is `kubernetesResourceId`; graph keys are provider-scoped (`kubernetes:<id>`) so an ID in another catalog cannot collide with it.

Connectors synchronized by `syncKubernetesRelationshipMetadata` carry `customData.kubernetesRelationship` with `relationshipId`, `sourceResourceId`, `targetResourceId`, and `relationshipType`. Graph analysis preserves these identities, diagnoses malformed metadata, and does not mutate Excalidraw scene elements. Unknown Kubernetes relationship types are retained for provider-specific semantic validation so the validator can supply actionable remediation; unsupported relationship types from AWS and Networking continue to be rejected at graph analysis.

The shared graph and provider validation composition must continue to include AWS and Networking resources and relationships. Run `npm run test:kubernetes-graph` to exercise these integration contracts.


## Relationship authoring guidance

`kubernetesRelationshipSemantics.js` is the shared source of truth for Kubernetes relationship types and supported source/target resource-type pairs. The Properties panel uses it to mark each relationship type as compatible or incompatible for the selected connector and to show compatible alternatives. The validator consumes the same predicate, preventing the authoring guidance and semantic validation rules from drifting apart. `connects-to` remains available as a general connection for every Kubernetes resource pair.

Run `npm run test:kubernetes-relationships` to verify supported pairs, guidance, missing-endpoint behavior, and metadata-sync idempotence.

## Validation remediation contract

Kubernetes semantic validation diagnostics may include `remediation` text and a `suggestedRelationshipTypes` array. For unsupported relationship types, suggestions contain the supported type vocabulary; for incompatible endpoint pairs, suggestions are derived from `getCompatibleKubernetesRelationshipTypes` so they match the authoring UI. Orphan-resource findings explain the action needed to connect or remove the resource. The validation panel renders these fields with wrapping that works in light and dark themes.

Run `npm run test:kubernetes-validation` alongside the Kubernetes graph and relationship test commands when changing this contract.

