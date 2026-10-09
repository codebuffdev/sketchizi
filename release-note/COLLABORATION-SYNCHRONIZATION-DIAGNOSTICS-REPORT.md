# Sketchizi Collaboration Synchronization Diagnostics Report

## Baseline and scope

- Authoritative baseline ZIP: `Stable-Sketchizi-1.10.36-collaboration-chat-ui-fixes(1).zip`
- Version read from its `package.json`: **1.10.36**
- Diagnostic release: **1.10.37**
- Scope: opt-in diagnostics and characterization/test harness only. No synchronization fix, protocol-field addition, conflict-rule change, backpressure change, persistence change, or room-lifecycle change was intended.
- The separately referenced `Sketchizi-Collaboration-Synchronization-Audit-1.10.36.md` was not present in the supplied files or working `/mnt/data` listing. Accordingly, no claims were adopted from that audit; the observations below are based on the provided source ZIP.

## Verified current data flow

```text
Excalidraw scene change
  -> src/features/canvas/useExcalidrawScene.js
     -> AWS and Kubernetes relationship metadata synchronization (local, non-intermediate path)
     -> architecture analysis scheduled/coalesced by animation frame
     -> selection/minimap work and existing persistence queue
     -> collaborationRef.broadcastLocalChange(elements, files, appState)
  -> src/collaboration.js
     -> computes element signature from id/version/versionNonce/isDeleted
     -> stores latest pending element/file per ID in Maps
     -> schedules requestAnimationFrame (16ms timeout fallback)
     -> flushPendingUpdates filters unchanged signatures and transient create-then-delete
     -> serializes changed element/file records to JSON
     -> pauses normal flush when socket.bufferedAmount exceeds 256 KiB and retries on a 16ms timer
     -> WebSocket.send; local signature baseline advances after send returns
  -> server/collaboration-server.mjs
     -> parses JSON; validates room/socket membership and permissions
     -> mergeSnapshot in server/collaborationSyncCore.mjs
     -> version/versionNonce comparison; accepted changes update in-memory room maps
     -> broadcasts accepted update to other room clients (sender excluded)
  -> client WebSocket onmessage in src/collaboration.js
     -> parses and dispatches join/update messages
  -> src/features/collaboration/useCollaboration.js
     -> initial snapshot: restoreElements then updateScene
     -> incremental update: restoreElements(remote, existing), reconcileElements, updateScene
     -> syncBaseline after snapshot/remote state application
     -> remote-update guard suppresses the broadcast echo
```

Initial join uses a room snapshot. Ordinary updates send changed elements/files, not the complete scene. A changed freehand element still carries its current complete element/path data; this is observable from the changed-element payload construction, but its actual impact depends on stroke size and measured runtime.

## How to enable diagnostics

### Browser/client

Append `sketchiziSyncDiagnostics=1` to the deployed/local application URL, for example:

```text
http://localhost:5173/?sketchiziSyncDiagnostics=1
```

If the URL already has query parameters, add `&sketchiziSyncDiagnostics=1`. Reload after changing it; the client setting is cached at first use. Open DevTools Console and filter for:

```text
[Sketchizi Sync Diagnostics]
```

The client emits records for scene callback start/completion and stage durations, relationship/minimap/persistence queue duration, change detection, queue/flush outcomes, queued/changed/deleted/file counts, batch size, serialization duration/bytes, WebSocket readyState and `bufferedAmount`, send/defer/retry/reject events, incoming message parse/dispatch, remote scene restore/reconcile/updateScene durations, baseline synchronization, connection close/reconnect, snapshot lifecycle, and related errors.

### Collaboration server

Enable the environment flag before starting the existing server; no second server is used:

PowerShell:

```powershell
$env:SKETCHIZI_SYNC_DIAGNOSTICS = "1"
npm run collaboration-server
```

Bash:

```bash
SKETCHIZI_SYNC_DIAGNOSTICS=1 npm run collaboration-server
```

The server emits the same prefix and includes received/parsed message size/type, join/room lifecycle, update validation/rejection reason, merge counts and timing/conflict outcomes, accepted/skipped elements/files, broadcast recipient count/bytes/duration, and close/error details.

Disable both settings after testing. Logging can be high-volume when enabled, so use it for controlled diagnostic sessions.

### Privacy and clock notes

Diagnostics intentionally log counts/sizes/types/timing/state only. They do not serialize or log full scene records, element properties, `customData`, file data URLs, message bodies, chat contents, raw room/client IDs, or full WebSocket payloads. Room and client references are deterministic non-cryptographic hashes only for trace correlation; they are not identity/security tokens. Event IDs are process-local. Durations use the clock in the process doing the work. Do not subtract client and server wall-clock timestamps to claim one-way network latency because their clocks are not synchronized.

## Characterization test coverage

New tests directly exercise the actual `SketchiziCollaboration` source class through a test-only Node import loader and exercise the same server merge module imported by the server:

- Repeated changes to one element coalesce to the newest state in a frame.
- Multiple changed elements batch together, including connector binding changes.
- Existing-element deletion is transmitted; create-then-delete before a flush is elided.
- A non-open/disconnected socket preserves pending changes for a later send.
- Existing 256 KiB buffer high-water behavior defers updates, retains the newest state, and can flush after recovery.
- Oversized serialized updates are rejected by current client code and remain pending; the test observes the present behavior rather than altering it.
- Initial snapshot signatures are remembered; join/reconnect synchronization flags are distinguished.
- A send exception does not advance the current signature baseline.
- Pending changes already represented by a snapshot are removed by `syncBaseline`; divergent records remain.
- A large embedded-file update below the current message-size limit is sent as one update.
- Server new/higher-version merge, lower-version/equal-version skipping, equal-version nonce tie-break, delete/edit version behavior, reordered/duplicate updates, file validation, and existing limits.
- Diagnostics are off by default, enabled only by the explicit query parameter/environment flag, and test-provided private/content values do not appear in diagnostic output.
- Synthetic performance sample uses the actual client collaboration class and server merge function for scenes of 100, 1,000, and 5,000 elements.

The tests characterize current behavior. They are not proof of actual LAN/WAN delay or full Excalidraw/browser rendering performance.

## Commands and actual results

| Command | Actual result |
|---|---|
| `npm run test:sync` | **22 passed, 0 failed** |
| `npm run test:chat` | **10 passed, 0 failed** |
| `npm run test:networking` | **4 passed, 0 failed** |
| `npm run test:catalog` | **3 passed, 0 failed** |
| `npm run test:sync-performance` | Completed; measurements below |
| `node --check` for every modified/new JS module and test | Passed |
| `node -e` JSON parse of `package.json` | Passed |
| `npm run build` | **Failed: `vite: not found`, exit 127** |
| `unzip -t` final ZIP | Passed; no compressed-data errors |

### Synthetic Node performance sample

These are measurements from the synthetic Node harness, not the browser application and not a two-client network test:

| Scene size | Changed records queued | Update messages | Update payload bytes | Client change detection (ms) | Client flush + serialization + mock send (ms) | Server initial merge (ms) | Server update merge (ms) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 100 | 1 | 15,045 | 1.692 | 0.564 | 1.838 | 0.461 |
| 1,000 | 1,000 | 1 | 151,726 | 5.873 | 13.585 | 22.239 | 8.914 |
| 5,000 | 5,000 | 1 | 765,775 | 17.936 | 15.630 | 20.496 | 16.574 |

Numbers are a single synthetic sample and should not be treated as statistically stable benchmark results. Browser hardware, React/Excalidraw rendering, WebSocket scheduling, actual payload type distribution, and network conditions were not represented.

## Findings, evidence level, and priority

### F1 — Every local Excalidraw `onChange` enters a Sketchizi scene pipeline before broadcast

- **Evidence:** source inspection of `useExcalidrawScene.js`; client instrumentation can now measure stage durations.
- **Status:** confirmed by source; not measured in a real browser.
- **Impact:** potentially relevant for frequent scene changes; actual bottleneck requires client-side runtime traces.
- **Priority:** high to measure; no fix implemented.

### F2 — Normal scene updates are per-changed-element batches, but a changed element is serialized as a complete record

- **Evidence:** source inspection and tests of `pendingElements` keyed by element ID plus `flushPendingUpdates` changed signature selection.
- **Status:** confirmed by source and characterized by tests.
- **Impact:** avoids re-sending unchanged scene elements per update, but the active element's size (especially path-heavy elements) still contributes fully to every transmitted revision.
- **Priority:** high to measure with Pencil, moving/resizing shapes, connector bindings, and property edits.

### F3 — Client frame batching/coalescing and backpressure deferral exist today

- **Evidence:** source inspection and tests show one requestAnimationFrame batch, latest state per element ID, and current 256 KiB `bufferedAmount` threshold with 16 ms retry scheduling.
- **Status:** confirmed by source and deterministic mock tests.
- **Impact:** exact defer time and live queue growth are still unknown. Instrumentation records `bufferedAmount`, pending counts, retries and flush durations.
- **Priority:** high to measure in a congested WebSocket scenario.

### F4 — Client baseline advances after `WebSocket.send()` returns; ordinary update acceptance has no dedicated server ACK

- **Evidence:** source inspection of `sendSceneUpdate` and server update branch; mock tests characterize behavior when `send()` throws.
- **Status:** confirmed by source. No lost-message/rejection scenario has been reproduced on a real WebSocket connection.
- **Impact:** source-level reliability question if a message reaches the browser's socket queue but is not ultimately accepted at the server; actual loss/recovery behavior requires fault injection or multi-client network testing.
- **Priority:** high for subsequent reliability design discussion; no ACK or protocol change introduced here.

### F5 — Server conflict resolution uses version, then versionNonce as a tie-breaker

- **Evidence:** extracted `collaborationSyncCore.mjs` preserves the exact 1.10.36 `chooseElement` decision branches; tests exercise each branch and reordered duplicates.
- **Status:** confirmed by source and characterized by tests.
- **Observed edge behavior:** at the same version, an edit can win over a deletion tombstone when its `versionNonce` is higher. This is not corrected in this diagnostics phase.
- **Priority:** high correctness consideration for a later design phase; no merge-rule change implemented.

### F6 — Initial joins are room snapshots; incremental updates are broadcast only when merge accepts an element or file

- **Evidence:** source inspection of join handling and update broadcast logic; core tests cover new changes and skipped duplicate/older records.
- **Status:** confirmed by source; only the merge unit is tested, not a live room with several sockets.
- **Priority:** medium; validate full room lifecycle using manual two/three-client testing.

### F7 — Size limits are applied at different layers using different length semantics

- **Evidence:** source inspection: client compares JSON string `.length`; server WebSocket `maxPayload` is configured in bytes and server raw message length is checked.
- **Status:** confirmed source-level difference; not reproduced at an exact multibyte boundary.
- **Impact:** multibyte strings may have a client code-unit length different from UTF-8 byte length; an exact limit-edge case should be tested in the running client/server before deciding whether behavior is problematic.
- **Priority:** medium; no limits changed.

### F8 — Host socket disconnection destroys its room in this baseline

- **Evidence:** `removeClient()` calls `terminateRoom(room)` when the disconnected socket was host.
- **Status:** confirmed by source; not changed or re-tested live.
- **Impact:** reconnect/recovery after host disconnection does not preserve room state under the current lifecycle; this may be a product decision or limitation to address separately.
- **Priority:** medium/high for lifecycle design; explicitly left unchanged.

## Not measured / hypotheses not confirmed

- End-to-end message latency in milliseconds.
- Real browser callback time under actual drawings.
- Actual network throughput or buffer buildup while users draw.
- Whether any scene update is lost under real connection interruption.
- Final scene convergence between simultaneous real clients after conflict, disconnect, reconnect, or large file transfer.
- React/Excalidraw rendering duration independent of `updateScene` call duration.
- Live-server oversized-frame and message rejection behavior.

No runtime measurements have been fabricated. The instrumented runtime can now collect client/server stage durations and payload/queue counters, but the current environment did not have Vite or installed project dependencies, and no live browser/multi-client session was run.

## Reproducible manual baseline procedure

1. Install project dependencies in a local environment where npm access is available, and run `npm run dev`.
2. Start the existing collaboration server with `SKETCHIZI_SYNC_DIAGNOSTICS=1 npm run collaboration-server` (or the PowerShell equivalent).
3. Open two separate browser contexts to the same app URL with `?sketchiziSyncDiagnostics=1`; enable Preserve log in each DevTools console.
4. Create a session in one client and join with the second. Confirm join/snapshot records appear on both client consoles and server console; compare hashed `roomRef`/`clientRef` and per-side event ordering only.
5. In separate controlled passes, draw one Pencil stroke, create and move a rectangle, resize/rotate/delete an element, edit text/properties, change connector bindings, and insert an image. Capture callback/batch/message/payload/merge/remote-apply durations.
6. Capture a long Pencil stroke with the second client open and review `bufferedAmount`, `sceneUpdateSerialized`, `flush.completed`, `server.sceneUpdate.completed`, `server.broadcast.completed`, `client.remoteSceneApply.completed`, and `client.remoteState.completed`.
7. Test backpressure in a throttled network or a dedicated mock harness; don't infer a real congested socket from the synthetic performance sample.
8. For conflict testing, edit the same element simultaneously in both clients, then try delete-versus-edit. Record final element `version`, `versionNonce`, and `isDeleted` via the diagram/scene debugger, but do not paste raw element data into the diagnostic logs.
9. For connection recovery, close a participant tab/network temporarily and restore it while the room remains active; repeat host disconnection separately. Observe join snapshot, baseline sync, queued changes, and final scene state.
10. For size limits, send an intentionally oversized but non-sensitive synthetic element/file payload in a test session. Observe client rejection, server rejection, close code, pending queue behavior, and recovery. Do not use real image/user content for this test.
11. Disable the server flag and remove the URL query parameter after collection.

## Diff review

The baseline diff is limited to the existing collaboration scene/client/server integration points, the extracted server merge core used by both server and tests, opt-in diagnostic helpers, test-only loader/fixture and characterization tests, package scripts/version, HTML title, and diagnostic/release documentation. Existing persistence implementation, message formats, collaboration protocol semantics, conflict decisions, batch timing, backpressure threshold/retry timing, authorization, room lifecycle, and chat code were not intentionally changed.
