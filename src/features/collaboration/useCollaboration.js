import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const mergeCollaborativeElements = useCallback((remoteElements) => {
    const api = apiRef.current;
    if (!api || !Array.isArray(remoteElements)) return;
    const existingElements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements();
    const restoredRemote = restoreElements(remoteElements, existingElements, { repairBindings: true });
    const reconciled = reconcileElements(existingElements, restoredRemote, api.getAppState());
    collaborationRemoteUpdateRef.current = true;
    try {
      api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
    } finally {
      collaborationRemoteUpdateRef.current = false;
    }
  }, [apiRef]);

  const applyCollaborationState = useCallback(({ kind, elements, files, sourceClientId }) => {
    const api = apiRef.current;
    if (!api) return;
    if (kind === "initial") {
      const restored = restoreElements(elements || [], null, { repairBindings: true });
      collaborationRemoteUpdateRef.current = true;
      try {
        api.updateScene({
          elements: restored,
          appState: { ...api.getAppState(), selectedElementIds: {}, selectedGroupIds: {} },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        if (files && typeof files === "object") api.addFiles?.(Object.values(files));
        collaborationRef.current?.syncBaseline(
          api.getSceneElementsIncludingDeleted?.() || api.getSceneElements(),
          api.getFiles?.() || {},
        );
      } finally {
        collaborationRemoteUpdateRef.current = false;
      }
      return;
    }
    mergeCollaborativeElements(elements);
    if (sourceClientId && sourceClientId !== collaborationClientId) focusRemoteEditingArea(elements);
    if (Array.isArray(files) && files.length) api.addFiles?.(files);
    else if (files && typeof files === "object" && Object.keys(files).length) api.addFiles?.(Object.values(files));
    collaborationRef.current?.syncBaseline(
      api.getSceneElementsIncludingDeleted?.() || api.getSceneElements(),
      api.getFiles?.() || {},
    );
  }, [apiRef, collaborationClientId, focusRemoteEditingArea, mergeCollaborativeElements]);

  const connectCollaboration = useCallback((roomId, sessionName = "", participantName = "") => {
    const api = apiRef.current;
    if (!api || !roomId) return;
    const normalizedParticipantName = saveCollaborationDisplayName(participantName || collaborationDisplayName);
    if (!normalizedParticipantName) return;
    setCollaborationDisplayName(normalizedParticipantName);
    collaborationRef.current?.close();
    setCollaborationRoom(roomId);
    setCollaborationLink(getCollaborationLink(roomId));
    setCollaborationSessionName(sessionName.trim());
    setCollaborationError("");
    setCollaborationRole(null);

    const client = new SketchiziCollaboration({
      roomId,
      sessionName,
      api,
      onState: applyCollaborationState,
      onPresence: (participants) => {
        const next = Array.isArray(participants) ? participants : [];
        setCollaborationParticipants(next);
        setCollaborationUsers(next.filter((participant) => participant.status === "connected").length);
      },
      onStatus: setCollaborationStatus,
      onError: setCollaborationError,
      onRole: setCollaborationRole,
      onPermission: ({ permission, requestState }) => {
        setCollaborationPermission(permission || null);
        setCollaborationRequestState(requestState || "none");
      },
      onPermissionRequest: (request) => {
        if (request?.participantId) setCollaborationRequests((current) => current.some((item) => item.participantId === request.participantId) ? current : [...current, request]);
      },
      onAuthorship: setCollaborationAuthorship,
      onSessionInfo: ({ name }) => setCollaborationSessionName(name || "Collaboration"),
      onSessionEnded: (message) => {
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
  }, [apiRef, applyCollaborationState, collaborationDisplayName, showToast]);

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

  const startCollaboration = useCallback(() => {
    closeNativeMenu();
    if (collaborationRoom && collaborationRole) setCollaborationMode("active");
    else {
      setCollaborationMode("create");
      setCollaborationDraftName("");
      setCollaborationDisplayName((current) => current || getCollaborationDisplayName());
    }
    setCollaborationOpen(true);
  }, [closeNativeMenu, collaborationRoom, collaborationRole]);

  const createCollaboration = useCallback(() => {
    const name = collaborationDraftName.trim();
    const displayName = saveCollaborationDisplayName(collaborationDisplayName);
    if (!name || !displayName) return;
    setCollaborationDisplayName(displayName);
    const roomId = createCollaborationRoomId();
    setCollaborationMode("active");
    setCollaborationOpen(false);
    connectCollaboration(roomId, name, displayName);
  }, [collaborationDisplayName, collaborationDraftName, connectCollaboration]);

  const leaveOrEndCollaboration = useCallback(() => {
    const isHost = collaborationRole === "host";
    if (!window.confirm(isHost ? "End collaboration session?" : "Leave collaboration?")) return false;
    if (isHost) collaborationRef.current?.disconnect();
    else collaborationRef.current?.leave();
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
  }, [collaborationRole]);

  useEffect(() => {
    if (!sketchReady || !apiReady || !collaborationRoomId) return;
    setCollaborationOpen(true);
    setCollaborationMode("join");
    setCollaborationRoom(null);
    setCollaborationLink(getCollaborationLink(collaborationRoomId));
    setCollaborationSessionName("");
    setCollaborationDisplayName((current) => current || getCollaborationDisplayName());
    setCollaborationParticipants([]);
    setCollaborationStatus("disconnected");
  }, [sketchReady, apiReady, collaborationRoomId]);

  useEffect(() => () => collaborationRef.current?.close(), []);

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
    collaborationUsers,
    collaborationParticipants,
    collaborationError,
    setCollaborationError,
    collaborationRole,
    collaborationPermission,
    collaborationRequestState,
    collaborationRequests,
    collaborationAuthorship,
    connectCollaboration,
    startCollaboration,
    createCollaboration,
    leaveOrEndCollaboration,
    requestEditAccess,
    decideEditRequest,
    revokeEditAccess,
    updateCollaborationPresence,
    updateCollaborationCursor,
    markLocalViewportNavigation,
  };
}
