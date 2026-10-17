# Kubernetes Catalog Contract

The Kubernetes icon catalog is a local, searchable asset collection integrated with the existing Icon Library and intelligent Kubernetes resource insertion path.

## Stable metadata
- Catalog ID: `kubernetes-architecture`
- Source: `kubernetes`
- Icon IDs use the `k8s:<resource-slug>` namespace.
- SVG paths are local paths under `/kubernetes-icons/`.
- Every entry has a category, name, description, and search aliases.

## Compatibility rules
- Do not change stable IDs casually: favorites, recent icons, and persisted element metadata may reference them.
- Keep catalog search and category filtering wired through `useIconCatalog`.
- Keep insertion routed through the existing `iconInsertionService` and Kubernetes resource service.
- Add new resource types with their SVG asset, metadata, aliases, and tests together.
- Keep Kubernetes validation and graph semantics in their existing services; this catalog layer must not duplicate them.
