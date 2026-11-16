import { SketchiziCollaboration } from "../src/collaboration.js";
import { mergeSnapshot } from "../server/collaborationSyncCore.mjs";

const OriginalWebSocket = globalThis.WebSocket;
const OriginalRaf = globalThis.requestAnimationFrame;
const OriginalCancelRaf = globalThis.cancelAnimationFrame;

class BenchmarkWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  constructor() { this.readyState = 1; this.bufferedAmount = 0; this.messages = []; }
  send(payload) { this.messages.push(payload); }
  close() { this.readyState = 3; }
}

function makeElement(index, version = 1) {
  return {
    id: `bench-${index}`,
    type: index % 5 === 0 ? "arrow" : index % 7 === 0 ? "freedraw" : "rectangle",
    x: index * 2,
    y: index % 113,
    width: 120,
    height: 64,
    version,
    versionNonce: version * 10000 + index,
    isDeleted: false,
    startBinding: index % 5 === 0 ? { elementId: `bench-${Math.max(0, index - 1)}` } : null,
  };
}

try {
  for (const count of [100, 1000, 5000]) {
    const frames = [];
    globalThis.WebSocket = BenchmarkWebSocket;
    globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    globalThis.cancelAnimationFrame = () => {};
    const socket = new BenchmarkWebSocket();
    const api = { getSceneElementsIncludingDeleted: () => [], getSceneElements: () => [], getFiles: () => ({}) };
    const client = new SketchiziCollaboration({ roomId: "sync-benchmark-room-0001", api });
    client.socket = socket;
    client.joined = true;
    client.permission = "host";
    const elements = Array.from({ length: count }, (_, index) => makeElement(index));

    const detectStartedAt = performance.now();
    client.broadcastLocalChange(elements, {});
    const detectDurationMs = performance.now() - detectStartedAt;

    const flushStartedAt = performance.now();
    frames.shift()?.();
    const flushDurationMs = performance.now() - flushStartedAt;
    const updatePayloads = socket.messages.map((data) => ({ data, parsed: JSON.parse(data) })).filter(({ parsed }) => parsed.type === "update");
    const updateBytes = updatePayloads.reduce((total, item) => total + Buffer.byteLength(item.data, "utf8"), 0);

    const serverRoom = { id: "sync-benchmark-room-0001", elements: new Map(), files: new Map(), authorship: new Map() };
    const seedStartedAt = performance.now();
    mergeSnapshot(serverRoom, elements, [], "bench-client");
    const seedMergeDurationMs = performance.now() - seedStartedAt;
    const edits = elements.map((item) => ({ ...item, version: 2, versionNonce: item.versionNonce + 1, x: item.x + 1 }));
    const updateMergeStartedAt = performance.now();
    const accepted = mergeSnapshot(serverRoom, edits, [], "bench-client");
    const updateMergeDurationMs = performance.now() - updateMergeStartedAt;

    console.log(JSON.stringify({
      scenario: "synthetic-node-characterization-not-browser-runtime",
      elements: count,
      changedElementsQueued: client.lastElements.size,
      updateMessages: updatePayloads.length,
      updatePayloadBytes: updateBytes,
      clientChangeDetectionMs: Number(detectDurationMs.toFixed(3)),
      clientFlushSerializationAndSendMs: Number(flushDurationMs.toFixed(3)),
      serverInitialMergeMs: Number(seedMergeDurationMs.toFixed(3)),
      serverUpdateMergeMs: Number(updateMergeDurationMs.toFixed(3)),
      serverAcceptedUpdateElements: accepted.elements.length,
    }));

    client.close();
  }
} finally {
  globalThis.WebSocket = OriginalWebSocket;
  if (OriginalRaf === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = OriginalRaf;
  if (OriginalCancelRaf === undefined) delete globalThis.cancelAnimationFrame;
  else globalThis.cancelAnimationFrame = OriginalCancelRaf;
}
