# Kubernetes / Docker Compose Studio: YAML round-trip hardening

Pipeline (all pure modules, unit-tested in `tests/studio-roundtrip-*.test.js` and `tests/studio-yaml-error-handling.test.js`):

- Kubernetes: `kubernetesManifestModel.js` — `parseKubernetesManifests` → `planKubernetesCanvas` → `exportKubernetesFromCanvasState` / `exportKubernetesFromScene`
- Compose: `composeYamlModel.js` — `parseComposeYaml` → `buildComposeCanvasState` → `composeCanvasStateToYaml`
- Shared: `studio-validation/yamlErrors.js` (single-line, line/column-located YAML errors with a fix hint), `composeMountSource.js` (named-volume and host-port parsing)

## Defects found and fixed

| Area | Defect | Fix |
|---|---|---|
| Compose parse | `<<: *anchor` merge keys were kept as a literal `<<` key, producing false "missing image" errors and losing `depends_on`/`networks` | parse with `merge: true` |
| Compose validate | `ports: ["8000-8010:80"]`, `${PORT:-8080}:80`, IPv6 binds flagged as invalid | `parseHostPort` |
| Compose validate | `volumes:\n  data:` (null) flagged `COMPOSE_INVALID_RESOURCE` | null accepted |
| Compose validate | `C:\path:/x`, `~/x`, `${DIR}:/x` treated as undeclared named volumes; `extends` services reported as missing image | `namedVolumeSource`, `extends` check |
| Compose validate | `validateComposeDocument(null/undefined)` threw | read secrets/configs from the normalised document |
| Compose export | `- {}` / `- []` emitted as invalid YAML (`-\n{}`); `NaN`/`Infinity`/`undefined` mangled; keys such as `true`/`0123` unquoted | emitter fixes |
| Compose diagram | service declared with no body (`web:`), null `depends_on`/`networks`, `network_mode: host` threw or produced wrong networks | null-safe planner |
| Compose → K8s | non-list `ports` threw; one empty service aborted the whole conversion | warning + skip |
| K8s parse | null list entries (`containers:\n  -`), non-list `ports`/`rules`/`paths` crashed the validator and diagram | `sanitizeKubernetesManifest` (reported as warnings) |
| K8s relationships | Service selected pods in other namespaces; Ingress ignored legacy `serviceName` backends and crashed on null rules/paths; TLS secrets not linked | namespaced, null-safe derivation |
| K8s parse | `kind: List` (kubectl output) loaded as nothing; Compose file pasted into K8s Studio gave a generic error | List flattening; explicit "looks like Compose" error |
| Both | multi-line parser dumps, no line numbers, alias errors without guidance | `formatYamlError` and per-case messages |

## Known limits

- Kubernetes "Export" in the Studio still downloads the original text (lossless, keeps comments). Canvas-derived export (`exportKubernetesFromScene`) serialises manifests and does not retain comments.
- Resources from a `List` document cannot be edited through the single-resource inspector; the UI says so.
- Compose diagram elements on the canvas do not yet store their service definition; the canvas state model (`buildComposeCanvasState`) does, ready for a canvas → YAML action.
