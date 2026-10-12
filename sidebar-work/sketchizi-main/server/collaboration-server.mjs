import { serverLogger } from "./logger.mjs";
import { inspectHostAuthorization } from "./hostAuthorization.mjs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { mergeSnapshot } from "./collaborationSyncCore.mjs";
import {
  recordSyncDiagnostic,
  syncDiagnosticNow,
  syncDiagnosticRef,
  syncDiagnosticsEnabled,
  syncUtf8ByteLength,
  summarizeSyncMessage,
} from "./syncDiagnostics.mjs";
import { MAX_CHAT_TEXT_LENGTH, MAX_CHAT_HISTORY, filterAuthorizedChatHistory, normalizeChatText, isSupportedChatAudience, makeChatHistoryEntry, resolveChatRecipients } from "../src/chatProtocol.js";

const PORT = Number(process.env.COLLAB_PORT || 8787);
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const ROOM_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_ROOM_NAME_LENGTH = 120;
const MAX_DISPLAY_NAME_LENGTH = 48;
const CHAT_RATE_WINDOW_MS = 10000;
const CHAT_RATE_LIMIT = 8;
const HOST_RECOVERY_GRACE_MS = 60_000;
const PRESENCE_ACTIVITIES = new Set(["idle", "drawing", "editing/moving"]);

// There is intentionally no MAX_CLIENTS/MAX_PARTICIPANTS setting.
// room.clients is the complete per-room participant set; practical capacity is
// bounded by this process's memory/CPU/network/WebSocket resources instead.
const rooms = new Map();
const terminatedRooms = new Set();

function roomSnapshot(room) {
  return {
    name: room.name,
    elements: Array.from(room.elements.values()),
    files: Object.fromEntries(room.files.entries()),
    authorship: Object.fromEntries(room.authorship.entries()),
    participants: Array.from(room.presence.values()),
  };
}

function allowChatRate(room, clientId) {
  const now = Date.now();
  const current = (room.chatRate.get(clientId) || []).filter((time) => now - time < CHAT_RATE_WINDOW_MS);
  if (current.length >= CHAT_RATE_LIMIT) return false;
  current.push(now);
  room.chatRate.set(clientId, current);
  return true;
}

function deliverChat(room, message, recipientIds) {
  const data = JSON.stringify(message);
  for (const client of room.clients) {
    if (recipientIds.has(client.__sketchiziClientId) && client.readyState === 1) client.send(data);
  }
}

function sanitizePresence(clientId, source = {}, previous = null, permission = null) {
  const displayName = typeof source.displayName === "string" && source.displayName.trim()
    ? source.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
    : previous?.displayName || "Guest";
  const color = /^#[0-9a-fA-F]{6}$/.test(source.color || "") ? source.color : previous?.color || "#7c3aed";
  const cursor = source.cursor && Number.isFinite(source.cursor.x) && Number.isFinite(source.cursor.y)
    ? { x: source.cursor.x, y: source.cursor.y }
    : source.cursor === null ? null : previous?.cursor || null;
  const activity = PRESENCE_ACTIVITIES.has(source.activity) ? source.activity : previous?.activity || "idle";
  const selectedElementIds = Array.isArray(source.selectedElementIds)
    ? source.selectedElementIds.filter((id) => typeof id === "string").slice(0, 100)
    : previous?.selectedElementIds || [];
  return { participantId: clientId, displayName, color, cursor, activity, selectedElementIds, joinedAt: Number(previous?.joinedAt) || Date.now(), status: "connected", permission: permission || previous?.permission || "viewer" };
}

function broadcastPresence(room, sender, message) {
  broadcast(room, sender, message);
}

function broadcast(room, sender, message) {
  const diagnosticsEnabled = syncDiagnosticsEnabled();
  const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
  const data = JSON.stringify(message);
  let recipientCount = 0;
  for (const client of room.clients) {
    if (client !== sender && client.readyState === 1) {
      client.send(data);
      if (diagnosticsEnabled) recipientCount += 1;
    }
  }
  if (diagnosticsEnabled) recordSyncDiagnostic("server.broadcast.completed", {
    roomRef: syncDiagnosticRef(room.id),
    senderRef: sender?.__sketchiziClientId ? syncDiagnosticRef(sender.__sketchiziClientId) : "server",
    ...summarizeSyncMessage(message),
    payloadBytes: syncUtf8ByteLength(data),
    recipientCount,
    durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
  });
}

function send(client, message) {
  if (client.readyState !== 1) {
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.sendSkipped", {
      messageType: message?.type || "unknown",
      readyState: client.readyState,
    });
    return;
  }
  const diagnosticsEnabled = syncDiagnosticsEnabled();
  const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
  const data = JSON.stringify(message);
  client.send(data);
  if (diagnosticsEnabled) recordSyncDiagnostic("server.message.sent", {
    messageType: message?.type || "unknown",
    roomRef: message?.roomId ? syncDiagnosticRef(message.roomId) : "none",
    recipientRef: client.__sketchiziClientId ? syncDiagnosticRef(client.__sketchiziClientId) : "unjoined",
    ...summarizeSyncMessage(message),
    payloadBytes: syncUtf8ByteLength(data),
    durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
  });
}

function terminateRoom(room, message = "The host ended the collaboration session.") {
  if (!room || room.terminated) return;
  if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.room.terminated", {
    roomRef: syncDiagnosticRef(room.id),
    clientCount: room.clients.size,
    sceneElementCount: room.elements.size,
    sceneFileCount: room.files.size,
    chatHistoryCount: room.chatMessages?.length || 0,
  });
  room.terminated = true;
  if (room.hostRecoveryTimer) clearTimeout(room.hostRecoveryTimer);
  room.hostRecoveryTimer = null;
  terminatedRooms.add(room.id);
  room.chatMessages?.splice(0);
  room.chatRate?.clear();
  for (const client of room.clients) {
    send(client, { type: "session-ended", roomId: room.id, message });
    try { client.close(1000, "Collaboration session ended"); } catch {}
  }
  room.clients.clear();
  room.presence.clear();
  rooms.delete(room.id);
}

function removeClient(room, client, { intentional = false } = {}) {
  if (!room || !room.clients.has(client)) return;
  const wasHost = room.host === client;
  if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.participant.disconnected", {
    roomRef: syncDiagnosticRef(room.id),
    clientRef: client.__sketchiziClientId ? syncDiagnosticRef(client.__sketchiziClientId) : "unjoined",
    wasHost,
    intentional,
    clientCountBefore: room.clients.size,
    sceneElementCount: room.elements.size,
    sceneFileCount: room.files.size,
  });
  const clientIdForPresence = client.__sketchiziClientId;
  room.clients.delete(client);
  if (wasHost) {
    if (intentional) {
      terminateRoom(room);
      return;
    }
    room.host = null;
    room.hostDisconnectedAt = Date.now();
    room.hostRecoveryDeadline = room.hostDisconnectedAt + HOST_RECOVERY_GRACE_MS;
    if (clientIdForPresence && room.presence.has(clientIdForPresence)) {
      const current = room.presence.get(clientIdForPresence);
      room.presence.set(clientIdForPresence, { ...current, status: "disconnected" });
    }
    broadcast(room, null, { type: "host-disconnected", roomId: room.id, deadline: room.hostRecoveryDeadline, graceMs: HOST_RECOVERY_GRACE_MS });
    broadcast(room, null, { type: "presence", roomId: room.id, count: room.clients.size, participants: Array.from(room.presence.values()) });
    room.hostRecoveryTimer = setTimeout(() => {
      if (room.terminated || !room.hostDisconnectedAt || room.host) return;
      serverLogger.info("Host recovery grace period expired", { roomRef: syncDiagnosticRef(room.id), graceMs: HOST_RECOVERY_GRACE_MS });
      terminateRoom(room, "The collaboration session ended because the host could not reconnect in time.");
    }, HOST_RECOVERY_GRACE_MS);
    room.hostRecoveryTimer.unref?.();
    return;
  }
  if (intentional) {
    if (clientIdForPresence) {
      room.presence.delete(clientIdForPresence);
      room.permissions.delete(clientIdForPresence);
      room.pendingRequests.delete(clientIdForPresence);
      room.chatRate.delete(clientIdForPresence);
    }
    broadcastPresence(room, null, { type: "presence:remove", roomId: room.id, clientId: clientIdForPresence });
  } else if (clientIdForPresence && room.presence.has(clientIdForPresence)) {
    const current = room.presence.get(clientIdForPresence);
    room.presence.set(clientIdForPresence, { ...current, status: "disconnected" });
    broadcastPresence(room, null, { type: "presence:update", roomId: room.id, clientId: clientIdForPresence, presence: { status: "disconnected" } });
  }
  if (!room.clients.size && !room.presence.size) {
    room.chatMessages?.splice(0);
    room.chatRate?.clear();
    rooms.delete(room.id);
    return;
  }
  broadcast(room, null, { type: "presence", roomId: room.id, count: room.clients.size, participants: Array.from(room.presence.values()) });
}

const httpServer = createServer((req, res) => {
  const requestPath = (() => {
    try { return new URL(req.url || "/", "http://localhost").pathname; } catch { return "unknown"; }
  })();
  if (requestPath === "/health") {
    serverLogger.debug("Collaboration health check", { rooms: rooms.size });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  serverLogger.debug("Collaboration HTTP route not found", { method: req.method, path: requestPath });
  res.writeHead(404);
  res.end("Not found");
});

// Attach this before WebSocketServer registers its own upgrade handler so each
// request gets a correlation id even when the handshake is rejected.
httpServer.on("upgrade", (request) => {
  const upgradeId = randomUUID();
  request.__sketchiziUpgradeId = upgradeId;
  let requestPath = "unknown";
  let originHost = "none";
  try { requestPath = new URL(request.url || "/", "http://localhost").pathname; } catch {}
  try { originHost = request.headers.origin ? new URL(request.headers.origin).host : "none"; } catch { originHost = "invalid-origin"; }
  serverLogger.info("Collaboration WebSocket upgrade requested", {
    upgradeId,
    path: requestPath,
    originHost,
    hostHeaderPresent: Boolean(request.headers.host),
    websocketKeyPresent: Boolean(request.headers["sec-websocket-key"]),
  });
});

httpServer.on("clientError", (error, socket) => {
  serverLogger.warn("Collaboration HTTP client error", {
    errorCode: error?.code || "unknown",
    errorMessage: String(error?.message || "HTTP client error").slice(0, 180),
    socketWritable: Boolean(socket?.writable),
  });
});
httpServer.on("error", (error) => {
  serverLogger.error("Collaboration HTTP server error", error, { port: PORT });
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_MESSAGE_BYTES,
  path: "/collaboration",
});

wss.on("connection", (socket, request) => {
  let room = null;
  let clientId = null;
  const connectionId = request?.__sketchiziUpgradeId || randomUUID();
  const connectedAt = Date.now();
  socket.__sketchiziConnectionId = connectionId;
  let requestPath = "unknown";
  let originHost = "none";
  try { requestPath = new URL(request?.url || "/", "http://localhost").pathname; } catch {}
  try { originHost = request?.headers?.origin ? new URL(request.headers.origin).host : "none"; } catch { originHost = "invalid-origin"; }
  serverLogger.info("Collaboration WebSocket connection accepted", {
    connectionId,
    path: requestPath,
    originHost,
    readyState: socket.readyState,
  });
  if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.websocket.connected", { readyState: socket.readyState, connectionId });

  socket.on("message", (raw, isBinary) => {
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const receivedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    if (diagnosticsEnabled) recordSyncDiagnostic("server.message.received", {
      roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined",
      clientRef: clientId ? syncDiagnosticRef(clientId) : "unjoined",
      payloadBytes: raw.length,
      isBinary: Boolean(isBinary),
    });
    if (raw.length > MAX_MESSAGE_BYTES) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.message.rejected", {
        roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined",
        clientRef: clientId ? syncDiagnosticRef(clientId) : "unjoined",
        reason: "payload-too-large",
        payloadBytes: raw.length,
        maxPayloadBytes: MAX_MESSAGE_BYTES,
      });
      socket.close(1009, "Message too large");
      return;
    }

    let message;
    const parseStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.message.rejected", {
        roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined",
        reason: "malformed-json",
        payloadBytes: raw.length,
        parseDurationMs: Math.max(0, syncDiagnosticNow() - parseStartedAt),
      });
      serverLogger.warn("Collaboration message rejected", { connectionId, phase: room ? "session" : "join", reason: "malformed-json", payloadBytes: raw.length });
      send(socket, { type: "error", ...(room?.id ? { roomId: room.id } : {}), code: "MALFORMED_JSON", phase: room ? "session" : "join", message: "Malformed collaboration message." });
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      serverLogger.warn("Collaboration message rejected", { connectionId, phase: room ? "session" : "join", reason: "message-shape-invalid", payloadBytes: raw.length });
      send(socket, { type: "error", ...(room?.id ? { roomId: room.id } : {}), code: "MESSAGE_SHAPE_INVALID", phase: room ? "session" : "join", message: "Malformed collaboration message." });
      return;
    }
    if (diagnosticsEnabled) recordSyncDiagnostic("server.message.parsed", {
      roomRef: message.roomId ? syncDiagnosticRef(message.roomId) : "unjoined",
      clientRef: message.clientId ? syncDiagnosticRef(message.clientId) : "unjoined",
      ...summarizeSyncMessage(message),
      payloadBytes: raw.length,
      parseDurationMs: Math.max(0, syncDiagnosticNow() - parseStartedAt),
      receiveToParsedMs: Math.max(0, syncDiagnosticNow() - receivedAt),
    });

    if (message.type === "join") {
      serverLogger.info("Collaboration join request received", {
        connectionId,
        roomRef: typeof message.roomId === "string" ? syncDiagnosticRef(message.roomId) : "invalid",
        clientRef: typeof message.clientId === "string" ? syncDiagnosticRef(message.clientId) : "invalid",
        hostCredentialPresent: typeof message.hostAuthorizationToken === "string" && message.hostAuthorizationToken.length > 0,
        hostCredentialLength: typeof message.hostAuthorizationToken === "string" ? message.hostAuthorizationToken.length : 0,
        sessionNamePresent: typeof message.sessionName === "string" && Boolean(message.sessionName.trim()),
        sessionNameLength: typeof message.sessionName === "string" ? message.sessionName.length : 0,
        snapshotElementCount: Array.isArray(message.snapshot?.elements) ? message.snapshot.elements.length : 0,
        snapshotFileCount: message.snapshot?.files && typeof message.snapshot.files === "object" ? Object.keys(message.snapshot.files).length : 0,
      });
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.join.requested", {
        roomRef: typeof message.roomId === "string" ? syncDiagnosticRef(message.roomId) : "invalid",
        clientRef: typeof message.clientId === "string" ? syncDiagnosticRef(message.clientId) : "invalid",
        snapshotElementCount: Array.isArray(message.snapshot?.elements) ? message.snapshot.elements.length : 0,
        snapshotFileCount: message.snapshot?.files && typeof message.snapshot.files === "object" ? Object.keys(message.snapshot.files).length : 0,
      });
      if (room || typeof message.clientId !== "string" || !ROOM_PATTERN.test(message.roomId)) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.join.rejected", {
          roomRef: typeof message.roomId === "string" ? syncDiagnosticRef(message.roomId) : "invalid",
          clientRef: typeof message.clientId === "string" ? syncDiagnosticRef(message.clientId) : "invalid",
          reason: room ? "socket-already-joined" : typeof message.clientId !== "string" ? "invalid-client-id" : "invalid-room-id",
        });
        serverLogger.warn("Collaboration join rejected", {
          connectionId,
          roomRef: typeof message.roomId === "string" ? syncDiagnosticRef(message.roomId) : "invalid",
          clientRef: typeof message.clientId === "string" ? syncDiagnosticRef(message.clientId) : "invalid",
          reason: room ? "socket-already-joined" : typeof message.clientId !== "string" ? "invalid-client-id" : "invalid-room-id",
        });
        send(socket, { type: "error", ...(typeof message.roomId === "string" ? { roomId: message.roomId } : {}), code: "INVALID_JOIN", phase: "join", message: "Invalid collaboration join." });
        return;
      }

      clientId = message.clientId.slice(0, 64);
      if (terminatedRooms.has(message.roomId)) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.join.rejected", {
          roomRef: syncDiagnosticRef(message.roomId),
          clientRef: syncDiagnosticRef(clientId),
          reason: "room-already-terminated",
        });
        serverLogger.warn("Collaboration join rejected", { connectionId, roomRef: syncDiagnosticRef(message.roomId), clientRef: syncDiagnosticRef(clientId), reason: "room-already-terminated" });
        send(socket, { type: "session-ended", roomId: message.roomId, message: "This collaboration session is no longer available." });
        socket.close(1000, "Collaboration session ended");
        return;
      }

      room = rooms.get(message.roomId);
      const hostAuthorizationResult = inspectHostAuthorization(message.hostAuthorizationToken, message.roomId);
      const hostAuthorization = hostAuthorizationResult.authorization;
      let isHost = false;
      let isNewRoom = false;
      if (!room) {
        if (!hostAuthorization) {
          serverLogger.warn("Collaboration host authorization rejected", {
            connectionId,
            roomRef: syncDiagnosticRef(message.roomId),
            clientRef: syncDiagnosticRef(clientId),
            reason: hostAuthorizationResult.reason,
            hostCredentialPresent: typeof message.hostAuthorizationToken === "string" && message.hostAuthorizationToken.length > 0,
            hostCredentialLength: typeof message.hostAuthorizationToken === "string" ? message.hostAuthorizationToken.length : 0,
            serverSecretConfigured: typeof process.env.COLLAB_HOST_TOKEN_SECRET === "string" && process.env.COLLAB_HOST_TOKEN_SECRET.length > 0,
            serverSecretLengthValid: Buffer.byteLength(process.env.COLLAB_HOST_TOKEN_SECRET || "", "utf8") >= 32,
          });
          send(socket, { type: "error", roomId: message.roomId, code: "HOST_AUTHORIZATION_REJECTED", phase: "join", message: "Collaboration hosting authorization was rejected. Check the auth service and collaboration server host-token secret configuration, then try again." });
          socket.close(1008, "Host authorization required");
          return;
        }
        const name = typeof message.sessionName === "string" ? message.sessionName.trim() : "";
        if (!name || name.length > MAX_ROOM_NAME_LENGTH) {
          if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.join.rejected", {
            roomRef: syncDiagnosticRef(message.roomId),
            clientRef: syncDiagnosticRef(clientId),
            reason: !name ? "missing-session-name" : "session-name-too-long",
            sessionNameLength: name.length,
          });
          serverLogger.warn("Collaboration join rejected", { connectionId, roomRef: syncDiagnosticRef(message.roomId), clientRef: syncDiagnosticRef(clientId), reason: !name ? "missing-session-name" : "session-name-too-long", sessionNameLength: name.length });
          send(socket, { type: "error", roomId: message.roomId, code: "SESSION_NAME_INVALID", phase: "join", message: "A collaboration name is required to create a session." });
          socket.close(1008, "Collaboration name required");
          return;
        }
        room = { id: message.roomId, name, clients: new Set(), elements: new Map(), files: new Map(), authorship: new Map(), permissions: new Map(), pendingRequests: new Map(), presence: new Map(), host: null, hostSubject: hostAuthorization.subject, hostName: hostAuthorization.name, terminated: false, hostRecoveryTimer: null, hostDisconnectedAt: null, hostRecoveryDeadline: null, chatMessages: [], chatRate: new Map() };
        isHost = true;
        isNewRoom = true;
      }

      const previousSocket = Array.from(room.clients).find((candidate) => candidate.__sketchiziClientId === clientId);
      const reconnectingHost = room.host === previousSocket || room.host?.__sketchiziClientId === clientId;
      const authorizedHostReconnect = Boolean(hostAuthorization && room.hostSubject === hostAuthorization.subject && (!room.host || room.host.readyState !== 1));
      if (authorizedHostReconnect) isHost = true;
      if (previousSocket && previousSocket !== socket) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.participant.reconnectSocketReplaced", {
          roomRef: syncDiagnosticRef(room.id),
          clientRef: syncDiagnosticRef(clientId),
          wasHost: reconnectingHost,
        });
        previousSocket.__sketchiziReplaced = true;
        room.clients.delete(previousSocket);
        try { previousSocket.close(4001, "Reconnected"); } catch {}
      }

      try {
        // The first client seeds an empty room from its current local scene.
        if (room.clients.size === 0) {
          mergeSnapshot(room, message.snapshot?.elements || [], message.snapshot?.files || {}, clientId);
        }
      } catch (error) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.join.rejected", {
          roomRef: syncDiagnosticRef(room.id),
          clientRef: syncDiagnosticRef(clientId),
          reason: error?.reason || error?.code || error?.message || "invalid-initial-state",
          invalidFileRef: error?.fileRef || "none",
          invalidFileIndex: Number.isInteger(error?.fileIndex) ? error.fileIndex : -1,
        });
        serverLogger.error("Collaboration initial snapshot rejected", error, {
          connectionId,
          roomRef: syncDiagnosticRef(message.roomId),
          clientRef: syncDiagnosticRef(clientId),
          errorName: error?.name || "Error",
          errorCode: error?.code || "INITIAL_SNAPSHOT_REJECTED",
          rejectionReason: error?.reason || error?.code || "invalid-initial-state",
          invalidFileRef: error?.fileRef || "none",
          invalidFileIndex: Number.isInteger(error?.fileIndex) ? error.fileIndex : -1,
          invalidFileKeyPresent: typeof error?.fileKeyPresent === "boolean" ? error.fileKeyPresent : null,
          invalidFileIdPresent: typeof error?.fileIdPresent === "boolean" ? error.fileIdPresent : null,
          invalidFileIdType: error?.fileIdType || "unknown",
          invalidFileIdLength: Number.isInteger(error?.fileIdLength) ? error.fileIdLength : -1,
          invalidFileKeyMatchesId: typeof error?.fileKeyMatchesId === "boolean" ? error.fileKeyMatchesId : null,
          snapshotElementCount: Array.isArray(message.snapshot?.elements) ? message.snapshot.elements.length : 0,
          snapshotFileCount: message.snapshot?.files && typeof message.snapshot.files === "object" ? Object.keys(message.snapshot.files).length : 0,
          errorMessage: String(error?.message || "Invalid initial state").slice(0, 240),
        });
        send(socket, { type: "error", roomId: message.roomId, code: error?.code || "INITIAL_SNAPSHOT_REJECTED", phase: "join", message: error.message });
        socket.close(1008, "Invalid initial state");
        return;
      }

      // Do not publish a brand-new room until its initial scene and files pass
      // validation. Otherwise a rejected snapshot can leave behind an empty,
      // unhosted room that later join attempts may incorrectly reuse.
      if (isNewRoom) {
        rooms.set(room.id, room);
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.room.created", { roomRef: syncDiagnosticRef(room.id), clientRef: syncDiagnosticRef(clientId) });
        serverLogger.info("Collaboration room created", { connectionId, roomRef: syncDiagnosticRef(room.id), clientRef: syncDiagnosticRef(clientId), hostAuthorizationVerified: true });
      }
      room.clients.add(socket);
      socket.__sketchiziClientId = clientId;
      if (isHost || reconnectingHost) {
        room.host = socket;
        if (room.hostRecoveryTimer) clearTimeout(room.hostRecoveryTimer);
        room.hostRecoveryTimer = null;
        const wasRecoveringHost = Boolean(room.hostDisconnectedAt);
        room.hostDisconnectedAt = null;
        room.hostRecoveryDeadline = null;
        if (wasRecoveringHost) broadcast(room, socket, { type: "host-reconnected", roomId: room.id });
      }
      const permission = socket === room.host ? "host" : (room.permissions.get(clientId) || "viewer");
      room.permissions.set(clientId, permission);
      const previousPresence = room.presence.get(clientId);
      const verifiedPresence = socket === room.host && room.hostSubject
        ? { ...(message.presence || {}), displayName: room.hostName }
        : message.presence;
      room.presence.set(clientId, sanitizePresence(clientId, verifiedPresence, previousPresence, permission));
      const requestState = room.pendingRequests.has(clientId) ? "pending" : (previousPresence?.permission === "editor" || permission === "editor" ? "approved" : "none");
      const snapshot = roomSnapshot(room);
      const chatHistory = filterAuthorizedChatHistory(room.chatMessages, clientId, socket === room.host);
      send(socket, {
        type: "joined",
        roomId: room.id,
        clientId,
        role: socket === room.host ? "host" : "joinee",
        permission,
        requestState,
        presence: room.clients.size,
        ...snapshot,
        chatHistory,
      });
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.join.accepted", {
        roomRef: syncDiagnosticRef(room.id),
        clientRef: syncDiagnosticRef(clientId),
        role: socket === room.host ? "host" : "joinee",
        permission,
        isReconnect: Boolean(previousSocket || (previousPresence && previousPresence.status === "disconnected")),
        clientCount: room.clients.size,
        snapshotElementCount: snapshot.elements.length,
        snapshotFileCount: Object.keys(snapshot.files).length,
        participantCount: snapshot.participants.length,
        authorizedChatHistoryCount: chatHistory.length,
        durationMs: Math.max(0, syncDiagnosticNow() - receivedAt),
      });
      serverLogger.info("Collaboration participant joined", { connectionId, roomRef: syncDiagnosticRef(room.id), clientRef: syncDiagnosticRef(clientId), role: socket === room.host ? "host" : "joinee", permission, participantCount: room.clients.size, snapshotElementCount: snapshot.elements.length, snapshotFileCount: Object.keys(snapshot.files).length });
      broadcast(room, socket, { type: "presence", roomId: room.id, count: room.clients.size, participants: Array.from(room.presence.values()) });
      return;
    }

    if (!room || message.roomId !== room.id || message.clientId !== clientId) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.message.rejected", {
        roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined",
        clientRef: clientId ? syncDiagnosticRef(clientId) : "unjoined",
        messageType: message?.type || "unknown",
        reason: "not-joined-to-room-or-identity-mismatch",
      });
      serverLogger.warn("Collaboration message rejected", { connectionId, roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined", clientRef: clientId ? syncDiagnosticRef(clientId) : "unjoined", messageType: message?.type || "unknown", reason: "not-joined-to-room-or-identity-mismatch" });
      send(socket, { type: "error", ...(typeof message?.roomId === "string" ? { roomId: message.roomId } : {}), code: "NOT_JOINED", phase: "message", message: "Not joined to a valid room." });
      return;
    }

    if (message.type === "leave") {
      serverLogger.info("Collaboration participant left", { roomId: room.id, clientId });
      removeClient(room, socket, { intentional: true });
      room = null;
      return;
    }

    if (message.type === "terminate") {
      if (socket !== room.host) {
        send(socket, { type: "error", message: "Only the host can disconnect the collaboration session." });
        return;
      }
      serverLogger.info("Collaboration room terminated", { roomId: room.id, clientId });
      terminateRoom(room);
      room = null;
      return;
    }

    if (message.type === "permission:request") {
      const permission = room.permissions.get(clientId) || "viewer";
      if (permission !== "viewer") return;
      if (room.pendingRequests.has(clientId)) return;
      room.pendingRequests.set(clientId, { participantId: clientId, requestedAt: Date.now() });
      serverLogger.info("Collaboration edit request created", { roomId: room.id, clientId });
      const requester = room.presence.get(clientId);
      if (room.host && room.host.readyState === 1) {
        send(room.host, { type: "permission:request", roomId: room.id, requester: requester ? { ...requester, permission: "viewer" } : { participantId: clientId, displayName: "Guest", color: "#7c3aed", permission: "viewer" } });
      }
      return;
    }

    if (message.type === "permission:decision") {
      if (socket !== room.host) {
        send(socket, { type: "error", message: "Only the host can approve or deny edit requests." });
        return;
      }
      const participantId = typeof message.participantId === "string" ? message.participantId : "";
      const decision = message.decision;
      if (!participantId || !["approve", "deny"].includes(decision)) return;
      const target = Array.from(room.clients).find((candidate) => candidate.__sketchiziClientId === participantId);
      if (!target) { room.pendingRequests.delete(participantId); return; }
      if (decision === "approve") room.permissions.set(participantId, "editor");
      else room.permissions.set(participantId, "viewer");
      room.pendingRequests.delete(participantId);
      serverLogger.info("Collaboration edit request decided", { roomId: room.id, participantId, decision });
      const participant = room.presence.get(participantId);
      const nextPresence = participant ? { ...participant, permission: room.permissions.get(participantId) } : null;
      if (nextPresence) room.presence.set(participantId, nextPresence);
      send(target, { type: "permission:result", roomId: room.id, participantId, decision, permission: room.permissions.get(participantId), requestState: decision === "approve" ? "approved" : "denied" });
      broadcast(room, null, { type: "permission:update", roomId: room.id, clientId: participantId, permission: room.permissions.get(participantId), requestState: decision === "approve" ? "approved" : "denied", presence: nextPresence || undefined });
      return;
    }

    if (message.type === "permission:revoke") {
      if (socket !== room.host) {
        send(socket, { type: "error", message: "Only the host can revoke edit access." });
        return;
      }
      const participantId = typeof message.participantId === "string" ? message.participantId : "";
      if (!participantId || participantId === room.host.__sketchiziClientId) return;
      const target = Array.from(room.clients).find((candidate) => candidate.__sketchiziClientId === participantId);
      if (!target) return;
      room.permissions.set(participantId, "viewer");
      room.pendingRequests.delete(participantId);
      serverLogger.info("Collaboration edit access revoked", { roomId: room.id, participantId });
      const participant = room.presence.get(participantId);
      const nextPresence = participant ? { ...participant, permission: "viewer" } : null;
      if (nextPresence) room.presence.set(participantId, nextPresence);
      send(target, { type: "permission:result", roomId: room.id, participantId, decision: "revoke", permission: "viewer", requestState: "none" });
      broadcast(room, null, { type: "permission:update", roomId: room.id, clientId: participantId, permission: "viewer", requestState: "none", presence: nextPresence || undefined });
      return;
    }

    if (message.type === "chat:send") {
      if (room.terminated || !room.clients.has(socket) || !allowChatRate(room, clientId)) {
        send(socket, { type: "chat:error", roomId: room.id, message: "Chat rate limit reached or room unavailable." });
        return;
      }
      const text = normalizeChatText(message.text);
      const audience = message.audience;
      if (!text || !isSupportedChatAudience(audience)) {
        send(socket, { type: "chat:error", roomId: room.id, message: `Messages must contain 1–${MAX_CHAT_TEXT_LENGTH} characters and use a supported audience.` });
        return;
      }
      const senderId = socket.__sketchiziClientId;
      const senderPresence = room.presence.get(senderId);
      if (!senderPresence) return;
      const isHost = socket === room.host;
      const hostId = room.host?.__sketchiziClientId || "";
      const requestedRecipientId = typeof message.recipientId === "string" ? message.recipientId : "";
      const delivery = resolveChatRecipients({
        audience,
        isHost,
        senderId,
        hostId,
        requestedRecipientId,
        connectedParticipantIds: Array.from(room.clients, (client) => client.__sketchiziClientId),
        presentParticipantIds: Array.from(room.presence.keys()),
      });
      if (delivery.error) {
        send(socket, { type: "chat:error", roomId: room.id, message: delivery.error });
        return;
      }
      const { recipientIds, conversationId } = delivery;
      const chatMessage = {
        type: "chat:message",
        roomId: room.id,
        message: makeChatHistoryEntry({
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
          senderId,
          senderName: senderPresence.displayName,
          audience,
          conversationId,
          text,
          timestamp: Date.now(),
        }),
      };
      room.chatMessages.push(chatMessage.message);
      if (room.chatMessages.length > MAX_CHAT_HISTORY) room.chatMessages.splice(0, room.chatMessages.length - MAX_CHAT_HISTORY);
      deliverChat(room, chatMessage, recipientIds);
      return;
    }

    if (message.type === "presence:update") {
      const current = room.presence.get(clientId);
      const next = sanitizePresence(clientId, message.presence || {}, current);
      room.presence.set(clientId, next);
      broadcastPresence(room, socket, { type: "presence:update", roomId: room.id, clientId, presence: next });
      return;
    }

    if (message.type === "update") {
      const updateStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
      if (diagnosticsEnabled) recordSyncDiagnostic("server.sceneUpdate.received", {
        roomRef: syncDiagnosticRef(room.id),
        clientRef: syncDiagnosticRef(clientId),
        incomingElementCount: Array.isArray(message.elements) ? message.elements.length : 0,
        incomingFileCount: Array.isArray(message.files) ? message.files.length : message.files && typeof message.files === "object" ? Object.keys(message.files).length : 0,
        incomingDeletedCount: Array.isArray(message.elements) ? message.elements.filter((element) => element?.isDeleted).length : 0,
        roomElementCountBefore: room.elements.size,
        roomFileCountBefore: room.files.size,
      });
      const permission = room.permissions.get(clientId) || (socket === room.host ? "host" : "viewer");
      if (permission !== "host" && permission !== "editor") {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.sceneUpdate.rejected", {
          roomRef: syncDiagnosticRef(room.id),
          clientRef: syncDiagnosticRef(clientId),
          reason: "read-only-participant",
          permission,
        });
        serverLogger.warn("Collaboration update rejected for read-only participant", { roomId: room.id, clientId });
        send(socket, { type: "permission:rejected", roomId: room.id, message: "You are currently read-only." });
        return;
      }
      let accepted;
      try {
        accepted = mergeSnapshot(room, message.elements || [], message.files || [], clientId);
      } catch (error) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.sceneUpdate.rejected", {
          roomRef: syncDiagnosticRef(room.id),
          clientRef: syncDiagnosticRef(clientId),
          reason: error?.message || "merge-error",
          durationMs: Math.max(0, syncDiagnosticNow() - updateStartedAt),
          roomElementCountAfter: room.elements.size,
          roomFileCountAfter: room.files.size,
        });
        serverLogger.error("Collaboration scene update rejected", error, {
          connectionId,
          roomRef: syncDiagnosticRef(room.id),
          clientRef: syncDiagnosticRef(clientId),
          errorCode: error?.code || "SCENE_UPDATE_REJECTED",
          rejectionReason: error?.reason || error?.code || "scene-update-invalid",
          invalidFileRef: error?.fileRef || "none",
          invalidFileIndex: Number.isInteger(error?.fileIndex) ? error.fileIndex : -1,
          invalidFileKeyPresent: typeof error?.fileKeyPresent === "boolean" ? error.fileKeyPresent : null,
          invalidFileIdPresent: typeof error?.fileIdPresent === "boolean" ? error.fileIdPresent : null,
          invalidFileIdType: error?.fileIdType || "unknown",
          invalidFileIdLength: Number.isInteger(error?.fileIdLength) ? error.fileIdLength : -1,
          invalidFileKeyMatchesId: typeof error?.fileKeyMatchesId === "boolean" ? error.fileKeyMatchesId : null,
          incomingElementCount: Array.isArray(message.elements) ? message.elements.length : 0,
          incomingFileCount: Array.isArray(message.files) ? message.files.length : message.files && typeof message.files === "object" ? Object.keys(message.files).length : 0,
          errorMessage: String(error?.message || "Invalid scene update").slice(0, 240),
        });
        send(socket, { type: "error", roomId: room.id, code: error?.code || "SCENE_UPDATE_REJECTED", phase: "update", message: error.message });
        return;
      }

      if (!accepted.elements.length && !accepted.files.length) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.sceneUpdate.skippedNoChanges", {
          roomRef: syncDiagnosticRef(room.id),
          clientRef: syncDiagnosticRef(clientId),
          incomingElementCount: Array.isArray(message.elements) ? message.elements.length : 0,
          incomingFileCount: Array.isArray(message.files) ? message.files.length : 0,
          durationMs: Math.max(0, syncDiagnosticNow() - updateStartedAt),
        });
        return;
      }
      broadcast(room, socket, {
        type: "update",
        roomId: room.id,
        clientId,
        elements: accepted.elements,
        files: accepted.files,
        authorship: accepted.authorship,
      });
      if (Object.keys(accepted.authorship).length) send(socket, { type: "authorship:update", roomId: room.id, authorship: accepted.authorship });
      if (diagnosticsEnabled) recordSyncDiagnostic("server.sceneUpdate.completed", {
        roomRef: syncDiagnosticRef(room.id),
        clientRef: syncDiagnosticRef(clientId),
        acceptedElementCount: accepted.elements.length,
        acceptedDeletedElementCount: accepted.elements.filter((element) => element.isDeleted).length,
        acceptedFileCount: accepted.files.length,
        authorshipCount: Object.keys(accepted.authorship).length,
        roomElementCountAfter: room.elements.size,
        roomFileCountAfter: room.files.size,
        durationMs: Math.max(0, syncDiagnosticNow() - updateStartedAt),
      });
    }
  });

  socket.on("close", (code, reason) => {
    const closeReason = Buffer.isBuffer(reason) ? reason.toString("utf8").slice(0, 160) : String(reason || "").slice(0, 160);
    serverLogger.info("Collaboration WebSocket closed", {
      connectionId,
      roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined",
      clientRef: socket.__sketchiziClientId ? syncDiagnosticRef(socket.__sketchiziClientId) : "unjoined",
      wasJoined: Boolean(room),
      closeCode: code,
      closeReason,
      lifetimeMs: Math.max(0, Date.now() - connectedAt),
      roomClientCount: room?.clients.size ?? 0,
    });
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.websocket.closed", {
      roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined",
      clientRef: socket.__sketchiziClientId ? syncDiagnosticRef(socket.__sketchiziClientId) : "unjoined",
      closeCode: code,
      closeReason,
      connectionId,
      roomClientCount: room?.clients.size ?? 0,
    });
    if (room && !socket.__sketchiziReplaced) removeClient(room, socket);
  });
  socket.on("error", (error) => {
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("server.websocket.error", {
      roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined",
      clientRef: socket.__sketchiziClientId ? syncDiagnosticRef(socket.__sketchiziClientId) : "unjoined",
      errorName: error?.name || "WebSocketError",
    });
    serverLogger.warn("Collaboration WebSocket socket error", { connectionId, roomRef: room?.id ? syncDiagnosticRef(room.id) : "unjoined", clientRef: socket.__sketchiziClientId ? syncDiagnosticRef(socket.__sketchiziClientId) : "unjoined", errorName: error?.name || "WebSocketError", errorCode: error?.code || "unknown", errorMessage: String(error?.message || "WebSocket error").slice(0, 180) });
    if (room && !socket.__sketchiziReplaced) removeClient(room, socket);
  });
});

wss.on("wsClientError", (error, socket, request) => {
  let requestPath = "unknown";
  let originHost = "none";
  try { requestPath = new URL(request?.url || "/", "http://localhost").pathname; } catch {}
  try { originHost = request?.headers?.origin ? new URL(request.headers.origin).host : "none"; } catch { originHost = "invalid-origin"; }
  serverLogger.warn("Collaboration WebSocket handshake rejected", {
    upgradeId: request?.__sketchiziUpgradeId || "unknown",
    path: requestPath,
    originHost,
    errorName: error?.name || "Error",
    errorCode: error?.code || "unknown",
    errorMessage: String(error?.message || "WebSocket handshake rejected").slice(0, 180),
  });
  if (socket?.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

wss.on("error", (error) => {
  serverLogger.error("Collaboration WebSocket server error", error, { port: PORT });
});

httpServer.listen(PORT, () => {
  const secret = process.env.COLLAB_HOST_TOKEN_SECRET || "";
  serverLogger.info("Sketchizi collaboration server listening", {
    port: PORT,
    websocketPath: "/collaboration",
    hostAuthorizationSecretConfigured: secret.length > 0,
    hostAuthorizationSecretLengthValid: Buffer.byteLength(secret, "utf8") >= 32,
    syncDiagnosticsEnabled: syncDiagnosticsEnabled(),
    logLevel: String(process.env.SKETCHIZI_LOG_LEVEL || "info").toLowerCase(),
  });
});
