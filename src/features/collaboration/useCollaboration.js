import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCurrentUser, fetchHostAuthorization } from "../auth/authClient.js";
import { CaptureUpdateAction, reconcileElements, restoreElements } from "@excalidraw/excalidraw";
import {
  SketchiziCollaboration,
  createCollaborationRoomId,
  getCollaborationLink,
  getCollaborationRoomId,
  getCollaborationDisplayName,
  getCollaborationClientId,
  saveCollaborationDisplayName,
} from "../../collaboration";
import {
  measureSyncDiagnostic,
  recordSyncDiagnostic,
  summarizeSyncRecords,
  syncDiagnosticNow,
  syncDiagnosticsEnabled,
} from "./syncDiagnostics";

export function useCollaboration({ apiRef, showToast, closeNativeMenu, sketchReady, apiReady }) {
  const collaborationRef = useRef(null);
  const collaborationRemoteUpdateRef = useRef(false);
  const lastLocalNavigationAtRef = useRef(0);
  const lastRemoteViewportFocusAtRef = useRef(0);
  const markLocalViewportNavigation = useCallback(() => {
    lastLocalNavigationAtRef.current = Date.now();
  }, []);

  const focusRemoteEditingArea = useCallback((remoteElements) => {
    const api = apiRef.current;
    if (!api || !Array.isArray(remoteElements) || !remoteElements.length) return;

    const now = Date.now();
    if (now - lastLocalNavigationAtRef.current < 900) return;
    if (now - lastRemoteViewportFocusAtRef.current < 1200) return;

    const appState = api.getAppState?.();
    if (!appState) return;

    const visibleWidth = Number(appState.width) || 0;
    const visibleHeight = Number(appState.height) || 0;
    const zoom = Number(appState.zoom?.value) || 1;
    if (!visibleWidth || !visibleHeight || !zoom) return;

    const visibleLeft = -Number(appState.scrollX || 0);
    const visibleTop = -Number(appState.scrollY || 0);
    const visibleRight = visibleLeft + visibleWidth / zoom;
    const visibleBottom = visibleTop + visibleHeight / zoom;
    const marginX = visibleWidth / zoom * 0.08;
    const marginY = visibleHeight / zoom * 0.08;

    const outsideViewport = remoteElements.filter((element) => {
      if (!element || typeof element.x !== "number" || typeof element.y !== "number") return false;
      const width = Math.max(1, Number(element.width) || 1);
      const height = Math.max(1, Number(element.height) || 1);
      const left = element.x;
      const top = element.y;
      const right = left + width;
      const bottom = top + height;
      return right < visibleLeft - marginX || left > visibleRight + marginX ||
        bottom < visibleTop - marginY || top > visibleBottom + marginY;
    });

    // If every changed element is already in/near the current viewport, there
    // is nothing to follow. This is the key guard against viewport fighting.
    if (!outsideViewport.length) return;

    lastRemoteViewportFocusAtRef.current = now;
    if (api.scrollToContent) {
      api.scrollToContent(outsideViewport, { fitToViewport: false, animate: true });
    } else if (api.setViewport) {
      api.setViewport({ target: outsideViewport, fit: "none", animation: { duration: 350 } });
    }
  }, [apiRef]);
  const collaborationRoomId = useMemo(() => getCollaborationRoomId(), []);
  const collaborationClientId = useMemo(() => getCollaborationClientId(), []);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [collaborationMode, setCollaborationMode] = useState("create");
  const [collaborationDraftName, setCollaborationDraftName] = useState("");
  const [collaborationDisplayName, setCollaborationDisplayName] = useState(() => getCollaborationDisplayName());
  const [collaborationSessionName, setCollaborationSessionName] = useState("");
  const [collaborationParticipants, setCollaborationParticipants] = useState([]);
  const [collaborationRoom, setCollaborationRoom] = useState(null);
  const [collaborationLink, setCollaborationLink] = useState(null);
  const [collaborationStatus, setCollaborationStatus] = useState("disconnected");
  const [collaborationUsers, setCollaborationUsers] = useState(0);
  const [collaborationError, setCollaborationError] = useState("");
  const [collaborationRole, setCollaborationRole] = useState(null);
  const [collaborationPermission, setCollaborationPermission] = useState(null);
  const [collaborationRequestState, setCollaborationRequestState] = useState("none");
  const [collaborationRequests, setCollaborationRequests] = useState([]);
  const [collaborationAuthorship, setCollaborationAuthorship] = useState({});
  const [collaborationCreationState, setCollaborationCreationState] = useState("idle");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatError, setChatError] = useState("");
  const [collaborationHostRecovery, setCollaborationHostRecovery] = useState(null);
  const [collaborationEndedSession, setCollaborationEndedSession] = useState(null);
  const collaborationCreationAttemptRef = useRef(false);
  const collaborationSocketOpenedRef = useRef(false);
  const hostAuthCheckRef = useRef(false);
  const collaborationCreationTimeoutRef = useRef(null);
  const collaborationSessionInfoRef = useRef({ id: null, name: "" });

  const clearCollaborationCreationTimeout = useCallback(() => {
    if (collaborationCreationTimeoutRef.current) {
      clearTimeout(collaborationCreationTimeoutRef.current);
      collaborationCreationTimeoutRef.current = null;
    }
  }, []);

  const failCollaborationCreation = useCallback((message = "Collaboration failed") => {
    clearCollaborationCreationTimeout();
    collaborationCreationAttemptRef.current = false;
    collaborationRef.current?.close();
    setCollaborationRoom(null);
    setChatMessages([]);
    setChatError("");
    setCollaborationHostRecovery(null);
    setCollaborationLink(null);
    setCollaborationSessionName("");
    setCollaborationUsers(0);
    setCollaborationParticipants([]);
    setCollaborationStatus("disconnected");
    setCollaborationRole(null);
    setCollaborationPermission(null);
    setCollaborationRequestState("none");
    setCollaborationRequests([]);
    setCollaborationAuthorship({});
    setCollaborationError(message || "Collaboration failed. Check the collaboration server and WebSocket configuration.");
    setCollaborationCreationState("failed");
    setCollaborationOpen(false);
    return message;
  }, [clearCollaborationCreationTimeout]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api?.onPointerUp) return undefined;

    const unsubscribe = api.onPointerUp((activeTool) => {
      if (activeTool?.type !== "freedraw") return;
      collaborationRef.current?.flushPendingUpdates();
    });

    return () => unsubscribe?.();
  }, [apiRef, apiReady]);

  const mergeCollaborativeElements = useCallback((remoteElements) => {
    const api = apiRef.current;
    if (!api || !Array.isArray(remoteElements)) return;
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const existingElements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements();
    if (diagnosticsEnabled) recordSyncDiagnostic("client.remoteSceneApply.started", {
      incomingElementCount: remoteElements.length,
      existingElementCount: existingElements.length,
      incomingDeletedCount: summarizeSyncRecords(remoteElements).deletedCount,
    });
    try {
      const restoredRemote = measureSyncDiagnostic("client.restoreRemoteElements", { incomingElementCount: remoteElements.length, existingElementCount: existingElements.length }, () => restoreElements(remoteElements, existingElements, { repairBindings: true }));
      const reconciled = measureSyncDiagnostic("client.reconcileRemoteElements", { existingElementCount: existingElements.length, restoredElementCount: restoredRemote.length }, () => reconcileElements(existingElements, restoredRemote, api.getAppState()));
      collaborationRemoteUpdateRef.current = true;
      try {
        measureSyncDiagnostic("client.remoteUpdateScene", { reconciledElementCount: reconciled.length }, () => api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER }));
      } finally {
        collaborationRemoteUpdateRef.current = false;
      }
    } finally {
      if (diagnosticsEnabled) recordSyncDiagnostic("client.remoteSceneApply.completed", {
        durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
        incomingElementCount: remoteElements.length,
        existingElementCount: existingElements.length,
      });
    }
  }, [apiRef]);

  const applyCollaborationState = useCallback(({ kind, elements, files, sourceClientId }) => {
    const api = apiRef.current;
    if (!api) return;
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const incomingElements = Array.isArray(elements) ? elements : [];
    const incomingFiles = Array.isArray(files) ? files : files && typeof files === "object" ? Object.values(files) : [];
    if (diagnosticsEnabled) recordSyncDiagnostic("client.remoteState.received", {
      kind,
      incomingElementCount: incomingElements.length,
      incomingFileCount: incomingFiles.length,
      sourceClientRef: sourceClientId ? String(sourceClientId).slice(-6) : "snapshot",
    });
    try {
      if (kind === "initial") {
        const restored = measureSyncDiagnostic("client.restoreInitialSnapshot", { incomingElementCount: incomingElements.length }, () => restoreElements(elements || [], null, { repairBindings: true }));
        collaborationRemoteUpdateRef.current = true;
        try {
          measureSyncDiagnostic("client.applyInitialSnapshot", { restoredElementCount: restored.length }, () => api.updateScene({
            elements: restored,
            appState: { ...api.getAppState(), selectedElementIds: {}, selectedGroupIds: {} },
            captureUpdate: CaptureUpdateAction.NEVER,
          }));
          if (files && typeof files === "object") api.addFiles?.(Object.values(files));
          measureSyncDiagnostic("client.syncBaselineAfterSnapshot", diagnosticsEnabled ? {
            sceneElementCount: (api.getSceneElementsIncludingDeleted?.() || api.getSceneElements()).length,
            sceneFileCount: Object.keys(api.getFiles?.() || {}).length,
          } : {}, () => collaborationRef.current?.syncBaseline(
            api.getSceneElementsIncludingDeleted?.() || api.getSceneElements(),
            api.getFiles?.() || {},
          ));
        } finally {
          collaborationRemoteUpdateRef.current = false;
        }
        return;
      }
      mergeCollaborativeElements(elements);
      if (sourceClientId && sourceClientId !== collaborationClientId) focusRemoteEditingArea(elements);
      if (Array.isArray(files) && files.length) api.addFiles?.(files);
      else if (files && typeof files === "object" && Object.keys(files).length) api.addFiles?.(Object.values(files));
      measureSyncDiagnostic("client.syncBaselineAfterRemoteUpdate", diagnosticsEnabled ? {
        sceneElementCount: (api.getSceneElementsIncludingDeleted?.() || api.getSceneElements()).length,
        sceneFileCount: Object.keys(api.getFiles?.() || {}).length,
      } : {}, () => collaborationRef.current?.syncBaseline(
        api.getSceneElementsIncludingDeleted?.() || api.getSceneElements(),
        api.getFiles?.() || {},
      ));
    } finally {
      if (diagnosticsEnabled) recordSyncDiagnostic("client.remoteState.completed", {
        kind,
        durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
        incomingElementCount: incomingElements.length,
        incomingFileCount: incomingFiles.length,
      });
    }
  }, [apiRef, collaborationClientId, focusRemoteEditingArea, mergeCollaborativeElements]);

  const connectCollaboration = useCallback((roomId, sessionName = "", participantName = "", hostAuthorizationToken = "") => {
    const api = apiRef.current;
    if (!api || !roomId) return;
    const normalizedParticipantName = saveCollaborationDisplayName(participantName || collaborationDisplayName);
    if (!normalizedParticipantName) return;
    setCollaborationDisplayName(normalizedParticipantName);
    collaborationRef.current?.close();
    setChatMessages([]);
    setChatError("");
    setCollaborationEndedSession(null);
    setCollaborationHostRecovery(null);
    setCollaborationRoom(roomId);
    setCollaborationLink(getCollaborationLink(roomId));
    setCollaborationSessionName(sessionName.trim());
    collaborationSessionInfoRef.current = { id: roomId, name: sessionName.trim() };
    setCollaborationError("");
    setCollaborationRole(null);
    const client = new SketchiziCollaboration({
      roomId,
      sessionName,
      hostAuthorizationToken,
      hostAuthorizationTokenProvider: hostAuthorizationToken ? () => fetchHostAuthorization(roomId) : null,
      api,
      onState: applyCollaborationState,
      onPresence: (participants) => {
        const next = Array.isArray(participants) ? participants : [];
        setCollaborationParticipants(next);
        setCollaborationUsers(next.filter((participant) => participant.status === "connected").length);
      },
      onSocketOpen: () => {
        collaborationSocketOpenedRef.current = true;
      },
      onJoinSent: () => {
        if (!collaborationCreationAttemptRef.current) return;
        // The initial snapshot can be large, and WebSocket.send() only queues
        // it locally. Start the server-acknowledgement timeout after the join
        // payload has actually been serialized and handed to the browser socket,
        // rather than consuming the entire budget while preparing/uploading it.
        clearCollaborationCreationTimeout();
        collaborationCreationTimeoutRef.current = setTimeout(() => {
          if (!collaborationCreationAttemptRef.current) return;
          failCollaborationCreation("The collaboration server did not acknowledge the join request within 60 seconds after it was sent. Check the Render logs for the join request, room creation, and participant-joined events.");
        }, 60000);
      },
      onStatus: (nextStatus) => {
        setCollaborationStatus(nextStatus);
        if (nextStatus === "connected") {
          setCollaborationError("");
          setCollaborationHostRecovery((current) => current?.state === "recovering" ? { state: "connected", deadline: null, graceMs: 60000 } : null);
        }
        if (!collaborationCreationAttemptRef.current) return;
        if (nextStatus === "connected") {
          clearCollaborationCreationTimeout();
          collaborationCreationAttemptRef.current = false;
          setCollaborationCreationState("success");
          setCollaborationOpen(false);
          return;
        }
        if (nextStatus === "reconnecting") {
          // Keep the initial creation state visible while the client gives the
          // connection a chance to recover. The timeout below prevents an
          // indefinite creating state.
        }
      },
      onError: (message) => {
        if (collaborationCreationAttemptRef.current) {
          failCollaborationCreation(message || "The collaboration connection failed. Check the server and WebSocket endpoint.");
          return;
        }
        setCollaborationError(message);
      },
      onRole: setCollaborationRole,
      onPermission: ({ permission, requestState }) => {
        setCollaborationPermission(permission || null);
        setCollaborationRequestState(requestState || "none");
      },
      onPermissionRequest: (request) => {
        if (request?.participantId) setCollaborationRequests((current) => current.some((item) => item.participantId === request.participantId) ? current : [...current, request]);
      },
      onAuthorship: setCollaborationAuthorship,
      onChatHistory: (messages) => { setChatMessages(Array.isArray(messages) ? messages.map((message) => ({ ...message, __history: true })) : []); setChatError(""); },
      onChatMessage: (message) => setChatMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]),
      onChatError: setChatError,
      onHostRecovery: (recovery) => setCollaborationHostRecovery(recovery?.state === "recovering" ? recovery : null),
      onSessionInfo: ({ name, roomId: infoRoomId }) => {
        const resolvedName = name || "Collaboration";
        collaborationSessionInfoRef.current = { id: infoRoomId || roomId, name: resolvedName };
        setCollaborationSessionName(resolvedName);
      },
      onSessionEnded: (message) => {
        const endedInfo = collaborationSessionInfoRef.current;
        const endedRoomId = endedInfo.id || roomId;
        setCollaborationEndedSession({ id: endedRoomId, name: endedInfo.name?.trim() || sessionName?.trim() || "Collaboration", link: getCollaborationLink(endedRoomId), message: message || "This collaboration session has ended.", endedAt: Date.now(), returned: false });
        setChatMessages([]);
        setChatError("");
        setCollaborationHostRecovery(null);
        setCollaborationRoom(null);
        setCollaborationLink(null);
        setCollaborationSessionName("");
        setCollaborationUsers(0);
        setCollaborationParticipants([]);
        setCollaborationStatus("disconnected");
        setCollaborationRole(null);
        setCollaborationPermission(null);
        setCollaborationRequestState("none");
        setCollaborationRequests([]);
        setCollaborationAuthorship({});
        setCollaborationOpen(false);
        if (window.location.pathname.startsWith("/collab/")) window.history.replaceState({}, "", "/");
        showToast(message, "error");
      },
    });
    collaborationRef.current = client;
    client.connect();
  }, [apiRef, applyCollaborationState, collaborationDisplayName, clearCollaborationCreationTimeout, failCollaborationCreation, showToast]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const readOnly = Boolean(collaborationRoom && collaborationPermission === "viewer");
    if (api.getAppState().viewModeEnabled === readOnly) return;
    api.updateScene({ appState: { ...api.getAppState(), viewModeEnabled: readOnly }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [apiRef, collaborationPermission, collaborationRoom]);

  const requestEditAccess = useCallback(() => collaborationRef.current?.requestEditAccess(), []);
  const decideEditRequest = useCallback((participantId, decision) => {
    const sent = collaborationRef.current?.decideEditRequest(participantId, decision);
    if (sent) setCollaborationRequests((current) => current.filter((item) => item.participantId !== participantId));
    return sent;
  }, []);
  const revokeEditAccess = useCallback((participantId) => collaborationRef.current?.revokeEditAccess(participantId), []);

  const updateCollaborationPresence = useCallback((patch) => {
    collaborationRef.current?.updatePresence(patch);
  }, []);

  const updateCollaborationCursor = useCallback((cursor) => {
    collaborationRef.current?.updateCursor(cursor);
  }, []);

  const startCollaboration = useCallback(async () => {
    if (collaborationCreationAttemptRef.current || hostAuthCheckRef.current) return;
    closeNativeMenu();
    if (collaborationRoom && collaborationRole) {
      setCollaborationMode("active");
      setCollaborationOpen(true);
      return;
    }
    hostAuthCheckRef.current = true;
    try {
      const { authenticated, user } = await fetchCurrentUser();
      if (!authenticated) {
        window.dispatchEvent(new CustomEvent("sketchizi:auth-required", { detail: {
          message: "Sign in with Google to host a collaboration. You can still join an existing collaboration without signing in.",
          returnTo: "/?startCollaboration=1",
        }}));
        return;
      }
      const profileName = typeof user?.name === "string" && user.name.trim()
        ? user.name.trim()
        : typeof user?.email === "string" && user.email.trim() ? user.email.trim() : "";
      if (!profileName) {
        setCollaborationCreationState("blocked");
        setCollaborationError("Your Google account does not provide a usable display name or email address. Update your profile and try again.");
        setCollaborationMode("create");
        setCollaborationOpen(true);
        return;
      }
      clearCollaborationCreationTimeout();
      setCollaborationCreationState("idle");
      setCollaborationError("");
      setCollaborationMode("create");
      setCollaborationDraftName("");
      setCollaborationDisplayName(profileName);
      setCollaborationOpen(true);
    } catch (error) {
      setCollaborationCreationState("blocked");
      setCollaborationError("Sign-in status is unavailable. Hosting is disabled until Sketchizi can verify your account. You can continue drawing or join an existing collaboration.");
      setCollaborationMode("create");
      setCollaborationOpen(true);
    } finally {
      hostAuthCheckRef.current = false;
    }
  }, [clearCollaborationCreationTimeout, closeNativeMenu, collaborationRoom, collaborationRole, setCollaborationDisplayName]);

  useEffect(() => {
    if (!sketchReady) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("startCollaboration") !== "1") return;
    url.searchParams.delete("startCollaboration");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    void startCollaboration();
  }, [sketchReady, startCollaboration]);

  const dismissCollaborationCreationFailure = useCallback(() => {
    if (collaborationCreationState !== "failed") return;
    setCollaborationCreationState("idle");
    setCollaborationError("");
  }, [collaborationCreationState]);

  const createCollaboration = useCallback(async () => {
    if (collaborationCreationAttemptRef.current) return;
    const name = collaborationDraftName.trim();
    if (!name) return;
    collaborationCreationAttemptRef.current = true;
    collaborationSocketOpenedRef.current = false;
    setCollaborationCreationState("creating");
    setCollaborationError("");
    try {
      const roomId = createCollaborationRoomId();
      const { token, name: authenticatedName } = await fetchHostAuthorization(roomId);
      if (!collaborationCreationAttemptRef.current) return;
      setCollaborationDisplayName(authenticatedName);
      saveCollaborationDisplayName(authenticatedName);
      setCollaborationMode("create");
      setCollaborationOpen(false);
      connectCollaboration(roomId, name, authenticatedName, token);
      // Endpoint validation can fail synchronously before the timeout is needed.
      if (!collaborationCreationAttemptRef.current) return;
      collaborationCreationTimeoutRef.current = setTimeout(() => {
        if (!collaborationCreationAttemptRef.current) return;
        const message = collaborationSocketOpenedRef.current
          ? "The WebSocket connected, but Sketchizi did not send its initial join request within 15 seconds. Check the browser console for the initial snapshot preparation and serialization timings."
          : "The collaboration WebSocket handshake did not complete within 15 seconds. Verify that VITE_COLLAB_WS_URL points to the running collaboration server, ends in /collaboration, and that the server's /health endpoint responds.";
        failCollaborationCreation(message);
      }, 15000);
    } catch (error) {
      collaborationCreationAttemptRef.current = false;
      setCollaborationCreationState("idle");
      setCollaborationError(error?.message || "Collaboration creation failed. Please try again.");
      setCollaborationOpen(true);
    }
  }, [collaborationDraftName, connectCollaboration, failCollaborationCreation, setCollaborationDisplayName]);

  const leaveOrEndCollaboration = useCallback((confirmed = false) => {
    const isHost = collaborationRole === "host";
    const confirmation = isHost
      ? "End collaboration for everyone? The session will close, and its chat history will no longer be available."
      : "Are you sure you want to leave this collaboration session?\n\nYou will disconnect from the session. Other participants will remain connected, and the session will continue.";
    if (!confirmed && !window.confirm(confirmation)) return false;
    if (isHost) {
      const endedRoomId = collaborationRef.current?.roomId || collaborationRoomId;
      setCollaborationEndedSession({ id: endedRoomId || `ended-${Date.now()}`, name: collaborationSessionName?.trim() || "Collaboration", link: collaborationLink || "", message: "This collaboration session has ended.", endedAt: Date.now(), returned: false });
      collaborationRef.current?.disconnect();
    } else collaborationRef.current?.leave();
    setChatMessages([]);
    setChatError("");
    setCollaborationHostRecovery(null);
    setCollaborationRoom(null);
    setCollaborationLink(null);
    setCollaborationSessionName("");
    setCollaborationUsers(0);
    setCollaborationParticipants([]);
    setCollaborationStatus("disconnected");
    setCollaborationRole(null);
    setCollaborationPermission(null);
    setCollaborationRequestState("none");
    setCollaborationRequests([]);
    setCollaborationAuthorship({});
    setCollaborationOpen(false);
    if (window.location.pathname.startsWith("/collab/")) window.history.replaceState({}, "", "/");
    return true;
  }, [collaborationRole, collaborationRoomId, collaborationSessionName, collaborationLink]);

  useEffect(() => {
    if (!sketchReady || !apiReady || !collaborationRoomId) return;
    collaborationCreationAttemptRef.current = false;
    clearCollaborationCreationTimeout();
    setCollaborationCreationState("idle");
    setCollaborationOpen(true);
    setCollaborationMode("join");
    setCollaborationRoom(null);
    setCollaborationLink(getCollaborationLink(collaborationRoomId));
    setCollaborationSessionName("");
    setCollaborationDisplayName((current) => current || getCollaborationDisplayName());
    setCollaborationParticipants([]);
    setCollaborationStatus("disconnected");
  }, [sketchReady, apiReady, collaborationRoomId]);

  useEffect(() => () => {
    clearCollaborationCreationTimeout();
    collaborationCreationAttemptRef.current = false;
    collaborationRef.current?.close();
  }, [clearCollaborationCreationTimeout]);

  const sendChatMessage = useCallback((text, audience, recipientId) => {
    setChatError("");
    if (collaborationHostRecovery?.state === "recovering") { setChatError("Chat sending is paused while the host reconnects."); return false; }
    const sent = collaborationRef.current?.sendChatMessage(text, audience, recipientId) || false;
    if (!sent) setChatError("Message could not be sent. Check the connection and message length.");
    return sent;
  }, [collaborationHostRecovery]);

  return {
    collaborationRef,
    collaborationRemoteUpdateRef,
    collaborationRoomId,
    collaborationClientId,
    collaborationOpen,
    setCollaborationOpen,
    collaborationMode,
    setCollaborationMode,
    collaborationDraftName,
    setCollaborationDraftName,
    collaborationDisplayName,
    setCollaborationDisplayName,
    collaborationSessionName,
    collaborationRoom,
    collaborationLink,
    collaborationStatus,
    collaborationHostRecovery,
    collaborationEndedSession,
    setCollaborationEndedSession,
    collaborationCreationState,
    collaborationUsers,
    collaborationParticipants,
    collaborationError,
    setCollaborationError,
    collaborationRole,
    collaborationPermission,
    collaborationRequestState,
    collaborationRequests,
    collaborationAuthorship,
    chatMessages,
    chatError,
    sendChatMessage,
    connectCollaboration,
    startCollaboration,
    createCollaboration,
    dismissCollaborationCreationFailure,
    leaveOrEndCollaboration,
    requestEditAccess,
    decideEditRequest,
    revokeEditAccess,
    updateCollaborationPresence,
    updateCollaborationCursor,
    markLocalViewportNavigation,
  };
}
