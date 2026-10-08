import { logger } from "./logging/logger";

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
  }) {
    if (!ROOM_PATTERN.test(roomId)) throw new Error("Invalid collaboration room.");
    this.roomId = roomId;
    this.sessionName = typeof sessionName === "string" ? sessionName.trim() : "";
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
  }

  connect() {
    this.closed = false;
    logger.info("Collaboration connection requested", { category: "collaboration", roomId: this.roomId, clientId: this.clientId });
    this.openSocket();
  }

  close() {
    this.cancelPendingFlush();
    this.cancelBackpressureRetry();
    this.cancelPresenceCursor();
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    this.pendingElements.clear();
    this.pendingFiles.clear();
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

    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      logger.debug("Collaboration socket connected", { category: "collaboration", roomId: this.roomId });
      this.send({
        type: "join",
        roomId: this.roomId,
        clientId: this.clientId,
        sessionName: this.sessionName,
        snapshot: this.snapshot(),
        presence: { displayName: this.displayName, color: this.color },
      });
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_BYTES) {
        this.fail("The collaboration server sent an invalid message.");
        return;
      }
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        this.fail("The collaboration server sent malformed data.");
        return;
      }
      this.handleMessage(message);
    };

    socket.onerror = (error) => {
      logger.error("Collaboration socket error", error, { category: "collaboration", roomId: this.roomId });
      if (!this.closed) this.onStatus?.("reconnecting");
    };

    socket.onclose = () => {
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
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const payload = JSON.stringify(message);
    if (payload.length > MAX_MESSAGE_BYTES) {
      this.fail("This collaboration update is too large.");
      return false;
    }
    this.socket.send(payload);
    return true;
  }

  cancelBackpressureRetry() {
    if (this.backpressureTimer !== null) clearTimeout(this.backpressureTimer);
    this.backpressureTimer = null;
  }

  scheduleBackpressureRetry() {
    if (this.backpressureTimer !== null || this.closed) return;
    this.backpressureTimer = setTimeout(() => {
      this.backpressureTimer = null;
      this.flushPendingUpdates();
    }, COLLAB_BACKPRESSURE_RETRY_MS);
  }

  sendSceneUpdate(message, { force = false } = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const payload = JSON.stringify(message);
    if (payload.length > MAX_MESSAGE_BYTES) {
      this.fail("This collaboration update is too large.");
      return false;
    }
    if (!force && this.socket.bufferedAmount > COLLAB_BACKPRESSURE_HIGH_WATER_MARK) {
      this.scheduleBackpressureRetry();
      return false;
    }
    this.socket.send(payload);
    return true;
  }

  snapshot() {
    const elements = this.api.getSceneElementsIncludingDeleted?.() || this.api.getSceneElements();
    const files = this.api.getFiles?.() || {};
    this.remember(elements, files);
    return { elements, files };
  }

  remember(elements, files) {
    this.lastElements = new Map((elements || []).map((element) => [element.id, elementSignature(element)]));
    this.lastFiles = new Map(Object.entries(files || {}).map(([id, file]) => [id, fileSignature(file)]));
  }

  syncBaseline(elements, files) {
    this.cancelPendingFlush();
    this.cancelBackpressureRetry();
    const pendingElements = new Map(this.pendingElements);
    const pendingFiles = new Map(this.pendingFiles);
    this.remember(elements, files);

    this.pendingElements.clear();
    for (const [id, element] of pendingElements) {
      if (this.lastElements.get(id) !== elementSignature(element)) this.pendingElements.set(id, element);
    }
    this.pendingFiles.clear();
    for (const [id, file] of pendingFiles) {
      if (this.lastFiles.get(id) !== fileSignature(file)) this.pendingFiles.set(id, file);
    }
    if (this.pendingElements.size || this.pendingFiles.size) this.schedulePendingFlush();
  }

  schedulePendingFlush() {
    if (this.flushFrame !== null) return;
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
    if (!this.pendingElements.size && !this.pendingFiles.size) return true;
    if (!this.joined || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    if (!force && this.socket.bufferedAmount > COLLAB_BACKPRESSURE_HIGH_WATER_MARK) {
      this.scheduleBackpressureRetry();
      return false;
    }

    const changedElements = [];
    for (const element of this.pendingElements.values()) {
      const signature = elementSignature(element);
      const baseline = this.lastElements.get(element.id);

      // If an element was created and deleted before the next animation frame,
      // the remote side never needed to see it. Existing elements still send
      // their deletion normally because their baseline signature is present.
      if (baseline === undefined && element.isDeleted) continue;
      if (baseline !== signature) changedElements.push(element);
    }

    const changedFiles = [];
    for (const file of this.pendingFiles.values()) {
      if (this.lastFiles.get(file.id) !== fileSignature(file)) changedFiles.push(file);
    }

    if (!changedElements.length && !changedFiles.length) {
      this.pendingElements.clear();
      this.pendingFiles.clear();
      return true;
    }

    const sent = this.sendSceneUpdate({
      type: "update",
      roomId: this.roomId,
      clientId: this.clientId,
      elements: changedElements,
      files: changedFiles,
    }, { force });
    if (!sent) return false;

    for (const element of changedElements) this.lastElements.set(element.id, elementSignature(element));
    for (const file of changedFiles) this.lastFiles.set(file.id, fileSignature(file));
    this.pendingElements.clear();
    this.pendingFiles.clear();
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
    this.updateLocalAuthorship(elements);

    let changedElement = false;
    for (const element of elements || []) {
      const signature = elementSignature(element);
      if (this.lastElements.get(element.id) !== signature) {
        this.pendingElements.set(element.id, element);
        changedElement = true;
      }
    }
    if (changedElement) this.setActivity(appState?.draggingElement || appState?.editingElement ? "editing/moving" : "drawing");

    for (const [id, file] of Object.entries(files || {})) {
      if (this.lastFiles.get(id) !== fileSignature(file)) this.pendingFiles.set(id, file);
    }

    this.schedulePendingFlush();
  }

  handleMessage(message) {
    if (!message || message.roomId !== this.roomId) return;

    switch (message.type) {
      case "joined":
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
        if (Array.isArray(message.elements)) {
          this.onState?.({
            kind: this.hasInitialized ? "reconnect" : "initial",
            elements: message.elements,
            files: message.files && typeof message.files === "object" ? message.files : {},
          });
          this.hasInitialized = true;
        }
        break;

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

      case "update":
        if (!Array.isArray(message.elements)) return;
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
