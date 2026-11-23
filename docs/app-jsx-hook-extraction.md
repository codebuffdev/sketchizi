# App.jsx hook extraction: Tab & Workspace Lifecycle and Document Persistence

`src/App.jsx` was split by *moving* code, not rewriting it. The statements were relocated verbatim
into `src/hooks/`, in their original relative order; only the plumbing (parameters in, values out,
imports) was added. No JSX, DOM class or `data-testid` was touched.

## Domain map (measured on the pre-refactor App.jsx, 3,466 lines)

| Domain | Statements | Lines | useState | useEffect | useCallback | useMemo | useRef | Status |
|---|---|---|---|---|---|---|---|---|
| Tab & Workspace Lifecycle | 58 | 820 | 8 | 10 | 30 | 0 | 8 | **extracted** |
| Document Persistence & Recovery | 34 | 404 | 5 | 3 | 4 | 0 | 14 | **extracted** |
| Studio Launch & Modal Orchestration | 11 | 932 | 5 | 1 | 5 | 0 | 0 | stays in App |
| Collaboration Session State | 4 | 12 | 0 | 0 | 1 | 0 | 0 | stays in App (thin wrapper over `useCollaboration`) |
| Everything else (canvas, panels, prefs, theme, commands, JSX) | 109 | 1,076 | 15 | 13 | 19 | 0 | 10 | stays in App |

`App.jsx` has no `useMemo` calls. Studio orchestration is dominated by three large builders
(`applyKubernetesResourceYaml`, `createKubernetesDiagram`, `createComposeDiagram`, about 800 lines)
that are pure canvas generation rather than hook state; they are the natural next extraction.

## New hooks

| File | Hook | Role |
|---|---|---|
| `src/hooks/useWorkspaceTabState.js` | `useWorkspaceTabState()` | Phase 1 – tab list, active ids, closed-tab ("local drafts") list, close prompt, and their refs. No inputs. |
| `src/hooks/useDocumentPersistence.js` | `useDocumentPersistence(deps)` | Local autosave (`useSketchPersistence`), cloud save queue, revision/fingerprint/conflict state, cloud load + page-hide flush, chapter navigation, `saveDrawingToCloud`, `queueSketchSave`, `saveCloudDiagramNow`, `navigateToChapter`. |
| `src/hooks/useWorkspaceTabs.js` | `useWorkspaceTabs(deps)` | Phase 2 – snapshot capture/apply, switch/select/create/reorder/close tabs, closed-tab archive/reopen, first-load restore, pagehide flush, dirty sync, cloud-workspace navigation. |

### Why the tab domain is two hooks

The dependency graph is not a straight line. Persistence needs the tab *state* (`commitCanvasTabs`,
`canvasTabsRef`, `setCanvasTabs`) early, while the tab *operations* need persistence and
`useFileManager` results (which themselves consume persistence). A single tab hook would force
late-bound closures. Call order in `App` is therefore:

`useWorkspaceTabState` → `useDocumentPersistence` → `useCollaboration` → `useFileManager` → `useWorkspaceTabs`

Every dependency flows forward as an ordinary argument, and every callback keeps the same
dependency array text it had before.

### The one bridge

`useDocumentPersistence` reads `currentFileRef` and `getCurrentFileSceneSignature`, which come from
`useFileManager`, which is called *after* it. They are exposed through `fileManagerBridgeRef`
(assigned by `App` immediately after `useFileManager`). Both values are referentially stable
(a `useRef`, and a `useCallback` with `[]`), and the only consumer (`saveDrawingToCloud`) already
had a dependency array of `[showToast]`, so behaviour is identical to the old late-bound closure.

## Behaviour-preservation evidence

* **Statement-order diff.** The new `App` plus its hooks, flattened back into one statement list,
  was diffed against the old `App`. 216 statements match in order and text. The only differences
  are the bridge ref declaration/assignment and one effect reorder (below).
* **Known reorder.** The native-menu "close when a modal opens" effect previously ran *before* the
  cloud detach/load/flush effects and now runs *after* them. They share no state, so the order is
  not observable.
* **Render-phase test.** `tests/workspace-hooks-render.test.js` renders all three hooks together,
  wired as `App` wires them, in a real React render (Excalidraw and the logger stubbed). Effects do
  not run under server rendering, so effect bodies are covered by the existing source-contract tests.
* **Source-contract tests.** 11 existing test files regex over `App.jsx`. They now read
  `tests/helpers/app-source.js`, which returns `App.jsx` plus `src/hooks/*.js`. No assertion text
  was changed.

## Bugs found while auditing (fixed)

* `App.jsx` called `logger.warn(...)` in several catch paths without importing `logger`
  (a latent `ReferenceError` whenever those failure paths ran). The import now lives with the code that uses it.
* A regression from the earlier Studio hardening: `applyKubernetesResourceYaml` referenced
  `hosts`/`dataKeys` that were never defined, so applying an edited Ingress or ConfigMap from the
  resource inspector would throw. It now derives them from `describeKubernetesResource`.

## Adding to a hook

Keep new tab state in `useWorkspaceTabState`, new tab operations in `useWorkspaceTabs`, and new
save/cloud logic in `useDocumentPersistence`. If a hook needs something declared later in `App`,
prefer reordering call sites; use a bridge ref only for stable values.
