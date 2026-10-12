import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CollaborationPresence from "./CollaborationPresence";
import CollaborationShare from "./CollaborationShare";
import { findNewUnreadChatMessages, removeReadChatMessageIds } from "../../chatProtocol.js";
import { allocateSessionLabel, clearRecoveredDraft, createRecoveredSession, getRecoveredDraftHistory, getRecoveredSessions, updateRecoveredDraft, updateRecoveredDraftHistory } from "../../features/collaboration/recoveredDrafts.js";

function permissionLabel(permission) {
  return permission === "host" ? "Host" : permission === "editor" ? "Editor" : "Viewer";
}
function getRoomIdentity(link, roomId, sessionName) {
  const path = String(link || "").match(/\/collab\/([^/?#]+)/)?.[1];
  return path || roomId || `session-${String(sessionName || "collaboration").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
}
function formatEndedAt(timestamp) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function initials(name) {
  const parts = String(name || "Guest").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "G";
}

export default function CollaborationUI({
  open, setOpen, mode, status, hostRecovery = null, endedSession = null, onReturnToCanvas, onDismissEndedSession, draftName, setDraftName, displayName, setDisplayName, sessionName, link, users, participants, selfId, error,
  createCollaboration, connectCollaboration, roomId, role, permission, requestState, requests = [], onRequestEditAccess, onOpenDetails, onDecideEditRequest, onRevokeEditAccess, onLeaveOrEnd, showToast, collaborationCreationState,
  chatMessages = [], chatError = "", sendChatMessage = () => false,
}) {
  const count = Math.max(users, 1);
  const activeActivity = participants?.find((participant) => participant.participantId !== selfId && participant.status === "connected" && participant.activity !== "idle");
  const activityLabel = activeActivity ? `${activeActivity.displayName} is ${activeActivity.activity === "drawing" ? "drawing…" : "editing…"}` : "";
  const isViewer = permission === "viewer";
  const [chatOpen, setChatOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [audience, setAudience] = useState("everyone");
  const [recipientId, setRecipientId] = useState("");
  const [draft, setDraft] = useState("");
  const [unreadIds, setUnreadIds] = useState(() => new Set());
  const [headerTarget, setHeaderTarget] = useState(null);
  const [recoverySessions, setRecoverySessions] = useState(() => getRecoveredSessions());
  const [recoveryView, setRecoveryView] = useState(null);
  const [recoverySessionId, setRecoverySessionId] = useState(null);
  const [recoveryDraftId, setRecoveryDraftId] = useState(null);
  const [editorText, setEditorText] = useState("");
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [lifecycleConfirmation, setLifecycleConfirmation] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const [clockNow, setClockNow] = useState(Date.now());
  const hostDeadlineRef = useRef(null);
  const messagesRef = useRef(null);
  const atBottomRef = useRef(true);
  const previousMessageIdsRef = useRef(null);
  const previousRoleRef = useRef(null);
  const activeSessionRef = useRef(null);
  const detailsRef = useRef(null);

  const refreshRecovery = useCallback(() => setRecoverySessions(getRecoveredSessions()), []);
  useEffect(() => {
    const updateTarget = () => {
      const target = document.querySelector(".desktop-app-header-panel-actions");
      setHeaderTarget(window.innerWidth >= 1200 && target && window.getComputedStyle(target).display !== "none" ? target : null);
    };
    updateTarget();
    window.addEventListener("resize", updateTarget);
    return () => window.removeEventListener("resize", updateTarget);
  }, []);
  useEffect(() => {
    if (role === "host" && status === "reconnecting") {
      if (!hostDeadlineRef.current) hostDeadlineRef.current = Date.now() + 60000;
    } else if (status === "connected" || !role) hostDeadlineRef.current = null;
  }, [role, status]);
  useEffect(() => {
    if (!(hostRecovery?.state === "recovering" || (role === "host" && status === "reconnecting"))) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [hostRecovery?.state, role, status]);

  useEffect(() => {
    const ids = new Set((chatMessages || []).map((message) => message.id));
    if (previousMessageIdsRef.current === null) { previousMessageIdsRef.current = ids; return; }
    const added = findNewUnreadChatMessages(chatMessages, previousMessageIdsRef.current, selfId);
    if (added.length && (!chatOpen || !atBottomRef.current)) setUnreadIds((current) => new Set([...current, ...added.map((message) => message.id)]));
    if (chatOpen && atBottomRef.current) setUnreadIds(new Set());
    previousMessageIdsRef.current = ids;
  }, [chatMessages, selfId, chatOpen]);
  useEffect(() => {
    if (!chatOpen || !atBottomRef.current) return;
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatOpen, chatMessages]);
  useEffect(() => {
    const container = messagesRef.current;
    if (!chatOpen || !container || unreadIds.size === 0 || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      const readIds = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6).map((entry) => entry.target.getAttribute("data-chat-message-id")).filter(Boolean);
      if (readIds.length) setUnreadIds((current) => removeReadChatMessageIds(current, readIds));
    }, { root: container, threshold: [0.6] });
    container.querySelectorAll("[data-chat-message-id]").forEach((node) => { if (unreadIds.has(node.getAttribute("data-chat-message-id"))) observer.observe(node); });
    return () => observer.disconnect();
  }, [chatOpen, chatMessages, unreadIds]);

  useEffect(() => {
    if (role) {
      if (!activeSessionRef.current || activeSessionRef.current.id !== getRoomIdentity(link, roomId, sessionName)) {
        const label = allocateSessionLabel(sessionName && sessionName !== "Collaboration" ? sessionName : "");
        activeSessionRef.current = { id: getRoomIdentity(link, roomId, sessionName), name: label, link: link || "", startedAt: Date.now() };
      } else if (sessionName && sessionName !== "Collaboration") {
        activeSessionRef.current.name = sessionName;
      }
    } else if (previousRoleRef.current && activeSessionRef.current) {
      const session = activeSessionRef.current;
      if (draft.trim()) {
        createRecoveredSession({ id: session.id, name: session.name, endedAt: Date.now(), draftText: draft });
        refreshRecovery();
        setDraft("");
      }
      activeSessionRef.current = null;
      setChatOpen(false);
      setDetailsOpen(false);
      setUnreadIds(new Set());
    }
    previousRoleRef.current = role || null;
  }, [role, roomId, link, sessionName, draft, refreshRecovery]);

  useEffect(() => {
    if (role !== "host") setRecipientId("");
    if (role === "host" && audience === "host") setAudience("participant");
    if (role !== "host" && audience === "participant") setAudience("host");
    setChatOpen(false);
    setUnreadIds(new Set());
    previousMessageIdsRef.current = new Set((chatMessages || []).map((message) => message.id));
    atBottomRef.current = true;
  }, [roomId, role]);
  const connectedRecipients = (participants || []).filter((participant) => participant.participantId !== selfId && participant.status === "connected");
  useEffect(() => {
    if (role === "host" && recipientId && !connectedRecipients.some((participant) => participant.participantId === recipientId)) setRecipientId("");
  }, [role, recipientId, participants, selfId]);
  const sendChat = () => {
    const text = draft.trim();
    if (!text || text.length > 4000 || status !== "connected" || (role === "host" && audience === "participant" && (!recipientId || !connectedRecipients.some((participant) => participant.participantId === recipientId)))) return;
    const protocolAudience = audience === "participant" ? "host" : audience;
    if (sendChatMessage(text, protocolAudience, role === "host" && audience === "participant" ? recipientId : null)) setDraft("");
  };
  const visibleUnreadCount = unreadIds.size;
  const hostRecovering = hostRecovery?.state === "recovering" || (role === "host" && status === "reconnecting");
  const joineeReconnecting = Boolean(role && role !== "host" && status === "reconnecting");
  const recoveryDeadline = Number(hostRecovery?.deadline) || hostDeadlineRef.current;
  const recoverySeconds = recoveryDeadline ? Math.max(0, Math.ceil((recoveryDeadline - clockNow) / 1000)) : 60;
  const handleMessageScroll = () => {
    const node = messagesRef.current;
    if (!node) return;
    atBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
    if (atBottomRef.current) setUnreadIds(new Set());
  };
  const closeOtherPopovers = () => window.dispatchEvent(new CustomEvent("sketchizi:close-participant-popover"));
  const toggleChat = () => { closeOtherPopovers(); setDetailsOpen(false); setChatOpen((value) => { if (!value) { atBottomRef.current = true; setUnreadIds(new Set()); } return !value; }); };
  const toggleDetails = () => { closeOtherPopovers(); setChatOpen(false); setDetailsOpen((value) => !value); };

  const openSessionRecovery = () => { refreshRecovery(); setRecoveryView("sessions"); setRecoverySessionId(null); setRecoveryDraftId(null); setDetailsOpen(false); };
  const selectedRecoverySession = recoverySessions.find((item) => item.id === recoverySessionId) || null;
  const selectedRecoveryDraft = selectedRecoverySession?.drafts.find((item) => item.id === recoveryDraftId) || null;
  useEffect(() => {
    if (!selectedRecoveryDraft) { setEditorText(""); setUndoStack([]); setRedoStack([]); return; }
    setEditorText(selectedRecoveryDraft.text || "");
    const history = getRecoveredDraftHistory(selectedRecoverySession.id, selectedRecoveryDraft.id);
    setUndoStack(history.undoStack); setRedoStack(history.redoStack);
  }, [recoverySessionId, recoveryDraftId]);
  const editRecoveredDraft = (nextText) => {
    if (!selectedRecoverySession || !selectedRecoveryDraft) return;
    const nextUndo = [...undoStack.slice(-99), editorText];
    setUndoStack(nextUndo); setRedoStack([]); setEditorText(nextText);
    updateRecoveredDraft(selectedRecoverySession.id, selectedRecoveryDraft.id, nextText);
    updateRecoveredDraftHistory(selectedRecoverySession.id, selectedRecoveryDraft.id, nextUndo, []); refreshRecovery();
    setDraftNotice("Draft updated");
  };
  const undoDraftEdit = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1]; const nextUndo = undoStack.slice(0, -1); const nextRedo = [...redoStack, editorText];
    setUndoStack(nextUndo); setRedoStack(nextRedo); setEditorText(previous);
    if (selectedRecoverySession && selectedRecoveryDraft) { updateRecoveredDraft(selectedRecoverySession.id, selectedRecoveryDraft.id, previous); updateRecoveredDraftHistory(selectedRecoverySession.id, selectedRecoveryDraft.id, nextUndo, nextRedo); }
    refreshRecovery(); setDraftNotice("Edit undone");
  };
  const redoDraftEdit = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1]; const nextRedo = redoStack.slice(0, -1); const nextUndo = [...undoStack, editorText];
    setRedoStack(nextRedo); setUndoStack(nextUndo); setEditorText(next);
    if (selectedRecoverySession && selectedRecoveryDraft) { updateRecoveredDraft(selectedRecoverySession.id, selectedRecoveryDraft.id, next); updateRecoveredDraftHistory(selectedRecoverySession.id, selectedRecoveryDraft.id, nextUndo, nextRedo); }
    refreshRecovery(); setDraftNotice("Edit redone");
  };
  const copyRecoveredDraft = async () => {
    try { await navigator.clipboard.writeText(editorText); setDraftNotice("Draft copied"); }
    catch { setDraftNotice("Clipboard access unavailable. Select and copy the text manually."); }
  };
  const confirmClearDraft = () => {
    if (!selectedRecoverySession || !selectedRecoveryDraft) return;
    clearRecoveredDraft(selectedRecoverySession.id, selectedRecoveryDraft.id); refreshRecovery(); setClearConfirmation(false); setDraftNotice("Draft cleared");
    setRecoveryDraftId(null); setEditorText(""); setUndoStack([]); setRedoStack([]);
    const nextSession = getRecoveredSessions().find((item) => item.id === selectedRecoverySession.id);
    if (!nextSession) { setRecoveryView("sessions"); setRecoverySessionId(null); }
  };

  const controls = role && status !== "disconnected" ? (
    <div className="collaboration-header-controls" aria-label="Collaboration controls">
      <div className="collaboration-header-session" title={sessionName || "Collaboration"}>
        <span className={`collaboration-header-status-dot ${status}`} />
        <span>{sessionName || "Collaboration"}</span>
      </div>
      <CollaborationPresence participants={participants} selfId={selfId} activityLabel={activityLabel} role={role} onRevokeEditAccess={onRevokeEditAccess} />
      {role === "host" && requests.length > 0 && <button type="button" className="collaboration-header-button collaboration-request-pill" onClick={() => onOpenDetails?.()}>{requests.length} edit request{requests.length === 1 ? "" : "s"}</button>}
      {isViewer && <button type="button" className="collaboration-header-button collaboration-request-pill" disabled={requestState === "pending"} onClick={onRequestEditAccess}>{requestState === "pending" ? "Request pending" : "Request edit access"}</button>}
      <button type="button" className="collaboration-header-button" onClick={toggleChat} aria-expanded={chatOpen} aria-label={`Chat${visibleUnreadCount ? `, ${visibleUnreadCount} unread messages` : ""}`}>
        Chat{visibleUnreadCount > 0 && <span className="collaboration-chat-badge">{visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}</span>}
      </button>
      <div className="collaboration-details-anchor" ref={detailsRef}>
        <button type="button" className="collaboration-header-button" onClick={toggleDetails} aria-expanded={detailsOpen}>Details <span aria-hidden="true">⌄</span></button>
        {detailsOpen && <div className="collaboration-details-popover" role="menu" aria-label="Collaboration details">
          <button type="button" role="menuitem" onClick={() => { setDetailsOpen(false); onOpenDetails?.(); }}><span className="collaboration-menu-icon">ⓘ</span><span><strong>Session info</strong><small>{sessionName || "Collaboration"}</small></span></button>
          <button type="button" role="menuitem" onClick={() => { setDetailsOpen(false); onOpenDetails?.(); }}><span className="collaboration-menu-icon">♙</span><span><strong>Participants ({count})</strong><small>View roles and connection status</small></span></button>
          {recoverySessions.length > 0 && <button type="button" role="menuitem" onClick={openSessionRecovery}><span className="collaboration-menu-icon">▤</span><span><strong>Ended sessions</strong><small>{recoverySessions.length} sessions · {recoverySessions.reduce((sum, item) => sum + item.drafts.length, 0)} recovered drafts</small></span></button>}
          <div className="collaboration-details-divider" />
          <div className="collaboration-details-session"><strong>{role === "host" ? "Host controls" : "Participant controls"}</strong><span>{role === "host" ? "Ending closes the session for everyone." : "Leaving does not end the session for others."}</span></div>
          <button type="button" className="is-danger" role="menuitem" onClick={() => { setDetailsOpen(false); setLifecycleConfirmation(true); }}>{role === "host" ? "End collaboration" : "Leave session"}</button>
        </div>}
      </div>
      {role === "host" && <CollaborationShare link={link} sessionName={sessionName} showToast={showToast} compact />}
    </div>
  ) : (recoverySessions.length > 0 || endedSession) ? (
    <div className="collaboration-header-controls recovery-only-controls">{endedSession?.returned && <span className="collaboration-ended-indicator"><span className="collaboration-header-status-dot ended" />Session ended</span>}{recoverySessions.length > 0 && <button type="button" className="collaboration-header-button" onClick={openSessionRecovery}>Ended sessions <span className="collaboration-chat-badge">{recoverySessions.length}</span></button>}</div>
  ) : null;
  useEffect(() => {
    if (!detailsOpen) return undefined;
    const onPointerDown = (event) => { if (!detailsRef.current?.contains(event.target)) setDetailsOpen(false); };
    const onKeyDown = (event) => { if (event.key === "Escape") setDetailsOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [detailsOpen]);

  useEffect(() => {
    if (!recoveryView && !clearConfirmation) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (clearConfirmation) { event.preventDefault(); event.stopPropagation(); setClearConfirmation(false); return; }
      if (recoveryView === "draft") { event.preventDefault(); event.stopPropagation(); return; }
      event.preventDefault(); event.stopPropagation();
      if (recoveryView === "session") setRecoveryView("sessions");
      else setRecoveryView(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [recoveryView, clearConfirmation]);

  const recoveryPanel = recoveryView && (
    <div className={`collaboration-recovery-backdrop ${recoveryView === "draft" ? "is-editor" : ""}`} role="presentation">
      <section className="collaboration-recovery-panel" role="dialog" aria-modal="true" aria-label={recoveryView === "sessions" ? "Ended sessions" : recoveryView === "session" ? "Recovered drafts" : "Recovered draft editor"}>
        {recoveryView === "sessions" && <>
          <header className="collaboration-recovery-header"><div><h2>Ended sessions</h2><p>View and recover unsent message drafts.</p></div><button type="button" aria-label="Close ended sessions" onClick={() => setRecoveryView(null)}>×</button></header>
          <div className="collaboration-recovery-list">{recoverySessions.length === 0 ? <p className="collaboration-recovery-empty">No recovered drafts remain.</p> : recoverySessions.map((session) => <button type="button" className="collaboration-recovery-session-row" key={session.id} onClick={() => { setRecoverySessionId(session.id); setRecoveryView("session"); }}><span className="collaboration-recovery-file-icon">▤</span><span className="collaboration-recovery-session-copy"><strong>{session.name}</strong><small>Ended {formatEndedAt(session.endedAt)}</small></span><span className="collaboration-recovery-count">{session.drafts.length} {session.drafts.length === 1 ? "draft" : "drafts"}</span><span aria-hidden="true">›</span></button>)}</div>
        </>}
        {recoveryView === "session" && selectedRecoverySession && <>
          <header className="collaboration-recovery-header"><div><button type="button" className="collaboration-recovery-back" onClick={() => setRecoveryView("sessions")}>← Back to Ended sessions</button><h2>{selectedRecoverySession.name}</h2><p>Ended {formatEndedAt(selectedRecoverySession.endedAt)}</p></div><button type="button" aria-label="Close recovery" onClick={() => setRecoveryView(null)}>×</button></header>
          <div className="collaboration-recovery-list"><h3>Recovered drafts ({selectedRecoverySession.drafts.length})</h3>{selectedRecoverySession.drafts.map((item) => <button type="button" className="collaboration-recovery-draft-row" key={item.id} onClick={() => { setRecoveryDraftId(item.id); setRecoveryView("draft"); }}><span className="collaboration-recovery-number">{item.number}.</span><span className="collaboration-recovery-session-copy"><strong>Recovered draft {item.number} <em>Not sent</em></strong><small>{item.text.trim().replace(/\s+/g, " ").slice(0, 80) || "(Empty draft)"}</small></span><span aria-hidden="true">›</span></button>)}</div>
        </>}
        {recoveryView === "draft" && selectedRecoverySession && selectedRecoveryDraft && <>
          <header className="collaboration-recovery-header editor-heading"><div><button type="button" className="collaboration-recovery-back" onClick={() => setRecoveryView("session")}>← Back to recovered drafts</button><h2>{selectedRecoverySession.name}</h2><p>Ended {formatEndedAt(selectedRecoverySession.endedAt)}</p></div><span className="collaboration-not-sent">Not sent</span></header>
          <div className="collaboration-recovery-editor-layout">
            <aside className="collaboration-recovery-draft-nav"><h3>Recovered drafts ({selectedRecoverySession.drafts.length})</h3>{selectedRecoverySession.drafts.map((item) => <button type="button" key={item.id} className={item.id === recoveryDraftId ? "active" : ""} onClick={() => setRecoveryDraftId(item.id)}><strong>{item.number}. <em>Not sent</em></strong><small>{item.text.trim().replace(/\s+/g, " ").slice(0, 48) || "(Empty draft)"}</small></button>)}</aside>
            <div className="collaboration-recovery-editor-main"><div className="collaboration-recovery-editor-toolbar"><button type="button" disabled={!undoStack.length} title="Undo (Ctrl/Cmd+Z)" onClick={undoDraftEdit}>↶ <span>Undo</span></button><button type="button" disabled={!redoStack.length} title="Redo (Ctrl+Y / Cmd+Shift+Z)" onClick={redoDraftEdit}>↷ <span>Redo</span></button><span className="collaboration-toolbar-spacer" /><button type="button" onClick={copyRecoveredDraft}>▢ <span>Copy</span></button><button type="button" className="is-danger" onClick={() => setClearConfirmation(true)}>♜ <span>Clear draft</span></button></div>
              <textarea className="collaboration-recovered-textarea" aria-label="Recovered draft text" value={editorText} onChange={(event) => editRecoveredDraft(event.target.value)} onKeyDown={(event) => { const mac = /Mac|iPhone|iPad/.test(navigator.platform || ""); const mod = mac ? event.metaKey : event.ctrlKey; if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redoDraftEdit(); else undoDraftEdit(); } else if (!mac && event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); redoDraftEdit(); } }} placeholder="This draft is empty. Start typing to add your message." />
              <div className="collaboration-recovery-editor-footer"><span>{editorText.length} characters</span><span>Saved in this tab</span></div>
              {draftNotice && <div className="collaboration-draft-notice" role="status"><span>{draftNotice}</span>{(draftNotice === "Draft updated" || draftNotice === "Edit redone") && undoStack.length > 0 && <button type="button" onClick={undoDraftEdit}>Undo</button>}{draftNotice === "Edit undone" && redoStack.length > 0 && <button type="button" onClick={redoDraftEdit}>Redo</button>}<button type="button" aria-label="Dismiss notice" onClick={() => setDraftNotice("")}>×</button></div>}
            </div>
          </div>
          {clearConfirmation && <div className="collaboration-confirm-backdrop"><section className="collaboration-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-draft-title"><h3 id="clear-draft-title">Clear unsent draft?</h3><p>This will permanently discard your recovered message from this browser tab. You cannot undo this action.</p><div><button type="button" className="secondary" onClick={() => setClearConfirmation(false)}>Cancel</button><button type="button" className="is-danger" onClick={confirmClearDraft}>Clear draft</button></div></section></div>}
        </>}
      </section>
    </div>
  );

  return (
    <>
      {open && <div className="collaboration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="collaboration-dialog" role="dialog" aria-modal="true" aria-labelledby="collaboration-title"><div className="collaboration-dialog-header"><div><strong id="collaboration-title">{mode === "create" ? "Create collaboration" : mode === "join" ? "Join collaboration" : "Collaboration"}</strong>{mode === "active" && <span className={`collaboration-status ${status}`}>{status}</span>}</div><button type="button" onClick={() => setOpen(false)} aria-label="Close collaboration">×</button></div>
        {mode === "create" && collaborationCreationState === "blocked" && <div className="collaboration-copy" role="status">Hosting is currently unavailable. Close this dialog and try Start Collaboration again when sign-in is available.</div>}
        {mode === "create" && collaborationCreationState === "creating" && <p className="collaboration-copy" role="status">Verifying your account and creating collaboration…</p>}
        {mode === "create" && collaborationCreationState === "idle" && <><label className="collaboration-field"><span>Collaboration name</span><input autoFocus value={draftName} maxLength={120} placeholder="e.g. Backend Architecture Discussion" onChange={(event) => setDraftName(event.target.value)} /></label><div className="collaboration-actions"><button type="button" disabled={!draftName.trim()} onClick={createCollaboration}>Create collaboration</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div></>}
        {mode === "join" && <><p className="collaboration-copy">You were invited to join this collaboration.</p><label className="collaboration-field"><span>Your name</span><input autoFocus value={displayName} maxLength={48} placeholder="e.g. Alex" onChange={(event) => setDisplayName(event.target.value)} /></label><div className="collaboration-field"><span>Share link</span><input readOnly value={link || ""} /></div><div className="collaboration-actions"><button type="button" disabled={!displayName.trim()} onClick={() => { setOpen(false); connectCollaboration(roomId, "", displayName); }}>Join collaboration</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div></>}
        {mode === "active" && <><div className="collaboration-session-summary"><strong>{sessionName || "Collaboration"}</strong><span>{count} {count === 1 ? "person" : "people"} connected · You: {permissionLabel(permission)}</span></div>{isViewer && <div className="collaboration-permission-banner"><strong>Read-only</strong><span>You can view, pan, zoom and follow the room. Editing requires host approval.</span><button type="button" disabled={requestState === "pending"} onClick={onRequestEditAccess}>{requestState === "pending" ? "Edit access requested…" : requestState === "denied" ? "Request edit access again" : "Request edit access"}</button></div>}{requestState === "approved" && !isViewer && <div className="collaboration-permission-success">You can now edit this canvas.</div>}{requestState === "denied" && isViewer && <div className="collaboration-permission-denied">Edit request declined.</div>}{role === "host" && requests.length > 0 && <div className="collaboration-request-list"><strong>Edit requests</strong>{requests.map((request) => <div className="collaboration-request-row" key={request.participantId}><div><b>{request.displayName}</b><span>wants to edit</span></div><div><button type="button" onClick={() => onDecideEditRequest(request.participantId, "approve")}>Allow</button><button type="button" className="secondary" onClick={() => onDecideEditRequest(request.participantId, "deny")}>Deny</button></div></div>)}</div>}<CollaborationPresence participants={participants} selfId={selfId} activityLabel={activityLabel} role={role} onRevokeEditAccess={onRevokeEditAccess} /><div className="collaboration-field"><span>Share link</span><input readOnly value={link || ""} /></div><div className="collaboration-actions"><CollaborationShare link={link} sessionName={sessionName} showToast={showToast} /><button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button></div></>}
        {error && <div className="collaboration-error" role="alert">{error}</div>}
      </section></div>}
      {headerTarget && controls && createPortal(controls, headerTarget)}
      {hostRecovering && <div className="collaboration-recovery-banner is-host-recovering" role="status"><span className="collaboration-banner-symbol">!</span><div><strong>{role === "host" ? "Reconnecting to collaboration" : "The host is disconnected"}</strong><span>{role === "host" ? "Trying to restore your connection…" : "We're trying to reconnect automatically. Editing and chat sending are paused."}</span></div><div className="collaboration-recovery-countdown"><span>{recoverySeconds}s</span><span className="collaboration-recovery-progress"><i style={{ width: `${Math.max(0, Math.min(100, recoverySeconds / 60 * 100))}%` }} /></span></div></div>}
      {joineeReconnecting && <div className="collaboration-recovery-banner is-joinee-reconnecting" role="status"><span className="collaboration-banner-symbol">↻</span><div><strong>Reconnecting to the session…</strong><span>We'll rejoin automatically once the connection is restored. Editing and chat sending are paused.</span></div></div>}
      {endedSession && !endedSession.returned && <div className="collaboration-recovery-banner is-ended" role="status"><span className="collaboration-banner-symbol">i</span><div><strong>This collaboration session has ended</strong><span>You can still view the final diagram, but it's read-only.</span></div><div className="collaboration-ended-actions">{recoverySessions.length > 0 && <button type="button" onClick={openSessionRecovery}>View recovered drafts</button>}<button type="button" className="primary" onClick={onReturnToCanvas}>Return to canvas</button></div></div>}
      {!headerTarget && !role && (endedSession || recoverySessions.length > 0) && <div className="collaboration-mobile-ended-controls">{endedSession?.returned && <span><span className="collaboration-header-status-dot ended" />Session ended</span>}{recoverySessions.length > 0 && <button type="button" className="collaboration-header-button" onClick={openSessionRecovery}>Ended sessions <span className="collaboration-chat-badge">{recoverySessions.length}</span></button>}</div>}
      {!headerTarget && role && status !== "disconnected" && <div className="collaboration-status-bar" role="status" aria-label="Collaboration status"><div className="collaboration-status-info"><strong title={sessionName}>{sessionName || "Collaboration"}</strong><span className={`collaboration-connection-state ${status}`}>● {status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting…" : "Connecting…"} · {permissionLabel(permission)}</span></div><CollaborationPresence participants={participants} selfId={selfId} activityLabel={activityLabel} role={role} onRevokeEditAccess={onRevokeEditAccess} /><div className="collaboration-status-actions">{role === "host" && requests.length > 0 && <button type="button" className="collaboration-request-pill" onClick={() => onOpenDetails?.()}>{requests.length} edit request{requests.length === 1 ? "" : "s"}</button>}{isViewer && <button type="button" className="collaboration-request-pill" disabled={requestState === "pending"} onClick={onRequestEditAccess}>{requestState === "pending" ? "Request pending" : "Request edit access"}</button>}{role === "host" && <CollaborationShare link={link} sessionName={sessionName} showToast={showToast} compact />}<button type="button" className="collaboration-status-link collaboration-chat-trigger" onClick={toggleChat}>Chat{visibleUnreadCount > 0 && <span className="collaboration-chat-badge">{visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}</span>}</button><button type="button" className="collaboration-status-link" onClick={toggleDetails}>Details</button><button type="button" className="collaboration-lifecycle-button" onClick={() => setLifecycleConfirmation(true)}>{role === "host" ? "End collaboration" : "Leave"}</button></div>{detailsOpen && <div className="collaboration-details-popover fallback" role="menu"><button type="button" onClick={openSessionRecovery}>Ended sessions</button><button type="button" onClick={() => setLifecycleConfirmation(true)}>{role === "host" ? "End collaboration" : "Leave session"}</button></div>}</div>}
      {role && status !== "disconnected" && chatOpen && <section className="collaboration-chat-panel" aria-label="Collaboration chat"><header className="collaboration-chat-header"><strong>Chat</strong><button type="button" onClick={() => setChatOpen(false)} aria-label="Close chat">×</button></header><div className="collaboration-chat-messages" ref={messagesRef} onScroll={handleMessageScroll} role="log" aria-live="polite">{chatMessages.length === 0 && <p className="collaboration-chat-empty">No messages yet. Start the conversation.</p>}{chatMessages.map((message, index) => { const previous = chatMessages[index - 1]; const grouped = previous && previous.senderId === message.senderId && previous.audience === message.audience && previous.conversationId === message.conversationId && Math.abs(Number(message.timestamp) - Number(previous.timestamp)) < 5 * 60 * 1000; return <article data-chat-message-id={message.id} className={`collaboration-chat-message ${message.senderId === selfId ? "is-own" : ""} ${grouped ? "is-grouped" : ""}`} key={message.id}>{!grouped && <div className="collaboration-chat-message-meta"><strong>{message.senderId === selfId ? "You" : message.senderName}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>}{message.audience === "host" && <span className="collaboration-chat-private-label">{role === "host" && message.senderId === selfId ? "Participant · Private" : "Host only · Private"}</span>}<p>{message.text}</p></article>; })}</div>{visibleUnreadCount > 0 && <button type="button" className="collaboration-chat-new-messages" onClick={() => { atBottomRef.current = true; setUnreadIds(new Set()); const node = messagesRef.current; if (node) node.scrollTop = node.scrollHeight; }}>↓ {visibleUnreadCount} new message{visibleUnreadCount === 1 ? "" : "s"}</button>}<form className="collaboration-chat-composer" onSubmit={(event) => { event.preventDefault(); sendChat(); }}><div className="collaboration-chat-audience-row"><label><span>Send to</span><select value={role === "host" && audience === "host" ? "participant" : audience} onChange={(event) => setAudience(event.target.value)} disabled={status !== "connected"}><option value="everyone">Everyone</option>{role === "host" ? <option value="participant">Participant</option> : <option value="host">Host only</option>}</select></label>{role === "host" && audience === "participant" && <label><span>Participant</span><select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} disabled={connectedRecipients.length === 0 || status !== "connected"}><option value="">Choose participant</option>{connectedRecipients.map((participant) => <option key={participant.participantId} value={participant.participantId}>{participant.displayName}</option>)}</select></label>}</div><textarea value={draft} maxLength={4000} rows={2} placeholder={status === "connected" && !hostRecovering ? "Write a message…" : "Sending paused while reconnecting…"} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendChat(); } }} aria-label="Chat message" />{role === "host" && audience === "participant" && connectedRecipients.length === 0 && <p className="collaboration-chat-error" role="status">No connected participants are available for a private message.</p>}{chatError && <p className="collaboration-chat-error" role="alert">{chatError}</p>}<div className="collaboration-chat-send-row"><span>{draft.length}/4000 · Shift+Enter for newline</span><button type="submit" disabled={!draft.trim() || draft.length > 4000 || status !== "connected" || hostRecovering || (role === "host" && audience === "participant" && (!recipientId || connectedRecipients.length === 0))}>Send</button></div></form></section>}
      {lifecycleConfirmation && <div className="collaboration-confirm-backdrop collaboration-lifecycle-confirm-backdrop"><section className="collaboration-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="collaboration-lifecycle-title"><h3 id="collaboration-lifecycle-title">{role === "host" ? "End collaboration for everyone?" : "Leave collaboration session?"}</h3><p>{role === "host" ? "The session will close, and its chat history will no longer be available." : "You will disconnect from the session. Other participants will remain connected, and the session will continue."}</p><div><button type="button" className="secondary" onClick={() => setLifecycleConfirmation(false)}>{role === "host" ? "Cancel" : "Stay"}</button><button type="button" className={role === "host" ? "is-danger" : "primary"} onClick={() => { setLifecycleConfirmation(false); onLeaveOrEnd?.(true); }}>{role === "host" ? "End collaboration" : "Leave session"}</button></div></section></div>}
      {recoveryPanel}
    </>
  );
}
