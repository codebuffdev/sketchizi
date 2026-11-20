# STUDIO-001 — Studio document integrity baseline

Status: audit only. Branch: `audit/studio-document-integrity`. No changes to production behavior.

## Scope and source inventory

- Docker Studio UI: `src/features/docker-compose/ui/DockerComposeStudio.jsx`. Uses `yaml` `parseDocument` and `stringify`; source handling and diagram generation are implemented in the UI.
- Compose document service: `src/features/docker-compose/composeDocumentService.js`. `createComposeDocument` copies only `name`, `services`, `volumes`, `networks`. `exportComposeYaml` additionally copies `secrets` and `configs` directly from its original input.
- Compose runner: `server/compose-runner.mjs`; exposes `validate`, `up`, `down`, `ps`, `logs`, `stats`. Deployment operations require a separate security assessment before expansion.
- Kubernetes Studio UI: `src/features/kubernetes-studio/ui/KubernetesStudio.jsx`. Uses `parseAllDocuments`, source-range replacement for inspector edits, and raw `yamlText` for export.
- Kubernetes validation: `src/features/kubernetes-studio/validation/validateKubernetesResources.js`.
- Existing tests: `tests/docker-compose-document.test.js`, `tests/docker-compose-studio-workflow.test.js`, `tests/kubernetes-studio-integrated-workflow.test.js`, and other Kubernetes validation and bundle tests.

## Confirmed static findings

| ID | Severity | Finding | Reproduction / evidence | Recommendation |
| --- | --- | --- | --- | --- |
| DOC-001 | High | Compose normalization omits top-level `secrets` and `configs` | `createComposeDocument` returns only four named keys; direct export separately reads original `input.secrets` and `input.configs` | Preserve recognized mappings in the canonical model; add end-to-end import/edit/export fixtures |
| DOC-002 | High | Compose extension fields and other top-level mappings are omitted from export | `exportComposeYaml` explicitly constructs a restricted `output` object | Preserve unknown keys or reject lossy operations with a visible warning |
| DOC-003 | Medium | Kubernetes inspector serializes the edited resource but preserves other document ranges | Inspector uses `stringify` on edited manifest and source-range replacement; existing tests cover untouched adjacent documents | Add fixtures for comments and formatting within the edited document; document acceptable formatting changes |
| DOC-004 | Medium | Kubernetes and Compose use different edit/export strategies | Kubernetes exports raw `yamlText`; Compose uses generated YAML | Define separate preservation contracts, shared revision/diagnostic UI semantics, and explicit save states |
| DOC-005 | Needs verification | Full bidirectional canvas/YAML synchronization is not established by static inspection | UI callbacks `onCreateDiagram` and `onApplyResourceYaml` exist, but no unified two-way revision contract is evidenced | Trace all canvas update paths and test both directions in browser |

## Test strategy

New `tests/studio-document-integrity-audit.test.js` records currently observed Compose behavior, including known limitations. These are **characterization tests**, not acceptance tests that declare the limitations acceptable.

Follow-up regression tests should be written to fail before implementing each fix:
1. Compose YAML import → edit → export preserves secrets, configs, extension fields, anchors and unedited fields.
2. Kubernetes multi-document import → inspector edit → export preserves unedited documents byte-for-byte, with documented behavior for edited-document comments.
3. Canvas ↔ YAML edits maintain resource identity and avoid stale overwrites.
4. Invalid YAML does not destroy the last valid draft; undo/redo and multi-file import remain consistent.
5. Validate no credentials or secret values are emitted in diagnostic logs.

## Verification

The GitHub connector was used to inspect source and create this branch. The runtime available for this audit could not clone GitHub (`Could not resolve host: github.com`), and the local Node environment does not have the project's `yaml` dependency installed. Therefore **no local project test or build result is claimed**. GitHub Actions should be used to establish CI results for the PR; results must be checked before approval.

Recommended checks:
```bash
npm ci
node --test tests/studio-document-integrity-audit.test.js
npm run test:docker-compose
npm run test:kubernetes-studio-workflow
npm run test:all
npm run build
```

## Exit criteria

- Baseline findings reviewed and prioritized.
- Audit tests committed, CI status inspected, and failures disclosed.
- Production source unchanged in STUDIO-001.
- DOC-001 and DOC-002 become scoped remediation tasks in Phase 1.
- Merge only after explicit owner approval.
