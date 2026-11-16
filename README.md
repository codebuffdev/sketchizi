# Sketchizi

**Sketchizi is a browser-based visual workspace for diagrams, cloud architecture, and infrastructure design.** It is built with React, Vite, and Excalidraw, with focused studios for Kubernetes and Docker Compose workflows.

Repository: https://github.com/codebuffdev/sketchizi  
Live app: https://sketchizi.pages.dev/

## What you can do

- **Diagramming:** Create flowcharts, UML-style diagrams, architecture diagrams, mind maps, and visual notes on an Excalidraw-powered canvas.
- **Icon library:** Search and insert architecture and Eraser catalog icons; use favorites and recently used icons.
- **Kubernetes Studio:** Import Kubernetes YAML manifests, visualize resources and their relationships, inspect resource details, edit manifests, validate cross-resource references, and export YAML.
- **Docker Compose Studio:** Work with Compose YAML, visualize services and their relationships, edit configuration, and export the Compose file.
- **Canvas editing:** Use the primary contextual formatting toolbar for quick changes to selected objects. The Properties panel stays closed by default and opens on demand with **More**, while the primary toolbar remains visible. Also use connectors, minimap, themes, keyboard shortcuts, and diagram file import/export.
- **Persistence and files:** Save drawings locally, reopen recent files, and work with Sketchizi's `.sketchizi` format and Excalidraw-compatible `.excalidraw` files.
- **Collaboration:** Share a room link for real-time editing through the separate WebSocket collaboration service.
- **Optional account features:** Authentication and related backend features depend on their configured services and deployment environment.

## Technology

- React and JavaScript
- Vite
- Excalidraw
- CSS
- Browser storage (including IndexedDB)
- Node.js WebSocket collaboration server
- Cloudflare Pages and Pages Functions for the frontend/API routes
- Separate backend services for features that require them

## Requirements

- Node.js and npm (use a current Node.js LTS release compatible with the lockfile and project dependencies).
- Git to clone the repository.

## Run locally

Clone the repository and install dependencies:

```bash
git clone https://github.com/codebuffdev/sketchizi.git
cd sketchizi
npm install
npm run dev
```

Open the local URL printed by Vite.

### Run real-time collaboration locally

In a second terminal, from the project directory, start the collaboration server:

```bash
npm run collaboration-server
```

The local Vite setup proxies collaboration WebSocket traffic to `ws://localhost:8787/collaboration`.

### Build and preview

Create a production build:

```bash
npm run build
```

Preview the generated build locally:

```bash
npm run preview
```

## Kubernetes Studio

Kubernetes Studio turns Kubernetes manifests into a visual resource graph and supports a YAML-and-diagram workflow.

Current workflow capabilities include:

1. Import YAML containing Kubernetes resources.
2. Generate resource cards and relationship connectors on the canvas.
3. Inspect resources and their manifest details.
4. Edit YAML and synchronize supported resource details and relationships back to the diagram.
5. Run manifest and cross-resource dependency diagnostics.
6. Export the manifest YAML.
7. Re-import manifests while avoiding duplicate diagram resources and stale connectors.

Validation guidance can flag configuration issues and unresolved references. These diagnostics are intended to assist review; they are not a replacement for Kubernetes API-server validation, policy enforcement, or a deployment dry run.

## Docker Compose Studio

Docker Compose Studio supports importing a Compose YAML file, visualizing services and their connections, editing configuration, and exporting the Compose file. Exact diagram coverage depends on the Compose constructs supported by the current implementation.

## Collaboration setup

The frontend and collaboration server are separate processes. For production, deploy the Node collaboration service separately and configure the frontend build with the WebSocket endpoint:

```text
VITE_COLLAB_WS_URL=wss://your-host.example/collaboration
```

Use `wss://` when the app is served over HTTPS, and include the exact `/collaboration` path. Configure the variable in the appropriate hosting environment and rebuild/redeploy the frontend after changing it. Check the collaboration service's health endpoint and hosting logs when diagnosing connection problems.

Do not commit secrets. Any `VITE_*` environment variable is exposed to browser code and must contain only public configuration. Keep backend credentials and signing secrets in server-side environment configuration.

## Useful scripts

The project defines additional focused checks in `package.json`. Common commands include:

```bash
npm run build
npm run test:all
npm run test:kubernetes-relationships
npm run test:kubernetes-resource-validation
npm run test:kubernetes-completeness
npm run test:kubernetes-corrections
npm run test:production-workflow
```

Run a focused test while developing a feature, then run the broader suite before release. A script being available does not mean it has already passed in a given checkout; check the actual command output or CI run.

## Repository layout

```text
sketchizi/
├── public/                         # Static assets
├── functions/                      # Cloudflare Pages Functions
├── server/                         # Node collaboration server and server utilities
├── src/
│   ├── components/                 # Shared application UI
│   ├── features/
│   │   ├── canvas/                 # Canvas interaction
│   │   ├── collaboration/          # Collaboration client
│   │   ├── files/                  # File handling and recent files
│   │   ├── icon-library/           # Icon catalog and insertion
│   │   ├── kubernetes-resources/   # Kubernetes resource graph utilities
│   │   ├── kubernetes-studio/      # Kubernetes Studio workspace
│   │   ├── navigation/             # App navigation and preferences
│   │   └── persistence/            # Local persistence
│   └── styles/                     # Application styles
├── tests/                          # Automated tests
├── scripts/                        # Build and verification utilities
├── package.json
└── README.md
```

This is a high-level map; individual files and feature boundaries may evolve.

## Data and privacy notes

- Canvas persistence is primarily browser-local; local data is associated with the browser and its storage.
- Collaboration sends scene updates and required image/file payloads to the configured collaboration server so participants can share the room state.
- Icon catalogs and separately hosted services may require network access.
- Do not place private credentials, tokens, or sensitive information in diagrams intended for shared collaboration.
- Review the deployment configuration and service-specific documentation before enabling optional authentication or backend integrations.

## Contributing

1. Create a feature branch from the current `main`.
2. Keep changes scoped to the feature and update relevant tests or documentation.
3. Run the focused tests and production build where possible.
4. Open a pull request describing the behavior change, verification performed, and any remaining limitations.

## License

Check the repository's license file and any third-party asset/license terms before redistributing or using the project commercially.

---

**Sketchizi — Draw, connect, and visualize.**
