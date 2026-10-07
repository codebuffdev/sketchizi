import { serverLogger } from "./logger.mjs";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.COLLAB_PORT || 8787);
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const ROOM_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_ELEMENTS = 10000;
const MAX_FILES = 500;
const MAX_FILE_DATA_URL = 6 * 1024 * 1024;
const MAX_ROOM_NAME_LENGTH = 120;
const MAX_DISPLAY_NAME_LENGTH = 48;
const PRESENCE_ACTIVITIES = new Set(["idle", "drawing", "editing/moving"]);

// There is intentionally no MAX_CLIENTS/MAX_PARTICIPANTS setting.
// room.clients is the complete per-room participant set; practical capacity is
// bounded by this process's memory/CPU/network/WebSocket resources instead.
const rooms = new Map();
const terminatedRooms = new Set();

function validElement(element) {
  return element &&
    typeof element === "object" &&
    typeof element.id === "string" &&
    element.id.length <= 128 &&
    Number.isInteger(element.version) &&
    Number.isInteger(element.versionNonce);
}

function validFile(file) {
  return file &&
    typeof file === "object" &&
    typeof file.id === "string" &&
    file.id.length <= 128 &&
    typeof file.mimeType === "string" &&
    typeof file.dataURL === "string" &&
    file.dataURL.length <= MAX_FILE_DATA_URL;
}

function chooseElement(current, incoming) {
  if (!current) return incoming;
  if (incoming.version > current.version) return incoming;
  if (incoming.version < current.version) return current;
  if (incoming.versionNonce === current.versionNonce) return current;
  // Concurrent edits can legitimately produce the same element version.
  // Use versionNonce as a deterministic tie-breaker so every client converges.
  return incoming.versionNonce > current.versionNonce ? incoming : current;
}

function roomSnapshot(room) {
  return {
    name: room.name,
    elements: Array.from(room.elements.values()),
    files: Object.fromEntries(room.files.entries()),
    authorship: Object.fromEntries(room.authorship.entries()),
    participants: Array.from(room.presence.values()),
  };
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
  return { participantId: clientId, displayName, color, cursor, activity, selectedElementIds, status: "connected", permission: permission || previous?.permission || "viewer" };
}

function broadcastPresence(room, sender, message) {
  broadcast(room, sender, message);
}

function broadcast(room, sender, message) {
  const data = JSON.stringify(message);
  for (const client of room.clients) {
    if (client !== sender && client.readyState === 1) client.send(data);
  }
}

function send(client, message) {
  if (client.readyState === 1) client.send(JSON.stringify(message));
}

function terminateRoom(room, message = "The host ended the collaboration session.") {
  if (!room || room.terminated) return;
  room.terminated = true;
  terminatedRooms.add(room.id);
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
  const clientIdForPresence = client.__sketchiziClientId;
  room.clients.delete(client);
  if (wasHost) {
    terminateRoom(room);
    return;
  }
  if (intentional) {
    if (clientIdForPresence) {
      room.presence.delete(clientIdForPresence);
      room.permissions.delete(clientIdForPresence);
      room.pendingRequests.delete(clientIdForPresence);
    }
    broadcastPresence(room, null, { type: "presence:remove", roomId: room.id, clientId: clientIdForPresence });
  } else if (clientIdForPresence && room.presence.has(clientIdForPresence)) {
    const current = room.presence.get(clientIdForPresence);
    room.presence.set(clientIdForPresence, { ...current, status: "disconnected" });
    broadcastPresence(room, null, { type: "presence:update", roomId: room.id, clientId: clientIdForPresence, presence: { status: "disconnected" } });
  }
  if (!room.clients.size && !room.presence.size) {
    rooms.delete(room.id);
    return;
  }
  broadcast(room, null, { type: "presence", roomId: room.id, count: room.clients.size, participants: Array.from(room.presence.values()) });
}

function mergeSnapshot(room, elements, files, authorId = null) {
  if (!Array.isArray(elements) || elements.length > MAX_ELEMENTS) {
    throw new Error("Invalid collaboration scene.");
  }

  const acceptedElements = [];
  for (const element of elements) {
    if (!validElement(element)) throw new Error("Invalid collaboration element.");
    const current = room.elements.get(element.id);
    const chosen = chooseElement(current, element);
    if (chosen === current) continue;
    room.elements.set(element.id, chosen);
    if (authorId) {
      const currentAuthorship = room.authorship.get(element.id);
      if (!currentAuthorship && !element.isDeleted) {
        room.authorship.set(element.id, { createdBy: authorId, lastModifiedBy: authorId });
      } else if (currentAuthorship) {
        room.authorship.set(element.id, { ...currentAuthorship, lastModifiedBy: authorId });
      }
    }
    acceptedElements.push(chosen);
  }

  const acceptedFiles = [];
  if (files && typeof files === "object") {
    const entries = Array.isArray(files) ? files.map((file) => [file?.id, file]) : Object.entries(files);
    if (entries.length > MAX_FILES) throw new Error("Too many collaboration files.");
    for (const [id, file] of entries) {
      if (!validFile(file) || file.id !== id) throw new Error("Invalid collaboration file.");
      room.files.set(id, file);
      acceptedFiles.push(file);
    }
  }

  const acceptedAuthorship = Object.fromEntries(acceptedElements.map((element) => [element.id, room.authorship.get(element.id)]).filter(([, value]) => value));
  return { elements: acceptedElements, files: acceptedFiles, authorship: acceptedAuthorship };
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_MESSAGE_BYTES,
  path: "/collaboration",
});

wss.on("connection", (socket) => {
  let room = null;
  let clientId = null;

  socket.on("message", (raw) => {
    if (raw.length > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }

    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Malformed collaboration message." });
      return;
    }

    if (message.type === "join") {
      if (room || typeof message.clientId !== "string" || !ROOM_PATTERN.test(message.roomId)) {
        send(socket, { type: "error", message: "Invalid collaboration join." });
        return;
      }

      clientId = message.clientId.slice(0, 64);
      if (terminatedRooms.has(message.roomId)) {
        send(socket, { type: "session-ended", roomId: message.roomId, message: "This collaboration session is no longer available." });
        socket.close(1000, "Collaboration session ended");
        return;
      }

      room = rooms.get(message.roomId);
      let isHost = false;
      if (!room) {
        const name = typeof message.sessionName === "string" ? message.sessionName.trim() : "";
        if (!name || name.length > MAX_ROOM_NAME_LENGTH) {
          send(socket, { type: "error", message: "A collaboration name is required to create a session." });
          socket.close(1008, "Collaboration name required");
          return;
        }
        room = { id: message.roomId, name, clients: new Set(), elements: new Map(), files: new Map(), authorship: new Map(), permissions: new Map(), pendingRequests: new Map(), presence: new Map(), host: null, terminated: false };
        rooms.set(room.id, room);
        isHost = true;
        serverLogger.info("Collaboration room created", { roomId: room.id });
      }

      const previousSocket = Array.from(room.clients).find((candidate) => candidate.__sketchiziClientId === clientId);
      const reconnectingHost = room.host === previousSocket || room.host?.__sketchiziClientId === clientId;
      if (previousSocket && previousSocket !== socket) {
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
        send(socket, { type: "error", message: error.message });
        socket.close(1008, "Invalid initial state");
        return;
      }

      room.clients.add(socket);
      socket.__sketchiziClientId = clientId;
      if (isHost || reconnectingHost) room.host = socket;
      const permission = socket === room.host ? "host" : (room.permissions.get(clientId) || "viewer");
      room.permissions.set(clientId, permission);
      const previousPresence = room.presence.get(clientId);
      room.presence.set(clientId, sanitizePresence(clientId, message.presence, previousPresence, permission));
      const requestState = room.pendingRequests.has(clientId) ? "pending" : (previousPresence?.permission === "editor" || permission === "editor" ? "approved" : "none");
      send(socket, {
        type: "joined",
        roomId: room.id,
        clientId,
        role: socket === room.host ? "host" : "joinee",
        permission,
        requestState,
        presence: room.clients.size,
        ...roomSnapshot(room),
      });
      serverLogger.info("Collaboration participant joined", { roomId: room.id, clientId, permission });
      broadcast(room, socket, { type: "presence", roomId: room.id, count: room.clients.size, participants: Array.from(room.presence.values()) });
      return;
    }

    if (!room || message.roomId !== room.id || message.clientId !== clientId) {
      send(socket, { type: "error", message: "Not joined to a valid room." });
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

    if (message.type === "presence:update") {
      const current = room.presence.get(clientId);
      const next = sanitizePresence(clientId, message.presence || {}, current);
      room.presence.set(clientId, next);
      broadcastPresence(room, socket, { type: "presence:update", roomId: room.id, clientId, presence: next });
      return;
    }

    if (message.type === "update") {
      const permission = room.permissions.get(clientId) || (socket === room.host ? "host" : "viewer");
      if (permission !== "host" && permission !== "editor") {
        serverLogger.warn("Collaboration update rejected for read-only participant", { roomId: room.id, clientId });
        send(socket, { type: "permission:rejected", roomId: room.id, message: "You are currently read-only." });
        return;
      }
      let accepted;
      try {
        accepted = mergeSnapshot(room, message.elements || [], message.files || [], clientId);
      } catch (error) {
        send(socket, { type: "error", message: error.message });
        return;
      }

      if (!accepted.elements.length && !accepted.files.length) return;
      broadcast(room, socket, {
        type: "update",
        roomId: room.id,
        clientId,
        elements: accepted.elements,
        files: accepted.files,
        authorship: accepted.authorship,
      });
      if (Object.keys(accepted.authorship).length) send(socket, { type: "authorship:update", roomId: room.id, authorship: accepted.authorship });
    }
  });

  socket.on("close", () => {
    serverLogger.debug("Collaboration socket closed", { roomId: room?.id, clientId: socket.__sketchiziClientId });
    if (room && !socket.__sketchiziReplaced) removeClient(room, socket);
  });
  socket.on("error", (error) => {
    serverLogger.warn("Collaboration socket error", { roomId: room?.id, clientId: socket.__sketchiziClientId, error: error?.message });
    if (room && !socket.__sketchiziReplaced) removeClient(room, socket);
  });
});

httpServer.listen(PORT, () => {
  serverLogger.info("Sketchizi collaboration server listening", { port: PORT });
});
