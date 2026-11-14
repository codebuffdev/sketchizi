# Studio integration checkpoint

This branch starts from STUDIO-002, retaining its Compose document preservation and YAML AST edits.

## Imported foundations
- STUDIO-003 normalized diagnostics helper
- STUDIO-004 Compose-to-Kubernetes converter
- STUDIO-005 dependency and network reachability helpers
- STUDIO-006 Kubernetes snapshot normalizer

## Not yet integrated
The Studio UI changes in STUDIO-003/004/005/006 have **not** been ported into this branch. They overlap in DockerComposeStudio.jsx and KubernetesStudio.jsx and require deliberate combination and regression testing. Relevant tests and docs from these branches also need to be ported.

STUDIO-001's historical tests assert that Compose extensions are dropped, which conflicts with the STUDIO-002 fix. Do not copy those historical assertions as passing regression tests.

## Merge gate
Do not merge this branch into main until all UI changes are integrated, CI passes at the final SHA, and explicit user approval is obtained.
