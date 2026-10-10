import { logger } from "./logging/logger";
import {
  measureSyncDiagnostic,
  recordSyncDiagnostic,
  summarizeSyncMessage,
  summarizeSyncRecords,
  syncDiagnosticNow,
  syncDiagnosticRef,
  syncDiagnosticsEnabled,
  syncUtf8ByteLength,
} from "./features/collaboration/syncDiagnostics";

const ROOM_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const CLIENT_KEY = "sketchizi-collaboration-client-id";
const DISPLAY_NAME_KEY = "sketchizi-collaboration-display-name";
const PRESENCE_CURSOR_INTERVAL = 50;
const PRESENCE_NAME_MAX = 48;
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const COLLAB_BACKPRESSURE_HIGH_WATER_MARK = 256 * 1024;
const COLLAB_BACKPRESSURE_RETRY_MS = 16;

function randomId(length = 24) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function getClientId() {
  try {
    const saved = localStorage.getItem(CLIENT_KEY);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const id = randomId(24);
    localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return randomId(24);
  }
}

export function getCollaborationClientId() {
  return getClientId();
}

export function getCollaborationDisplayName() {
  try {
    const saved = localStorage.getItem(DISPLAY_NAME_KEY);
    return typeof saved === "string" ? saved.trim().slice(0, PRESENCE_NAME_MAX) : "";
  } catch {
    return "";
  }
}

export function saveCollaborationDisplayName(name) {
  const normalized = String(name || "").trim().slice(0, PRESENCE_NAME_MAX);
  try {
    if (normalized) localStorage.setItem(DISPLAY_NAME_KEY, normalized);
  } catch {}
  return normalized;
}

const PRESENCE_COLORS = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#4f46e5"];

function colorForParticipant(clientId) {
  let hash = 0;
  for (const char of String(clientId || "")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

function normalizePresence(presence, clientId) {
  const source = presence && typeof presence === "object" ? presence : {};
  const displayName = String(source.displayName || "Guest").trim().slice(0, PRESENCE_NAME_MAX) || "Guest";
  return {
    participantId: clientId,
    displayName,
    color: /^#[0-9a-fA-F]{6}$/.test(source.color || "") ? source.color : colorForParticipant(clientId),
    cursor: source.cursor && Number.isFinite(source.cursor.x) && Number.isFinite(source.cursor.y)
      ? { x: source.cursor.x, y: source.cursor.y }
      : null,
    activity: ["idle", "drawing", "editing/moving"].includes(source.activity) ? source.activity : "idle",
    selectedElementIds: Array.isArray(source.selectedElementIds) ? source.selectedElementIds.filter((id) => typeof id === "string").slice(0, 100) : [],
    status: ["connected", "reconnecting", "disconnected"].includes(source.status) ? source.status : "connected",
    permission: ["host", "editor", "viewer"].includes(source.permission) ? source.permission : "viewer",
  };
}

export function getCollaborationRoomId() {
  const match = window.location.pathname.match(/^\/collab\/([A-Za-z0-9_-]+)\/?$/);
  return match?.[1] && ROOM_PATTERN.test(match[1]) ? match[1] : null;
}

export function createCollaborationRoomId() {
  return randomId(24);
}

export function getCollaborationLink(roomId) {
  return `${window.location.origin}/collab/${encodeURIComponent(roomId)}`;
}

function safeJsonSize(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function elementSignature(element) {
  if (!element) return "";
  return [
    element.id,
    element.version,
    element.versionNonce,
    element.isDeleted ? 1 : 0,
  ].join(":");
}

function fileSignature(file) {
  if (!file) return "";
  return [file.id, file.version, file.dataURL?.length || 0].join(":");
}

export class SketchiziCollaboration {
  constructor({
    roomId,
    sessionName,
    hostAuthorizationToken = "",
    hostAuthorizationTokenProvider = null,
    api,
    onState,
    onPresence,
    onStatus,
    onError,
    onRole,
    onSessionInfo,
    onSessionEnded,
    onPermission,
    onPermissionRequest,
    onAuthorship,
    onChatMessage,
    onChatHistory,
    onChatError,
  }) {
    if (!ROOM_PATTERN.test(roomId)) throw new Error("Invalid collaboration room.");
    this.roomId = roomId;
    this.sessionName = typeof sessionName === "string" ? sessionName.trim() : "";
    this.hostAuthorizationToken = typeof hostAuthorizationToken === "string" ? hostAuthorizationToken : "";
    this.hostAuthorizationTokenProvider = typeof hostAuthorizationTokenProvider === "function" ? hostAuthorizationTokenProvider : null;
    this.api = api;
    this.clientId = getClientId();
    this.onState = onState;
    this.onPresence = onPresence;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onRole = onRole;
    this.onSessionInfo = onSessionInfo;
    this.onSessionEnded = onSessionEnded;
    this.onPermission = onPermission;
    this.onPermissionRequest = onPermissionRequest;
    this.onAuthorship = onAuthorship;
    this.onChatMessage = onChatMessage;
    this.onChatHistory = onChatHistory;
    this.onChatError = onChatError;
    this.displayName = getCollaborationDisplayName() || "Guest";
    this.color = colorForParticipant(this.clientId);
    this.role = null;
    this.permission = null;
    this.requestState = "none";
    this.authorship = new Map();
    this.presence = [];
    this.localPresence = normalizePresence({ displayName: this.displayName, color: this.color }, this.clientId);
    this.lastCursorSentAt = 0;
    this.pendingCursor = null;
    this.cursorTimer = null;
    this.lastSelectionSignature = "";
    this.lastPresenceSignature = "";
    this.activityTimer = null;

    this.socket = null;
    this.closed = false;
    this.joined = false;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.lastElements = new Map();
    this.lastFiles = new Map();
    this.hasInitialized = false;
    this.pendingElements = new Map();
    this.pendingFiles = new Map();
    this.flushFrame = null;
    this.backpressureTimer = null;
    this.syncDiagnosticDeferredAt = null;
  }

  connect() {
    this.closed = false;
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.connection.requested", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      reconnectAttempt: this.reconnectAttempt,
      previouslyInitialized: this.hasInitialized,
    });
    logger.info("Collaboration connection requested", { category: "collaboration", roomId: this.roomId, clientId: this.clientId });
    this.openSocket();
  }

  close() {
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.connection.closeRequested", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      wasJoined: this.joined,
      readyState: this.socket?.readyState ?? null,
      pendingElementCount: this.pendingElements.size,
      pendingFileCount: this.pendingFiles.size,
    });
    this.cancelPendingFlush();
    this.cancelBackpressureRetry();
    this.cancelPresenceCursor();
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    this.pendingElements.clear();
    this.pendingFiles.clear();
    this.syncDiagnosticDeferredAt = null;
    this.authorship.clear();
    this.onAuthorship?.({});
    this.permission = null;
    this.requestState = "none";
    this.closed = true;
    this.joined = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.onStatus?.("disconnected");
  }

  leave() {
    logger.info("Collaboration leave requested", { category: "collaboration", roomId: this.roomId, clientId: this.clientId });
    if (this.joined) {
      this.flushPendingUpdates({ force: true });
      this.send({ type: "leave", roomId: this.roomId, clientId: this.clientId });
    }
    this.close();
  }

  disconnect() {
    logger.info("Collaboration end requested", { category: "collaboration", roomId: this.roomId, clientId: this.clientId });
    if (this.joined) {
      this.flushPendingUpdates({ force: true });
      this.send({ type: "terminate", roomId: this.roomId, clientId: this.clientId });
    }
    this.close();
  }

  requestEditAccess() {
    if (!this.joined || this.permission !== "viewer" || this.requestState === "pending") return false;
    const sent = this.send({ type: "permission:request", roomId: this.roomId, clientId: this.clientId });
    if (sent) {
      logger.info("Collaboration edit request sent", { category: "collaboration", roomId: this.roomId, clientId: this.clientId });
      this.requestState = "pending";
      this.onPermission?.({ permission: this.permission, requestState: this.requestState });
    }
    return sent;
  }

  decideEditRequest(participantId, decision) {
    if (!this.joined || this.role !== "host" || !participantId || !["approve", "deny"].includes(decision)) return false;
    logger.info("Collaboration edit request decided", { category: "collaboration", roomId: this.roomId, clientId: this.clientId, decision });
    return this.send({ type: "permission:decision", roomId: this.roomId, clientId: this.clientId, participantId, decision });
  }

  revokeEditAccess(participantId) {
    if (!this.joined || this.role !== "host" || !participantId || participantId === this.clientId) return false;
    logger.info("Collaboration edit access revoked", { category: "collaboration", roomId: this.roomId, clientId: this.clientId });
    return this.send({ type: "permission:revoke", roomId: this.roomId, clientId: this.clientId, participantId });
  }

  sendChatMessage(text, audience = "everyone", recipientId = null) {
    if (!this.joined || !["everyone", "host"].includes(audience)) return false;
    const normalized = String(text || "").trim();
    if (!normalized || normalized.length > 4000) return false;
    return this.send({
      type: "chat:send",
      roomId: this.roomId,
      clientId: this.clientId,
      text: normalized,
      audience,
      ...(recipientId ? { recipientId } : {}),
    });
  }

  updateLocalAuthorship(elements) {
    let changed = false;
    for (const element of elements || []) {
      if (!element?.id) continue;
      const signature = elementSignature(element);
      if (this.lastElements.get(element.id) === signature) continue;
      const current = this.authorship.get(element.id);
      if (!current && !element.isDeleted) {
        this.authorship.set(element.id, { createdBy: this.clientId, lastModifiedBy: this.clientId });
        changed = true;
      } else if (current && current.lastModifiedBy !== this.clientId) {
        this.authorship.set(element.id, { ...current, lastModifiedBy: this.clientId });
        changed = true;
      }
    }
    if (changed) this.onAuthorship?.(Object.fromEntries(this.authorship));
  }

  updatePresence(patch = {}) {
    const next = normalizePresence({ ...this.localPresence, ...patch, participantId: this.clientId }, this.clientId);
    this.localPresence = next;
    if (!this.joined) return;
    const signature = [next.displayName, next.color, next.activity, next.selectedElementIds.join(",")].join("|");
    if (signature === this.lastPresenceSignature && !Object.prototype.hasOwnProperty.call(patch, "cursor")) return;
    this.lastPresenceSignature = signature;
    this.send({
      type: "presence:update",
      roomId: this.roomId,
      clientId: this.clientId,
      presence: {
        displayName: next.displayName,
        color: next.color,
        activity: next.activity,
        selectedElementIds: next.selectedElementIds,
        ...(next.cursor ? { cursor: next.cursor } : { cursor: null }),
      },
    });
  }

  updateCursor(cursor) {
    if (cursor === null) {
      this.cancelPresenceCursor();
      this.localPresence = { ...this.localPresence, cursor: null };
      if (this.joined) this.send({ type: "presence:update", roomId: this.roomId, clientId: this.clientId, presence: { cursor: null } });
      return;
    }
    if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return;
    this.pendingCursor = { x: cursor.x, y: cursor.y };
    const now = performance.now?.() ?? Date.now();
    const elapsed = now - this.lastCursorSentAt;
    if (elapsed >= PRESENCE_CURSOR_INTERVAL) {
      this.flushCursor();
      return;
    }
    if (this.cursorTimer === null) {
      this.cursorTimer = setTimeout(() => { this.cursorTimer = null; this.flushCursor(); }, PRESENCE_CURSOR_INTERVAL - elapsed);
    }
  }

  flushCursor() {
    if (!this.pendingCursor || !this.joined) return;
    const cursor = this.pendingCursor;
    this.pendingCursor = null;
    this.lastCursorSentAt = performance.now?.() ?? Date.now();
    this.localPresence = { ...this.localPresence, cursor };
    this.send({ type: "presence:update", roomId: this.roomId, clientId: this.clientId, presence: { cursor } });
  }

  cancelPresenceCursor() {
    if (this.cursorTimer !== null) clearTimeout(this.cursorTimer);
    this.cursorTimer = null;
    this.pendingCursor = null;
  }

  openSocket() {
    if (this.closed) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const configured = import.meta.env.VITE_COLLAB_WS_URL;
    const wsUrl = configured || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/collaboration`;
    this.onStatus?.("connecting");
    logger.debug("Collaboration socket connecting", { category: "collaboration", roomId: this.roomId, clientId: this.clientId });
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.websocket.connecting", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      reconnectAttempt: this.reconnectAttempt,
      urlProtocol: wsUrl.startsWith("wss:") ? "wss" : "ws",
    });

    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onopen = async () => {
      const isReconnect = this.reconnectAttempt > 0;
      this.reconnectAttempt = 0;
      logger.debug("Collaboration socket connected", { category: "collaboration", roomId: this.roomId });
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.websocket.open", {
        roomRef: syncDiagnosticRef(this.roomId),
        clientRef: syncDiagnosticRef(this.clientId),
        hasInitialized: this.hasInitialized,
      });
      if (isReconnect && this.hostAuthorizationTokenProvider) {
        try {
          const refreshed = await this.hostAuthorizationTokenProvider();
          if (this.closed || this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
          this.hostAuthorizationToken = refreshed.token;
          this.displayName = refreshed.name;
        } catch {
          this.fail("Your sign-in session could not be verified to reconnect as host. Sign in again and restart hosting if needed.");
          return;
        }
      }
      if (this.closed || this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      this.send({
        type: "join",
        roomId: this.roomId,
        clientId: this.clientId,
        sessionName: this.sessionName,
        hostAuthorizationToken: this.hostAuthorizationToken,
        snapshot: this.snapshot(),
        presence: { displayName: this.displayName, color: this.color },
      });
    };

    socket.onmessage = (event) => {
      const diagnosticsEnabled = syncDiagnosticsEnabled();
      const receivedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_BYTES) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.websocket.messageRejected", {
          roomRef: syncDiagnosticRef(this.roomId),
          reason: typeof event.data !== "string" ? "non-text" : "message-too-large",
          payloadLength: typeof event.data === "string" ? event.data.length : null,
        });
        this.fail("The collaboration server sent an invalid message.");
        return;
      }
      let message;
      const parseStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
      try {
        message = JSON.parse(event.data);
      } catch {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.websocket.messageRejected", {
          roomRef: syncDiagnosticRef(this.roomId),
          reason: "malformed-json",
          payloadBytes: diagnosticsEnabled ? syncUtf8ByteLength(event.data) : null,
        });
        this.fail("The collaboration server sent malformed data.");
        return;
      }
      if (diagnosticsEnabled) recordSyncDiagnostic("client.websocket.messageReceived", {
        roomRef: syncDiagnosticRef(this.roomId),
        clientRef: syncDiagnosticRef(this.clientId),
        ...summarizeSyncMessage(message),
        payloadBytes: syncUtf8ByteLength(event.data),
        parseDurationMs: Math.max(0, syncDiagnosticNow() - parseStartedAt),
      });
      const handleStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
      this.handleMessage(message);
      if (diagnosticsEnabled) recordSyncDiagnostic("client.websocket.messageHandled", {
        roomRef: syncDiagnosticRef(this.roomId),
        messageType: message?.type || "unknown",
        durationMs: Math.max(0, syncDiagnosticNow() - handleStartedAt),
        receiveToHandledMs: Math.max(0, syncDiagnosticNow() - receivedAt),
      });
    };

    socket.onerror = (error) => {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.websocket.error", {
        roomRef: syncDiagnosticRef(this.roomId),
        clientRef: syncDiagnosticRef(this.clientId),
        errorName: error?.type || error?.name || "WebSocketError",
        readyState: socket.readyState,
        bufferedAmount: socket.bufferedAmount,
      });
      logger.error("Collaboration socket error", error, { category: "collaboration", roomId: this.roomId });
      if (!this.closed) this.onStatus?.("reconnecting");
    };

    socket.onclose = (event) => {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.websocket.closed", {
        roomRef: syncDiagnosticRef(this.roomId),
        clientRef: syncDiagnosticRef(this.clientId),
        intentional: this.closed,
        closeCode: event?.code ?? null,
        readyState: socket.readyState,
        pendingElementCount: this.pendingElements.size,
        pendingFileCount: this.pendingFiles.size,
      });
      logger.info("Collaboration socket closed", { category: "collaboration", roomId: this.roomId, intentional: this.closed });
      this.joined = false;
      this.socket = null;
      if (!this.closed) {
        this.presence = this.presence.map((participant) => participant.participantId === this.clientId ? { ...participant, status: "reconnecting" } : participant);
        this.onPresence?.(this.presence);
        this.onStatus?.("reconnecting");
        this.scheduleReconnect();
      }
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.closed) return;
    const delay = Math.min(1000 * (2 ** this.reconnectAttempt), 10000);
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.websocket.reconnectScheduled", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      delayMs: delay,
      reconnectAttempt: this.reconnectAttempt,
    });
    logger.debug("Collaboration reconnect scheduled", { category: "collaboration", roomId: this.roomId, delayMs: delay });
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  fail(message) {
    logger.error("Collaboration error", message, { category: "collaboration", roomId: this.roomId });
    this.onError?.(message);
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sendSkipped", {
        roomRef: syncDiagnosticRef(this.roomId),
        messageType: message?.type || "unknown",
        reason: "socket-not-open",
        readyState: this.socket?.readyState ?? null,
      });
      return false;
    }
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const serializeStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const payload = JSON.stringify(message);
    if (diagnosticsEnabled) recordSyncDiagnostic("client.serialization.completed", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      ...summarizeSyncMessage(message),
      payloadBytes: syncUtf8ByteLength(payload),
      serializationDurationMs: Math.max(0, syncDiagnosticNow() - serializeStartedAt),
      readyState: this.socket.readyState,
      bufferedAmountBefore: this.socket.bufferedAmount,
    });
    if (payload.length > MAX_MESSAGE_BYTES) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sendRejected", {
        roomRef: syncDiagnosticRef(this.roomId),
        messageType: message?.type || "unknown",
        reason: "message-too-large",
        payloadLength: payload.length,
      });
      this.fail("This collaboration update is too large.");
      return false;
    }
    const sendStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    try {
      this.socket.send(payload);
      return true;
    } finally {
      if (diagnosticsEnabled) recordSyncDiagnostic("client.websocket.sendCompleted", {
        roomRef: syncDiagnosticRef(this.roomId),
        messageType: message?.type || "unknown",
        payloadBytes: syncUtf8ByteLength(payload),
        sendCallDurationMs: Math.max(0, syncDiagnosticNow() - sendStartedAt),
        bufferedAmountAfter: this.socket?.bufferedAmount ?? null,
      });
    }
  }

  cancelBackpressureRetry() {
    if (this.backpressureTimer !== null) clearTimeout(this.backpressureTimer);
    this.backpressureTimer = null;
  }

  scheduleBackpressureRetry() {
    if (this.backpressureTimer !== null || this.closed) return;
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.backpressure.retryScheduled", {
      roomRef: syncDiagnosticRef(this.roomId),
      delayMs: COLLAB_BACKPRESSURE_RETRY_MS,
      pendingElementCount: this.pendingElements.size,
      pendingFileCount: this.pendingFiles.size,
      bufferedAmount: this.socket?.bufferedAmount ?? null,
    });
    this.backpressureTimer = setTimeout(() => {
      this.backpressureTimer = null;
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.backpressure.retryFired", {
        roomRef: syncDiagnosticRef(this.roomId),
        pendingElementCount: this.pendingElements.size,
        pendingFileCount: this.pendingFiles.size,
        bufferedAmount: this.socket?.bufferedAmount ?? null,
      });
      this.flushPendingUpdates();
    }, COLLAB_BACKPRESSURE_RETRY_MS);
  }

  sendSceneUpdate(message, { force = false } = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sceneUpdateSendSkipped", {
        roomRef: syncDiagnosticRef(this.roomId),
        reason: "socket-not-open",
        readyState: this.socket?.readyState ?? null,
        force,
      });
      return false;
    }
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const serializeStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const payload = JSON.stringify(message);
    const payloadBytes = diagnosticsEnabled ? syncUtf8ByteLength(payload) : null;
    if (diagnosticsEnabled) recordSyncDiagnostic("client.sceneUpdateSerialized", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      ...summarizeSyncMessage(message),
      payloadBytes,
      serializationDurationMs: Math.max(0, syncDiagnosticNow() - serializeStartedAt),
      bufferedAmount: this.socket.bufferedAmount,
      force,
    });
    if (payload.length > MAX_MESSAGE_BYTES) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sceneUpdateSendRejected", {
        roomRef: syncDiagnosticRef(this.roomId),
        reason: "message-too-large",
        payloadLength: payload.length,
        payloadBytes,
      });
      this.fail("This collaboration update is too large.");
      return false;
    }
    if (!force && this.socket.bufferedAmount > COLLAB_BACKPRESSURE_HIGH_WATER_MARK) {
      if (diagnosticsEnabled && this.syncDiagnosticDeferredAt === null) this.syncDiagnosticDeferredAt = syncDiagnosticNow();
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sceneUpdateDeferred", {
        roomRef: syncDiagnosticRef(this.roomId),
        pendingElementCount: this.pendingElements.size,
        pendingFileCount: this.pendingFiles.size,
        payloadBytes,
        bufferedAmount: this.socket.bufferedAmount,
        highWaterMarkBytes: COLLAB_BACKPRESSURE_HIGH_WATER_MARK,
        force,
      });
      this.scheduleBackpressureRetry();
      return false;
    }
    const sendStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    try {
      this.socket.send(payload);
      if (diagnosticsEnabled) {
        const deferredDurationMs = this.syncDiagnosticDeferredAt === null ? null : Math.max(0, syncDiagnosticNow() - this.syncDiagnosticDeferredAt);
        this.syncDiagnosticDeferredAt = null;
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sceneUpdateSent", {
          roomRef: syncDiagnosticRef(this.roomId),
          ...summarizeSyncMessage(message),
          payloadBytes,
          sendCallDurationMs: Math.max(0, syncDiagnosticNow() - sendStartedAt),
          bufferedAmountAfter: this.socket.bufferedAmount,
          deferredDurationMs,
          force,
        });
      }
      return true;
    } catch (error) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sceneUpdateSendError", {
        roomRef: syncDiagnosticRef(this.roomId),
        errorName: error?.name || "Error",
        payloadBytes,
        bufferedAmount: this.socket?.bufferedAmount ?? null,
      });
      throw error;
    }
  }

  snapshot() {
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const elements = this.api.getSceneElementsIncludingDeleted?.() || this.api.getSceneElements();
    const files = this.api.getFiles?.() || {};
    this.remember(elements, files);
    if (diagnosticsEnabled) recordSyncDiagnostic("client.snapshot.created", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      elementCount: elements.length,
      fileCount: Object.keys(files).length,
      deletedCount: summarizeSyncRecords(elements).deletedCount,
      durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
    });
    return { elements, files };
  }

  remember(elements, files) {
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    this.lastElements = new Map((elements || []).map((element) => [element.id, elementSignature(element)]));
    this.lastFiles = new Map(Object.entries(files || {}).map(([id, file]) => [id, fileSignature(file)]));
    if (diagnosticsEnabled) recordSyncDiagnostic("client.baseline.remembered", {
      roomRef: syncDiagnosticRef(this.roomId),
      elementCount: (elements || []).length,
      fileCount: Object.keys(files || {}).length,
      durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
    });
  }

  syncBaseline(elements, files) {
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const pendingElementsBefore = this.pendingElements.size;
    const pendingFilesBefore = this.pendingFiles.size;
    this.cancelPendingFlush();
    this.cancelBackpressureRetry();
    const pendingElements = new Map(this.pendingElements);
    const pendingFiles = new Map(this.pendingFiles);
    this.remember(elements, files);

    this.pendingElements.clear();
    let pendingElementsRetained = 0;
    for (const [id, element] of pendingElements) {
      if (this.lastElements.get(id) !== elementSignature(element)) {
        this.pendingElements.set(id, element);
        pendingElementsRetained += 1;
      }
    }
    this.pendingFiles.clear();
    let pendingFilesRetained = 0;
    for (const [id, file] of pendingFiles) {
      if (this.lastFiles.get(id) !== fileSignature(file)) {
        this.pendingFiles.set(id, file);
        pendingFilesRetained += 1;
      }
    }
    if (this.pendingElements.size || this.pendingFiles.size) this.schedulePendingFlush();
    if (diagnosticsEnabled) recordSyncDiagnostic("client.baseline.synchronized", {
      roomRef: syncDiagnosticRef(this.roomId),
      baselineElementCount: (elements || []).length,
      baselineFileCount: Object.keys(files || {}).length,
      pendingElementsBefore,
      pendingFilesBefore,
      pendingElementsRetained,
      pendingFilesRetained,
      pendingElementsDropped: pendingElementsBefore - pendingElementsRetained,
      pendingFilesDropped: pendingFilesBefore - pendingFilesRetained,
      durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
    });
  }

  schedulePendingFlush() {
    if (this.flushFrame !== null) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.flushSchedule.coalesced", {
        roomRef: syncDiagnosticRef(this.roomId),
        pendingElementCount: this.pendingElements.size,
        pendingFileCount: this.pendingFiles.size,
      });
      return;
    }
    if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.flushSchedule.created", {
      roomRef: syncDiagnosticRef(this.roomId),
      pendingElementCount: this.pendingElements.size,
      pendingFileCount: this.pendingFiles.size,
      schedulingMethod: typeof requestAnimationFrame === "function" ? "requestAnimationFrame" : "setTimeout-16ms",
    });
    const flush = () => {
      this.flushFrame = null;
      this.flushPendingUpdates();
    };
    if (typeof requestAnimationFrame === "function") {
      this.flushFrame = requestAnimationFrame(flush);
    } else {
      this.flushFrame = setTimeout(flush, 16);
    }
  }

  cancelPendingFlush() {
    if (this.flushFrame === null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.flushFrame);
    else clearTimeout(this.flushFrame);
    this.flushFrame = null;
  }

  flushPendingUpdates({ force = false } = {}) {
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const pendingElementsBefore = this.pendingElements.size;
    const pendingFilesBefore = this.pendingFiles.size;
    if (!pendingElementsBefore && !pendingFilesBefore) return true;
    if (diagnosticsEnabled) recordSyncDiagnostic("client.flush.started", {
      roomRef: syncDiagnosticRef(this.roomId),
      pendingElementsBefore,
      pendingFilesBefore,
      force,
      joined: this.joined,
      readyState: this.socket?.readyState ?? null,
      bufferedAmount: this.socket?.bufferedAmount ?? null,
    });
    if (!this.joined || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (diagnosticsEnabled) recordSyncDiagnostic("client.flush.deferred", {
        roomRef: syncDiagnosticRef(this.roomId),
        reason: "not-joined-or-socket-not-open",
        durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
      });
      return false;
    }
    if (!force && this.socket.bufferedAmount > COLLAB_BACKPRESSURE_HIGH_WATER_MARK) {
      if (diagnosticsEnabled && this.syncDiagnosticDeferredAt === null) this.syncDiagnosticDeferredAt = syncDiagnosticNow();
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.flush.deferred", {
        roomRef: syncDiagnosticRef(this.roomId),
        reason: "backpressure-high-water-mark",
        pendingElementsBefore,
        pendingFilesBefore,
        bufferedAmount: this.socket.bufferedAmount,
        highWaterMarkBytes: COLLAB_BACKPRESSURE_HIGH_WATER_MARK,
        durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
      });
      this.scheduleBackpressureRetry();
      return false;
    }

    const changedElements = [];
    let transientCreatedThenDeleted = 0;
    let unchangedElements = 0;
    for (const element of this.pendingElements.values()) {
      const signature = elementSignature(element);
      const baseline = this.lastElements.get(element.id);

      // If an element was created and deleted before the next animation frame,
      // the remote side never needed to see it. Existing elements still send
      // their deletion normally because their baseline signature is present.
      if (baseline === undefined && element.isDeleted) {
        transientCreatedThenDeleted += 1;
        continue;
      }
      if (baseline !== signature) changedElements.push(element);
      else unchangedElements += 1;
    }

    const changedFiles = [];
    let unchangedFiles = 0;
    for (const file of this.pendingFiles.values()) {
      if (this.lastFiles.get(file.id) !== fileSignature(file)) changedFiles.push(file);
      else unchangedFiles += 1;
    }

    if (!changedElements.length && !changedFiles.length) {
      this.pendingElements.clear();
      this.pendingFiles.clear();
      if (diagnosticsEnabled) recordSyncDiagnostic("client.flush.completed", {
        roomRef: syncDiagnosticRef(this.roomId),
        outcome: "no-changes",
        pendingElementsBefore,
        pendingFilesBefore,
        changedElementCount: 0,
        changedFileCount: 0,
        unchangedElements,
        unchangedFiles,
        transientCreatedThenDeleted,
        pendingElementsAfter: 0,
        pendingFilesAfter: 0,
        durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
      });
      return true;
    }

    const updateMessage = {
      type: "update",
      roomId: this.roomId,
      clientId: this.clientId,
      elements: changedElements,
      files: changedFiles,
    };
    const sent = this.sendSceneUpdate(updateMessage, { force });
    if (!sent) {
      if (diagnosticsEnabled) recordSyncDiagnostic("client.flush.completed", {
        roomRef: syncDiagnosticRef(this.roomId),
        outcome: "deferred-or-rejected",
        pendingElementsBefore,
        pendingFilesBefore,
        changedElementCount: changedElements.length,
        changedFileCount: changedFiles.length,
        transientCreatedThenDeleted,
        pendingElementsAfter: this.pendingElements.size,
        pendingFilesAfter: this.pendingFiles.size,
        durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
      });
      return false;
    }

    for (const element of changedElements) this.lastElements.set(element.id, elementSignature(element));
    for (const file of changedFiles) this.lastFiles.set(file.id, fileSignature(file));
    this.pendingElements.clear();
    this.pendingFiles.clear();
    if (diagnosticsEnabled) recordSyncDiagnostic("client.flush.completed", {
      roomRef: syncDiagnosticRef(this.roomId),
      outcome: "sent",
      pendingElementsBefore,
      pendingFilesBefore,
      changedElementCount: changedElements.length,
      changedDeletedElementCount: changedElements.filter((element) => element.isDeleted).length,
      changedFileCount: changedFiles.length,
      unchangedElements,
      unchangedFiles,
      transientCreatedThenDeleted,
      pendingElementsAfter: this.pendingElements.size,
      pendingFilesAfter: this.pendingFiles.size,
      durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
    });
    return true;
  }

  setSelection(selectedElementIds) {
    const next = Array.isArray(selectedElementIds) ? selectedElementIds.filter((id) => typeof id === "string").sort() : [];
    if (next.join(",") === this.localPresence.selectedElementIds.join(",")) return;
    this.updatePresence({ selectedElementIds: next });
  }

  setActivity(activity) {
    const normalized = ["idle", "drawing", "editing/moving"].includes(activity) ? activity : "idle";
    this.updatePresence({ activity: normalized });
    if (this.activityTimer) clearTimeout(this.activityTimer);
    if (normalized !== "idle") {
      this.activityTimer = setTimeout(() => {
        this.activityTimer = null;
        this.updatePresence({ activity: "idle" });
      }, 650);
    }
  }

  broadcastLocalChange(elements, files, appState = null) {
    if (!this.joined || !["host", "editor"].includes(this.permission)) return;
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const elementList = elements || [];
    const fileEntries = Object.entries(files || {});
    let changedElement = false;
    let changedElementCount = 0;
    let coalescedElementCount = 0;
    let changedDeletedElementCount = 0;
    let changedFileCount = 0;
    let coalescedFileCount = 0;
    measureSyncDiagnostic("client.localAuthorshipUpdate", { elementCount: elementList.length }, () => this.updateLocalAuthorship(elementList));

    for (const element of elementList) {
      const signature = elementSignature(element);
      if (this.lastElements.get(element.id) !== signature) {
        if (diagnosticsEnabled && this.pendingElements.has(element.id)) coalescedElementCount += 1;
        this.pendingElements.set(element.id, element);
        changedElement = true;
        changedElementCount += 1;
        if (element.isDeleted) changedDeletedElementCount += 1;
      }
    }
    if (changedElement) this.setActivity(appState?.draggingElement || appState?.editingElement ? "editing/moving" : "drawing");

    for (const [id, file] of fileEntries) {
      if (this.lastFiles.get(id) !== fileSignature(file)) {
        if (diagnosticsEnabled && this.pendingFiles.has(id)) coalescedFileCount += 1;
        this.pendingFiles.set(id, file);
        changedFileCount += 1;
      }
    }

    this.schedulePendingFlush();
    if (diagnosticsEnabled) recordSyncDiagnostic("client.localChange.detected", {
      roomRef: syncDiagnosticRef(this.roomId),
      clientRef: syncDiagnosticRef(this.clientId),
      elementsExamined: elementList.length,
      filesExamined: fileEntries.length,
      changedElementCount,
      changedDeletedElementCount,
      changedFileCount,
      coalescedElementCount,
      coalescedFileCount,
      pendingElementsAfter: this.pendingElements.size,
      pendingFilesAfter: this.pendingFiles.size,
      durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
    });
  }

  handleMessage(message) {
    if (!message || message.roomId !== this.roomId) return;

    switch (message.type) {
      case "joined": {
        const diagnosticsEnabled = syncDiagnosticsEnabled();
        const snapshotKind = this.hasInitialized ? "reconnect" : "initial";
        if (diagnosticsEnabled) recordSyncDiagnostic("client.joined.snapshotReceived", {
          roomRef: syncDiagnosticRef(this.roomId),
          clientRef: syncDiagnosticRef(this.clientId),
          snapshotKind,
          elementCount: Array.isArray(message.elements) ? message.elements.length : 0,
          fileCount: message.files && typeof message.files === "object" ? Object.keys(message.files).length : 0,
          participantCount: Array.isArray(message.participants) ? message.participants.length : 0,
          authorshipCount: message.authorship && typeof message.authorship === "object" ? Object.keys(message.authorship).length : 0,
          chatHistoryCount: Array.isArray(message.chatHistory) ? message.chatHistory.length : 0,
          deletedElementCount: Array.isArray(message.elements) ? summarizeSyncRecords(message.elements).deletedCount : 0,
        });
        this.joined = true;
        this.role = message.role === "host" ? "host" : "joinee";
        this.permission = message.permission === "host" ? "host" : message.permission === "editor" ? "editor" : "viewer";
        this.requestState = ["none", "pending", "approved", "denied"].includes(message.requestState) ? message.requestState : "none";
        logger.info("Collaboration joined", { category: "collaboration", roomId: this.roomId, clientId: this.clientId, role: this.role, permission: this.permission });
        this.onRole?.(this.role);
        this.onPermission?.({ permission: this.permission, requestState: this.requestState });
        this.onSessionInfo?.({
          name: typeof message.name === "string" ? message.name : "",
          roomId: message.roomId,
        });
        this.authorship = new Map(Object.entries(message.authorship || {}).filter(([id, value]) => value && typeof value === "object"));
        this.onAuthorship?.(Object.fromEntries(this.authorship));
        this.presence = Array.isArray(message.participants) ? message.participants.map((item) => normalizePresence(item, item?.participantId)) : [];
        if (!this.presence.some((item) => item.participantId === this.clientId)) this.presence.push(this.localPresence);
        this.localPresence = this.presence.find((item) => item.participantId === this.clientId) || this.localPresence;
        this.lastPresenceSignature = [this.localPresence.displayName, this.localPresence.color, this.localPresence.activity, this.localPresence.selectedElementIds.join(",")].join("|");
        this.onPresence?.(this.presence);
        this.onStatus?.("connected");
        this.onChatHistory?.(Array.isArray(message.chatHistory) ? message.chatHistory : []);
        if (Array.isArray(message.elements)) {
          const stateStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
          this.onState?.({
            kind: snapshotKind,
            elements: message.elements,
            files: message.files && typeof message.files === "object" ? message.files : {},
          });
          this.hasInitialized = true;
          if (diagnosticsEnabled) recordSyncDiagnostic("client.joined.snapshotAppliedCallbackCompleted", {
            roomRef: syncDiagnosticRef(this.roomId),
            snapshotKind,
            elementCount: message.elements.length,
            durationMs: Math.max(0, syncDiagnosticNow() - stateStartedAt),
          });
        }
        break;
      }
      case "permission:request":
        if (this.role === "host") {
          logger.info("Collaboration edit request received", { category: "collaboration", roomId: this.roomId });
          this.onPermissionRequest?.(message.requester || null);
        }
        break;

      case "permission:update": {
        const current = this.presence.find((item) => item.participantId === message.clientId);
        const next = {
          ...(current || normalizePresence(message.presence, message.clientId)),
          ...(message.presence && typeof message.presence === "object" ? message.presence : {}),
          participantId: message.clientId,
          permission: message.permission || current?.permission || "viewer",
        };
        this.presence = this.presence.some((item) => item.participantId === next.participantId)
          ? this.presence.map((item) => item.participantId === next.participantId ? next : item)
          : [...this.presence, next];
        if (message.clientId === this.clientId) {
          this.permission = message.permission || this.permission;
          this.requestState = message.requestState || this.requestState;
          logger.info("Collaboration permission changed", { category: "collaboration", roomId: this.roomId, clientId: this.clientId, permission: this.permission, requestState: this.requestState });
          this.onPermission?.({ permission: this.permission, requestState: this.requestState });
        }
        this.onPresence?.(this.presence);
        break;
      }

      case "permission:result":
        this.permission = message.permission || this.permission;
        this.requestState = message.requestState || (message.decision === "approve" ? "approved" : "denied");
        logger.info("Collaboration permission result received", { category: "collaboration", roomId: this.roomId, clientId: this.clientId, permission: this.permission, requestState: this.requestState, decision: message.decision });
        this.onPermission?.({ permission: this.permission, requestState: this.requestState, decision: message.decision });
        break;

      case "authorship:update":
        if (message.authorship && typeof message.authorship === "object") {
          for (const [id, value] of Object.entries(message.authorship)) this.authorship.set(id, value);
          this.onAuthorship?.(Object.fromEntries(this.authorship));
        }
        break;

      case "presence:update": {
        const next = normalizePresence(message.presence, message.clientId);
        this.presence = this.presence.some((item) => item.participantId === next.participantId)
          ? this.presence.map((item) => item.participantId === next.participantId ? { ...item, ...next } : item)
          : [...this.presence, next];
        this.onPresence?.(this.presence);
        break;
      }

      case "presence:remove":
        this.presence = this.presence.filter((item) => item.participantId !== message.clientId);
        this.onPresence?.(this.presence);
        break;

      case "presence":
        if (Array.isArray(message.participants)) {
          this.presence = message.participants.map((item) => normalizePresence(item, item?.participantId));
          this.onPresence?.(this.presence);
        }
        break;

      case "update": {
        if (!Array.isArray(message.elements)) {
          if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.remoteUpdate.rejected", {
            roomRef: syncDiagnosticRef(this.roomId),
            reason: "elements-not-array",
          });
          return;
        }
        const diagnosticsEnabled = syncDiagnosticsEnabled();
        const remoteStateStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
        if (diagnosticsEnabled) recordSyncDiagnostic("client.remoteUpdate.received", {
          roomRef: syncDiagnosticRef(this.roomId),
          sourceClientRef: message.clientId ? syncDiagnosticRef(message.clientId) : "unknown",
          ...summarizeSyncMessage(message),
        });
        if (message.authorship && typeof message.authorship === "object") {
          for (const [id, value] of Object.entries(message.authorship)) this.authorship.set(id, value);
          this.onAuthorship?.(Object.fromEntries(this.authorship));
        }
        this.onState?.({
          kind: "update",
          sourceClientId: message.clientId,
          elements: message.elements,
          files: Array.isArray(message.files) ? message.files : [],
        });
        if (diagnosticsEnabled) recordSyncDiagnostic("client.remoteUpdate.stateCallbackCompleted", {
          roomRef: syncDiagnosticRef(this.roomId),
          sourceClientRef: message.clientId ? syncDiagnosticRef(message.clientId) : "unknown",
          elementCount: message.elements.length,
          durationMs: Math.max(0, syncDiagnosticNow() - remoteStateStartedAt),
        });
        break;
      }

      case "chat:message":
        if (message.message && typeof message.message.id === "string" && typeof message.message.text === "string") {
          this.onChatMessage?.(message.message);
        }
        break;

      case "chat:error":
        this.onChatError?.(typeof message.message === "string" ? message.message : "Unable to send chat message.");
        break;

      case "session-ended":
        logger.info("Collaboration session ended", { category: "collaboration", roomId: this.roomId });
        this.closed = true;
        this.joined = false;
        if (this.socket) {
          this.socket.onclose = null;
          this.socket.close();
          this.socket = null;
        }
        this.presence = [];
        this.authorship.clear();
        this.onAuthorship?.({});
        this.permission = null;
        this.requestState = "none";
        this.onPermission?.({ permission: null, requestState: "none" });
        this.onPresence?.([]);
        this.onStatus?.("disconnected");
        this.onSessionEnded?.(typeof message.message === "string" ? message.message : "The host ended the collaboration session.");
        break;

      case "error":
        this.fail(typeof message.message === "string" ? message.message : "Collaboration error.");
        break;

      default:
        break;
    }
  }
}
