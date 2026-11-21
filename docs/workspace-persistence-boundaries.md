# Workspace persistence boundaries

| Surface | Code ownership | Runtime verification |
| --- | --- | --- |
| Editor and local persistence | React editor and IndexedDB in sketchizi | Browser verification runs against the frontend build |
| Cloud Workspace API | Cloudflare Pages gateway forwards to the configured Spring origin | A signed-in disposable staging project is required |
| Collaboration | The frontend accepts VITE_COLLAB_WS_URL. Both the frontend repository's Node service and the Spring backend implement the protocol | Confirm the configured endpoint and backend release in staging and production before changing either service |
| Drawing repository | Sample Excalidraw exports | Suitable for import fixtures after review and removal of private drawing content |

The legacy main IndexedDB record and the canvas-tab manifest both contain scene data. Tab restore prefers the manifest. The local lifecycle should use the manifest as the authority for each open tab's scene, dirty state, and committed revision. Keep a reader for legacy main-only data and treat recovery copies as pending revisions. Claim a save after the authoritative transaction commits. Preserve separate cloud revisions and reject stale writes using If-Match.

The gateway currently checks duplicate names with a list request before a mutation. Two requests can both pass that check. The backend should enforce uniqueness within each project for the agreed normalized name on every write path, including create, rename, move, and duplicate. Before adding a unique index, inventory existing collisions and agree a disposition for them. Preserve existing drawings and names until that decision is made.

## Staging contract test

Install Playwright as for the existing staging browser verification. Set STAGING_BASE_URL to the deployed staging frontend, WORKSPACE_TEST_STORAGE_STATE to a Playwright storage-state file for a disposable test account, and WORKSPACE_TEST_PROJECT_ID to a dedicated project. Run node scripts/staging-workspace-contract.mjs. Keep the storage-state file out of Git and CI artifacts. The test creates uniquely named drawings, verifies save and reopen, checks stale revision rejection, and races two normalized duplicate creates. Cleanup targets only the IDs returned by successful creates.
