# Sketchizi 1.12.1 — Kubernetes Architecture Completeness

## Added
- Optional Kubernetes diagram completeness recommendations for cluster context, Cluster-to-Namespace containment, controller-to-Pod scheduling, Service-to-Pod exposure, and Pod-to-Node placement.
- `recommendedResourceTypes` metadata on completeness diagnostics to support future UI recommendation affordances.
- Regression coverage proving completeness analysis is read-only and does not apply to AWS or Networking resources, including multi-cluster diagrams.
- `npm run test:kubernetes-completeness` and `docs/kubernetes-architecture-completeness-contract.md`.

## Compatibility and behavior
- Findings are informational or warnings rather than hard Kubernetes API conformance errors when diagram scope may intentionally omit runtime details.
- Validation does not add, remove, or rewrite resources or relationships.
- A Namespace connected to any represented Cluster is treated as represented correctly; it is not required to connect to every Cluster.
- No change to AWS or Networking validation semantics is intended.

## Verification
- New Kubernetes completeness suite: 9/9 tests passed.
- Combined targeted regression suite (Kubernetes catalog/graph/relationships/validation, design framework, architecture catalog, and Networking): 95/95 tests passed.
- JavaScript syntax checks and package version alignment passed.
- ZIP integrity checked after packaging.
- Production build was attempted but stopped in the prebuild step because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent from the source environment. Run `npm ci` before building; browser-level verification remains outstanding.
