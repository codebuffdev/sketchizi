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
* 📄 Native `.excalidraw` file support
* 🌓 Light / Dark / System theme
* 📐 Layout controls
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
│   │   │   └── useMinimapController.js
│   │   ├── collaboration/
│   │   │   └── useCollaboration.js
│   │   ├── files/
│   │   │   ├── useFileManager.js
│   │   │   └── useRecentFiles.js
│   │   ├── icon-library/
│   │   │   ├── useIconCatalog.js
│   │   │   ├── useIconInsertion.js
│   │   │   └── iconInsertionService.js
│   │   ├── layout/
│   │   │   └── useCanvasTools.js
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
│   ├── LayoutToolbar.jsx
│   ├── Minimap.jsx
│   ├── ShortcutHelp.jsx
│   ├── persistence.js
│   ├── fileSystem.js
│   └── styles/
│       ├── base.css
│       ├── library.css
│       ├── layout.css
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
| `D`         | Toggle Layout           |
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

Version 1.8.6 keeps the 1.8.5 responsive shell intact. At compact tablet widths the collaboration status uses a bounded center lane; at 761–900px it moves to a dedicated top status lane. When collaboration is active, Sketchizi Library, Properties, and Layout surfaces begin below that status lane so they do not cover lifecycle controls. Excalidraw’s native toolbar is left under Excalidraw’s own responsive layout.

## Collaboration capacity

The current collaboration server enforces **no explicit per-room participant limit**. A room's participants are tracked in an in-memory `Set` (`room.clients`), and each connected client is included in presence broadcasts. The server does enforce message/scene/file limits (`MAX_MESSAGE_BYTES`, `MAX_ELEMENTS`, `MAX_FILES`, and `MAX_FILE_DATA_URL`), but none of those is a participant-count limit.

The practical ceiling is therefore determined by the resources and deployment constraints of the single collaboration-server process: memory, CPU, network bandwidth, WebSocket connection capacity, and the frequency/size of scene updates. No Cloudflare-specific or hosting-provider per-room participant limit is configured in this repository.

### Production

Run the collaboration server separately and set:

```text
VITE_COLLAB_WS_URL=wss://your-host.example/collaboration
```

The WebSocket endpoint should be served over `wss://` when Sketchizi itself is served over HTTPS.

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

Sketchizi uses four responsive layout modes: desktop (`>=1200px`), tablet/compact desktop (`761–1199px`), mobile (`521–760px`), and narrow mobile (`<=520px`). The canvas remains full-viewport; Sketchizi-owned controls are placed into deliberate lanes while Excalidraw keeps ownership of its native toolbar/footer.

On mobile, Excalidraw's native toolbar occupies the bottom interaction lane, so the collaboration status is moved to a dedicated top status lane rather than competing with the native footer. The minimap toggle/panel likewise reserves the native mobile bottom-toolbar lane. Collaboration actions remain available and stack at narrow widths.

The application shell uses containing `100%` dimensions with document-level overflow disabled to avoid accidental browser horizontal/vertical scrolling. Panels are viewport-bounded and scroll internally.
