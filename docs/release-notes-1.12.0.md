# Sketchizi 1.12.0 — Kubernetes Resource Validation

## Added

- Resource-level Kubernetes property diagnostics for names, namespace values, selector options, replica counts, and cluster version strings.
- Missing explicit Namespace-resource dependency and missing `contains` relationship diagnostics for non-default namespaces.
- Actionable remediation text keyed to the affected resource and property.
- Safe behavior for older/custom Kubernetes definitions that are not present in the current resource-definition catalog.
- Regression tests and `npm run test:kubernetes-resource-validation`.

## Changed

- Newly inserted Kubernetes resource defaults use lowercase Kubernetes-style names.
- Validation remains diagnostic-only; it does not mutate resource properties or graph relationships.

## Compatibility

- AWS and Networking property validation remains unchanged.
- Existing graph identities and relationship metadata remain unchanged.
