# Phase 5E — Kubernetes Resource Property Validation

## Scope

Added definition-driven property validation for known Kubernetes resources and namespace dependency diagnostics. Unknown/legacy resource definitions are intentionally not rejected based on assumptions. AWS and Networking resources remain outside these rules.

## Behavior

- Validates known Kubernetes resource names using lowercase DNS-style labels; Namespace names are limited to 63 characters.
- Validates numeric properties as non-negative integers.
- Validates select values against each catalog definition's supported options.
- Validates cluster versions using `major.minor` syntax and recommends checking target-environment support.
- Flags non-default namespaces with no matching Namespace resource and flags missing directed `contains` relationships when the Namespace exists.
- Does not mutate documents or automatically repair invalid properties.

New built-in defaults use lowercase names so newly inserted resources satisfy the same validation contract. The implicit `default` namespace remains valid without an explicit Namespace resource.

## Verification

Run `node --import ./tests/register-sync-test-loader.mjs --test tests/kubernetes-resource-validation.test.js tests/kubernetes-architecture-completeness.test.js tests/kubernetes-relationships.test.js`. Full-suite and production-build verification must be completed separately before release.
