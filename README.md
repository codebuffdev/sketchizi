# Sketchizi

**Sketchizi** is a browser-based diagram and visual thinking tool built with React, Vite, and Excalidraw.

Create diagrams, flowcharts, system designs, architecture diagrams, and visual notes directly in your browser.

## Features

* 🎨 Excalidraw-powered drawing canvas
* 🧩 Large **Eraser icon library**
* 🔎 Icon search and Favorites
* 🕘 Recently Used icons
* 📦 Make Eraser icons available offline
* 💾 Local persistent canvas storage
* 📁 Recent Files for quickly reopening saved drawings
* 📄 Native `.sketchizi` files plus `.excalidraw` compatibility
* 🌓 Light / Dark / System theme
* 🗺️ Minimap
* ⌨️ Keyboard shortcuts
* 📱 Tablet and touch support
* 🧹 Clear canvas confirmation
* 💽 Emergency local backup when persistent storage fails
* 📱 PWA support

## Tech Stack

* **React**
* **Vite**
* **Excalidraw**
* **JavaScript**
* **CSS**
* **IndexedDB**
* **LocalStorage**
* **Service Worker / PWA**

## Getting Started

### Requirements

* Node.js
* npm

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Open the local development URL shown by Vite.

### Production Build

```bash
npm run build
```

### Full Local Release Check

On Windows, macOS, or Linux, run the same release-gate stages used by GitHub Actions:

```bash
npm run verify:workbench-release
```

The runner records each command's output in `artifacts/ci-logs/` and writes JSON and Markdown summaries under `artifacts/`. It stops after the first blocking failure; the npm registry connectivity probe is diagnostic and does not replace `npm ci`. The full check needs registry access and may download Playwright/Chromium. A failed or skipped stage is never reported as passed.

The release gate also applies the generated PostgreSQL DDL twice and checks the resulting schema, table, constraints, index, column types, and nullability. This stage mutates the target by creating a schema, table, constraint, and index, so it is fail-closed by default. For a local run, point `WORKBENCH_POSTGRES_URL` to a **disposable test database** where the current user can create a schema, and explicitly opt in with `WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION=true`. The default is `postgresql://workbench:workbench@127.0.0.1:5432/workbench`. Non-loopback hosts additionally require `WORKBENCH_POSTGRES_ALLOW_REMOTE=true`; protected database names such as `prod`, `production`, and `live` are rejected. These guardrails are not a substitute for using a disposable test database. Never point this verification stage at production. GitHub Actions sets the opt-in only for its own temporary PostgreSQL 17 service.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```text
sketchizi/
├── public/
├── functions/api/
│   ├── eraser-catalog.js
│   └── eraser-icon.js
├── server/
│   └── collaboration-server.mjs
├── src/
│   ├── components/app/
│   │   ├── SketchiziCanvas.jsx
│   │   ├── CollaborationUI.jsx
│   │   └── MoreTools.jsx
│   ├── features/
│   │   ├── canvas/
│   │   │   ├── useExcalidrawScene.js
│   │   │   ├── useMinimapController.js
│   │   │   └── useCanvasTools.js
│   │   ├── collaboration/
│   │   │   └── useCollaboration.js
│   │   ├── files/
│   │   │   ├── useFileManager.js
│   │   │   └── useRecentFiles.js
│   │   ├── icon-library/
│   │   │   ├── useIconCatalog.js
│   │   │   ├── useIconInsertion.js
│   │   │   └── iconInsertionService.js
│   │   ├── navigation/
│   │   │   ├── useMoreTools.js
│   │   │   ├── useNativeSketchiziMenu.js
│   │   │   ├── usePanelState.js
│   │   │   └── useSketchiziPreferences.js
│   │   └── persistence/
│   │       └── useSketchPersistence.js
│   ├── App.jsx
│   ├── IconLibraryPanel.jsx
│   ├── PropertiesPanel.jsx
│   ├── Minimap.jsx
│   ├── ShortcutHelp.jsx
│   ├── persistence.js
│   ├── fileSystem.js
│   └── styles/
│       ├── base.css
│       ├── library.css
│       ├── properties.css
│       ├── icon-library.css
│       ├── minimap.css
│       ├── theme.css
│       ├── eraser.css
│       ├── shell.css
│       └── responsive*.css
├── index.html
├── package.json
└── README.md
```

### Architecture boundaries

The 1.9.0 structure keeps Excalidraw integration, collaboration, persistence, filesystem operations, icon-catalog behavior, and UI rendering behind feature-oriented boundaries. `App.jsx` is now composition/state wiring rather than the implementation home for those systems. Collaboration protocol behavior and the existing realtime synchronization path remain in their existing collaboration module/server; the refactor only changes ownership and module boundaries.


## Local Storage

Sketchizi keeps drawing data locally in the browser.

The main canvas uses **IndexedDB** for persistent storage, with an emergency LocalStorage backup mechanism for storage failures.

Recent drawings are stored separately so that clearing the current canvas does **not** remove your saved recent drawings.

## Eraser Icon Library

Sketchizi integrates the public Eraser icon catalog.

Icons can be:

* searched
* dragged onto the canvas
* favorited
* reused from Recently Used
* cached locally for offline use

The offline library uses browser caching so previously synchronized icons remain available without an internet connection.

## File Format

Sketchizi supports the standard:

```text
.excalidraw
```

format.

Drawings can therefore be exported and reopened using Excalidraw-compatible tools.

## Keyboard Shortcuts

| Shortcut    | Action                  |
| ----------- | ----------------------- |
| `/`         | Focus icon search       |
| `L`         | Toggle Library          |
| `P`         | Open Properties         |
| `D`         | Toggle Dark / Light Theme |
| `Shift + G` | Toggle grid             |
| `M`         | Toggle Minimap          |
| `F`         | Toggle fullscreen       |
| `Esc`       | Close active panel      |
| `?`         | Show keyboard shortcuts |

Some shortcuts depend on the corresponding feature being enabled.

## Logging

Sketchizi uses a centralized browser logger under `src/logging/`. Application code should use `logger.debug()`, `logger.info()`, `logger.warn()`, and `logger.error()` rather than calling browser console methods directly. Development defaults to readable DevTools output for all levels; production defaults to `warn` and does not use the browser console as its production sink.

Set `VITE_LOG_LEVEL` to `debug`, `info`, `warn`, or `error` when a different threshold is required. Any `VITE_*` value is client-visible, so it must never contain a private secret.

Production error reporting is isolated behind `src/logging/errorReporter.js`. No vendor or custom ingestion endpoint is hard-coded. A future Sentry, Cloudflare Worker, or other provider can be configured behind that boundary without changing application call sites.

The logger sanitizes structured context, excludes sensitive keys and large/private document fields, and keeps collaboration/file logging low-volume. Browser logs and collaboration-server logs are separate; the server uses `server/logger.mjs`.

## Privacy

Sketchizi is designed around local-first browser storage.

Drawings and recent files are stored locally in the browser rather than requiring a Sketchizi account.

External resources, such as the Eraser icon catalog, may require an internet connection when icons have not yet been cached locally.

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/codebuffdev/sketchizi.git
cd sketchizi
npm install
npm run dev
```


**Sketchizi — Draw • Connect • Visualize**


## Mind Map Library

Sketchizi 1.4.0 adds a an editable Mind Maps section with Central Topic, Main Topic, Subtopic, Floating Topic, Summary, Boundary, Relationship, Branch, and Callout elements. All use the same Library drag-to-canvas interaction. The section also provides a Create starter mind map action that inserts a central topic with six connected branches.


## Real-time collaboration
## Collaboration session lifecycle

Collaboration sessions distinguish the room creator (host) from participants (joinees). The host sees **Disconnect**; a joinee sees **Leave**.

- **Disconnect** terminates the room, notifies connected participants, closes their collaboration connections, and makes the old collaboration URL unavailable. The local canvas is preserved and no automatic save is performed.
- **Leave** removes only the current joinee. The host and other participants remain connected and the room continues.
- If the host's WebSocket closes unexpectedly, the server terminates the room and notifies the remaining participants.
- A terminated room ID cannot be recreated while the collaboration server remains running.


Sketchizi collaboration is event-driven and uses a persistent WebSocket connection. The browser remains local-first: Excalidraw updates the local canvas immediately, while changed elements and binary file data are sent to a room server.

### Local development

Run the frontend:

```bash
npm run dev
```

In a second terminal run:

```bash
npm run collaboration-server
```

Vite proxies `/collaboration` WebSocket traffic to `ws://localhost:8787/collaboration`.

To collaborate:

1. Open Sketchizi in Browser A.
2. Click **Collaborate**.
3. Copy the generated room link.
4. Open the link in Browser B.
5. Click **Join**.
6. Edit the drawing in either browser.

Rooms are held in server memory for the lifetime of the connected clients. They are intentionally ephemeral in this first collaboration version.

### Eraser icon catalog

The application uses the existing Cloudflare Pages Functions at `/api/eraser-catalog` and `/api/eraser-icon`. Those functions read the public Eraser catalog/assets and remain the production runtime path.

The Vite development server now mounts the same functions locally, so `npm run dev` no longer produces a 404 for the Eraser catalog. `npm run sync:eraser` remains the existing project utility for downloading a local Eraser icon catalog/assets; it is not required just to load the catalog in the application.

### Narrow responsive layout

Version 1.8.6 keeps the 1.8.5 responsive shell intact. At compact tablet widths the collaboration status uses a bounded center lane; at 761–900px it moves to a dedicated top status lane. When collaboration is active, Sketchizi Library and Properties surfaces begin below that status lane so they do not cover lifecycle controls. Excalidraw’s native toolbar is left under Excalidraw’s own responsive layout.

## Collaboration capacity

The current collaboration server enforces **no explicit per-room participant limit**. A room's participants are tracked in an in-memory `Set` (`room.clients`), and each connected client is included in presence broadcasts. The server does enforce message/scene/file limits (`MAX_MESSAGE_BYTES`, `MAX_ELEMENTS`, `MAX_FILES`, and `MAX_FILE_DATA_URL`), but none of those is a participant-count limit. The per-file data-URL allowance is kept below the 8 MiB WebSocket message ceiling with room for JSON overhead; an oversized or malformed file is rejected with a specific reason in the collaboration status and server logs.

The practical ceiling is therefore determined by the resources and deployment constraints of the single collaboration-server process: memory, CPU, network bandwidth, WebSocket connection capacity, and the frequency/size of scene updates. No Cloudflare-specific or hosting-provider per-room participant limit is configured in this repository.

### Production

Run the collaboration server separately and set:

```text
VITE_COLLAB_WS_URL=wss://your-host.example/collaboration
```

The WebSocket endpoint should be served over `wss://` when Sketchizi itself is served over HTTPS. In a deployed build, `VITE_COLLAB_WS_URL` is required; without it, Sketchizi must not silently try the static Pages origin as though it were the collaboration server. Configure this variable in the Cloudflare Pages project for the intended environment and trigger a new build/deployment. The value must include the exact `/collaboration` path. Confirm the Node collaboration service is healthy at its `/health` endpoint before testing from the UI.

### Collaboration protocol

The client sends:

- `join` with the current local snapshot
- `update` with only changed Excalidraw elements and changed binary files

The server keeps a room-level element map and merges updates by Excalidraw `version`, using `versionNonce` as a deterministic tie-breaker for concurrent writes to the same element. Deleted elements remain as Excalidraw tombstones so deletions propagate correctly.

A joining client receives the current room scene. Remote updates are merged into the local scene rather than blindly replacing the entire scene for every incremental event.

The server validates room IDs, message sizes, element identifiers/version fields, and binary file payload sizes. It does not expose filesystem access or execute client-provided code.

### Images

Image elements and their `BinaryFileData` are included in the collaboration snapshot/update protocol. This first version keeps those file payloads in the room server's memory and forwards them to connected participants. Large files are rejected by the server's payload limits.

## Responsive layout (1.9.0)

Sketchizi's stylesheet retains responsive layout rules for desktop (`>=1200px`), tablet/compact desktop (`761–1199px`), and narrow viewports. Phone devices are blocked at the application entry point before the drawing workspace, sign-in controls, or collaboration UI are mounted. Tablets and desktop browsers remain supported; a desktop browser is not blocked merely because its window is narrow.

The phone gate uses phone-specific user-agent signals, mobile UA Client Hints, and physical screen dimensions rather than the current viewport width alone. This allows tablets (including iPadOS desktop-site mode) while blocking recognized smartphone browsers. The dedicated gate explains that Sketchizi requires a tablet or desktop computer.

The application shell uses containing `100%` dimensions with document-level overflow disabled to avoid accidental browser horizontal/vertical scrolling. Panels are viewport-bounded and scroll internally.

## Google Sign-In foundation (Phase 1)

The optional Google Sign-In foundation and Spring Boot authentication service are documented in [`docs/GOOGLE_AUTH_SETUP.md`](docs/GOOGLE_AUTH_SETUP.md). Authentication is optional; diagramming and collaboration remain available without signing in. The current implementation does not include AI Ask, Spring AI, Gemini, or AI usage limits. See [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) for the verification status and remaining manual integration checks.



## Engineering Workbench (experimental)

The Engineering Workbench is an experimental layer over the Excalidraw canvas. It stores typed components and relationships in the `.sketchizi` Workbench extension while ordinary shapes and `.excalidraw` diagrams remain supported.

The prototype includes System, APIs, Data, and Deployment views; semantic validation; synthetic request-path experiments; and the first artifact-generation workflow.

- **Create POC:** the React + REST + PostgreSQL template creates the three runtime components, their typed request/data relationships, a starter `GET /api/items` endpoint exposed by the REST service, and an `items` PostgreSQL table. API and table entities are contract/schema metadata, not additional simulated runtime nodes.
- **OpenAPI 3.1 JSON:** generate a reviewable API contract from endpoint components connected to exactly one REST service using `Exposes API`. The starter POC is preconfigured to generate its first OpenAPI preview without manually adding an endpoint.
- **PostgreSQL DDL:** generate SQL from table components connected to a PostgreSQL database using `Contains table`. The starter POC includes an `items` table with a primary key and example columns.
- **Existing POCs:** older documents created by the three-component template can use **POC WORKFLOW → Add starter API + table** to add the missing endpoint and table without recreating their existing diagram or runtime model.

Generation is a reviewable preview, not deployment. Invalid ownership, duplicate routes, malformed schema JSON, unsafe identifiers, or unsupported SQL types block the download. A preview becomes stale after a semantic model revision and must be regenerated. The current SQL slice supports one database target. It emits only explicitly modeled index DDL; it does not infer foreign keys, indexes from query patterns, migrations, deployment settings, or runtime behavior.

See [`docs/WORKBENCH_ARTIFACT_GENERATION_0.15_REPORT.md`](docs/WORKBENCH_ARTIFACT_GENERATION_0.15_REPORT.md) and [`docs/WORKBENCH_POC_ARTIFACT_STARTER_0.16.1_REPORT.md`](docs/WORKBENCH_POC_ARTIFACT_STARTER_0.16.1_REPORT.md). Focused checks can be run with `npm run test:workbench-poc` and `npm run test:workbench-artifacts`; the broader prototype test suite can be run with `node --import ./tests/register-sync-test-loader.mjs --test tests/*.test.js`.

### Collaboration creation troubleshooting

The Node collaboration service emits structured JSON logs for WebSocket upgrade requests, accepted connections, `join` messages, host authorization rejection reasons, room creation, join acknowledgement, and close codes/reasons. Search the Render collaboration-service logs for `Collaboration host authorization rejected` to distinguish missing configuration from a signature or room-claim mismatch. Never paste `COLLAB_HOST_TOKEN_SECRET` or any host token into logs or support messages. The same `COLLAB_HOST_TOKEN_SECRET` (at least 32 UTF-8 bytes) must be configured independently in both the Spring Boot auth service and Node collaboration service.


## Workbench controlled improvement experiments (0.22)

The Experiments panel now supports two separate one-variable hypotheses: increase a runtime component's concurrency when queue/capacity evidence supports it, or reduce a component's modeled mean service time when event-derived service-time evidence is available. Both trials rerun the same selected non-outage load scenario, compare actual aggregate and matched time-series outputs, save intervention metadata in experiment history, and leave the canonical model and base profile unchanged. These are synthetic what-if experiments, not claims that a real system will improve by the same amount.

Run the focused tests with `npm run test:service-time-improvement` and the broader simulation suite with `npm run test:simulation`.


## Workbench query / index hypothesis (0.24)

The PostgreSQL experiment panel now includes an evidence-gated synthetic index hypothesis. It requires read-operation evidence on a typed `Reads from` request path and an explicitly selected eligible table column. The experiment changes only the assumed fraction of reads benefiting from a hypothetical index; a fixed, displayed speedup factor is applied by the deterministic simulator. It does **not** parse SQL, run a PostgreSQL planner, infer which column a query uses, or model index write-maintenance overhead.

A trial displays proposed `CREATE INDEX` SQL but does not change the semantic schema automatically. The user can explicitly add the candidate to the table's modeled index list; this increments the model revision, invalidates old results/previews as appropriate, and allows the SQL generator to emit the new DDL. The SQL generator validates index identifiers, methods, names and column references.

See [`docs/WORKBENCH_QUERY_INDEX_HYPOTHESIS_0.24_REPORT.md`](docs/WORKBENCH_QUERY_INDEX_HYPOTHESIS_0.24_REPORT.md). Focused verification: `npm run test:database-index-improvement`; simulation verification: `npm run test:simulation`. Build and real-browser UI verification remain required before treating this as fully release-verified.
