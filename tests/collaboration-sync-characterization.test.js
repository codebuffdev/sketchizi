import test from "node:test";
import assert from "node:assert/strict";
import { SketchiziCollaboration } from "../src/collaboration.js";

const ROOM_ID = "sync-diagnostics-room-0001";
const originalWebSocket = globalThis.WebSocket;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = MockWebSocket.OPEN;
    this.bufferedAmount = 0;
    this.sent = [];
    this.throwOnSend = null;
  }

  send(payload) {
    if (this.throwOnSend === "before") throw new Error("mock send failure before acceptance");
    this.sent.push(payload);
    if (this.throwOnSend === "after") throw new Error("mock send failure after local write");
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

function element({ id = "e1", version = 1, versionNonce = 1, type = "rectangle", isDeleted = false, ...fields } = {}) {
  return { id, version, versionNonce, type, isDeleted, x: 1, y: 2, width: 20, height: 30, ...fields };
}

function file({ id = "file-1", version = 1, dataURL = "data:image/png;base64,AA==" } = {}) {
  return { id, version, dataURL, mimeType: "image/png" };
}

function createClient() {
  const frames = new Map();
  let nextFrameId = 0;
  globalThis.WebSocket = MockWebSocket;
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++nextFrameId;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);

  const socket = new MockWebSocket();
  const client = new SketchiziCollaboration({ roomId: ROOM_ID, api: {
    getSceneElementsIncludingDeleted: () => [],
    getSceneElements: () => [],
    getFiles: () => ({}),
  } });
  client.joined = true;
  client.permission = "editor";
  client.socket = socket;

  return {
    client,
    socket,
    frames,
    flushFrame() {
      const entry = frames.entries().next();
      if (entry.done) return false;
      const [id, callback] = entry.value;
      frames.delete(id);
      callback();
      return true;
    },
    cleanup() {
      client.close();
      frames.clear();
      globalThis.WebSocket = originalWebSocket;
      if (originalRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = originalRaf;
      if (originalCancelRaf === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = originalCancelRaf;
    },
  };
}

function updateMessages(socket) {
  return socket.sent.map((payload) => JSON.parse(payload)).filter((message) => message.type === "update");
}

test("rapid edits to the same element coalesce into the latest state within one frame", () => {
  const harness = createClient();
  try {
    const { client, socket } = harness;
    client.broadcastLocalChange([element({ version: 1, x: 10 })], {});
    client.broadcastLocalChange([element({ version: 2, x: 20, width: 40 })], {});
    client.broadcastLocalChange([element({ version: 3, versionNonce: 3, type: "arrow", x: 30, width: 80, startBinding: { elementId: "a" } })], {});

    assert.equal(client.pendingElements.size, 1);
    assert.equal(harness.frames.size, 1);
    harness.flushFrame();

    const updates = updateMessages(socket);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].elements.length, 1);
    assert.equal(updates[0].elements[0].version, 3);
    assert.equal(updates[0].elements[0].x, 30);
    assert.equal(updates[0].elements[0].type, "arrow");
    assert.equal(client.pendingElements.size, 0);
  } finally {
    harness.cleanup();
  }
});

test("different changed elements share a batch, including a bound connector update", () => {
  const harness = createClient();
  try {
    const { client, socket } = harness;
    client.broadcastLocalChange([
      element({ id: "rect-a", version: 1 }),
      element({ id: "arrow-b", version: 1, type: "arrow", startBinding: null, endBinding: null }),
    ], {});
    client.broadcastLocalChange([
      element({ id: "rect-a", version: 2, versionNonce: 2, x: 99 }),
      element({ id: "arrow-b", version: 2, versionNonce: 2, type: "arrow", startBinding: { elementId: "rect-a" }, endBinding: null }),
    ], {});
    harness.flushFrame();

    const updates = updateMessages(socket);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].elements.map((item) => item.id).sort(), ["arrow-b", "rect-a"]);
    assert.equal(updates[0].elements.find((item) => item.id === "arrow-b").startBinding.elementId, "rect-a");
  } finally {
    harness.cleanup();
  }
});

test("existing-element deletions are sent, but create-then-delete before a frame is elided", () => {
  const first = createClient();
  try {
    const { client, socket } = first;
    client.remember([element({ id: "known", version: 1 })], {});
    client.broadcastLocalChange([element({ id: "known", version: 2, versionNonce: 2, isDeleted: true })], {});
    first.flushFrame();
    assert.equal(updateMessages(socket)[0].elements[0].isDeleted, true);
  } finally {
    first.cleanup();
  }

  const second = createClient();
  try {
    const { client, socket } = second;
    client.broadcastLocalChange([element({ id: "transient", version: 1 })], {});
    client.broadcastLocalChange([element({ id: "transient", version: 2, versionNonce: 2, isDeleted: true })], {});
    second.flushFrame();
    assert.equal(updateMessages(socket).length, 0);
    assert.equal(client.pendingElements.size, 0);
  } finally {
    second.cleanup();
  }
});

test("disconnected transport retains pending updates for a later flush", () => {
  const harness = createClient();
  try {
    const { client, socket } = harness;
    socket.readyState = MockWebSocket.CONNECTING;
    client.broadcastLocalChange([element()], {});
    harness.flushFrame();
    assert.equal(client.pendingElements.size, 1);
    assert.equal(updateMessages(socket).length, 0);

    socket.readyState = MockWebSocket.OPEN;
    assert.equal(client.flushPendingUpdates(), true);
    assert.equal(updateMessages(socket).length, 1);
    assert.equal(client.pendingElements.size, 0);
  } finally {
    harness.cleanup();
  }
});

test("backpressure defers a batch while preserving the newest queued element state", () => {
  const harness = createClient();
  try {
    const { client, socket } = harness;
    socket.bufferedAmount = 300 * 1024;
    client.broadcastLocalChange([element({ version: 1, x: 10 })], {});
    client.broadcastLocalChange([element({ version: 2, versionNonce: 2, x: 40 })], {});
    harness.flushFrame();

    assert.equal(client.pendingElements.size, 1);
    assert.equal(client.pendingElements.get("e1").x, 40);
    assert.equal(updateMessages(socket).length, 0);

    socket.bufferedAmount = 0;
    client.cancelBackpressureRetry();
    assert.equal(client.flushPendingUpdates(), true);
    assert.equal(updateMessages(socket).length, 1);
    assert.equal(updateMessages(socket)[0].elements[0].x, 40);
    assert.equal(client.pendingElements.size, 0);
  } finally {
    harness.cleanup();
  }
});

test("an oversized serialized update is rejected and remains pending for diagnosis", () => {
  const harness = createClient();
  try {
    const { client, socket } = harness;
    let errorCount = 0;
    client.onError = () => { errorCount += 1; };
    const oversized = element({ name: "x".repeat(8 * 1024 * 1024 + 100) });
    client.broadcastLocalChange([oversized], {});
    assert.equal(harness.flushFrame(), true);
    assert.equal(errorCount, 1);
    assert.equal(client.pendingElements.size, 1);
    assert.equal(updateMessages(socket).length, 0);
  } finally {
    harness.cleanup();
  }
});

test("the join snapshot seeds element and file signatures for reconciliation", () => {
  const scene = [element({ id: "snapshot-element", version: 4 })];
  const files = { ["snapshot-file"]: file({ id: "snapshot-file", version: 2 }) };
  const harness = createClient();
  try {
    const { client } = harness;
    client.api.getSceneElementsIncludingDeleted = () => scene;
    client.api.getFiles = () => files;
    const snapshot = client.snapshot();
    assert.equal(snapshot.elements.length, 1);
    assert.equal(Object.keys(snapshot.files).length, 1);
    assert.equal(client.lastElements.get("snapshot-element"), "snapshot-element:4:1:0");
    assert.equal(client.lastFiles.get("snapshot-file"), `snapshot-file:2:${files["snapshot-file"].dataURL.length}`);
  } finally {
    harness.cleanup();
  }
});

test("a send exception leaves the batch pending because the baseline advances only after send returns", () => {
  for (const mode of ["before", "after"]) {
    const harness = createClient();
    try {
      const { client, socket } = harness;
      client.broadcastLocalChange([element()], {});
      socket.throwOnSend = mode;
      assert.throws(() => harness.flushFrame(), /mock send failure/);
      assert.equal(client.pendingElements.size, 1);
      assert.equal(client.lastElements.has("e1"), false);
    } finally {
      harness.cleanup();
    }
  }
});


test("joined snapshots distinguish initial synchronization from reconnect synchronization", () => {
  const harness = createClient();
  try {
    const { client } = harness;
    const receivedStates = [];
    client.onState = (state) => receivedStates.push(state);
    const joined = { type: "joined", roomId: ROOM_ID, role: "joinee", permission: "editor", participants: [], elements: [], files: {}, authorship: {}, chatHistory: [] };
    client.handleMessage(joined);
    client.handleMessage(joined);
    assert.deepEqual(receivedStates.map((state) => state.kind), ["initial", "reconnect"]);
  } finally {
    harness.cleanup();
  }
});

test("syncBaseline drops pending records already represented by a snapshot and retains divergent records", () => {
  const harness = createClient();
  try {
    const { client } = harness;
    const first = element({ id: "e1", version: 2, versionNonce: 2 });
    const other = element({ id: "e2", version: 1, versionNonce: 1 });
    client.pendingElements.set("e1", first);
    client.pendingElements.set("e2", other);
    client.syncBaseline([first], {});
    assert.deepEqual([...client.pendingElements.keys()], ["e2"]);
  } finally {
    harness.cleanup();
  }
});

test("a large embedded-file update below the existing message limit is transmitted as one batch", () => {
  const harness = createClient();
  try {
    const { client, socket } = harness;
    const large = file({ id: "large-image", version: 1, dataURL: `data:image/png;base64,${"A".repeat(7 * 1024 * 1024)}` });
    client.broadcastLocalChange([], { [large.id]: large });
    harness.flushFrame();
    const updates = updateMessages(socket);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].files.length, 1);
    assert.equal(updates[0].files[0].id, "large-image");
  } finally {
    harness.cleanup();
  }
});
