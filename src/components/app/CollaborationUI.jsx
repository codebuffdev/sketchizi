import { useEffect, useRef, useState } from "react";
import CollaborationPresence from "./CollaborationPresence";
import CollaborationShare from "./CollaborationShare";
import { findNewUnreadChatMessages, removeReadChatMessageIds } from "../../chatProtocol.js";

function permissionLabel(permission) {
  return permission === "host" ? "Host" : permission === "editor" ? "Editor" : "Viewer";
}

export default function CollaborationUI({
  open, setOpen, mode, status, draftName, setDraftName, displayName, setDisplayName, sessionName, link, users, participants, selfId, error,
  createCollaboration, connectCollaboration, roomId, role, permission, requestState, requests = [], onRequestEditAccess, onOpenDetails, onDecideEditRequest, onRevokeEditAccess, onLeaveOrEnd, showToast, collaborationCreationState,
  chatMessages = [], chatError = "", sendChatMessage = () => false,
}) {
  const count = Math.max(users, 1);
  const activeActivity = participants?.find((participant) => participant.participantId !== selfId && participant.status === "connected" && participant.activity !== "idle");
  const activityLabel = activeActivity ? `${activeActivity.displayName} is ${activeActivity.activity === "drawing" ? "drawing…" : "editing…"}` : "";
  const isViewer = permission === "viewer";
  const [chatOpen, setChatOpen] = useState(false);
  const [audience, setAudience] = useState("everyone");
  const [recipientId, setRecipientId] = useState("");
  const [draft, setDraft] = useState("");
  const [unreadIds, setUnreadIds] = useState(() => new Set());
  const messagesRef = useRef(null);
  const atBottomRef = useRef(true);
  const previousMessageIdsRef = useRef(null);
  useEffect(() => {
    const ids = new Set((chatMessages || []).map((message) => message.id));
    if (previousMessageIdsRef.current === null) {
      previousMessageIdsRef.current = ids;
      return;
    }
    const added = findNewUnreadChatMessages(chatMessages, previousMessageIdsRef.current, selfId);
    if (added.length) {
      setUnreadIds((current) => new Set([...current, ...added.map((message) => message.id)]));
    }
    previousMessageIdsRef.current = ids;
  }, [chatMessages, selfId]);
  useEffect(() => {
    if (!chatOpen || !atBottomRef.current) return;
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatOpen, chatMessages]);
  useEffect(() => {
    const container = messagesRef.current;
    if (!chatOpen || !container || unreadIds.size === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const readIds = entries
        .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
        .map((entry) => entry.target.getAttribute("data-chat-message-id"))
        .filter(Boolean);
      if (readIds.length) setUnreadIds((current) => removeReadChatMessageIds(current, readIds));
    }, { root: container, threshold: [0.6] });
    container.querySelectorAll("[data-chat-message-id]").forEach((node) => {
      if (unreadIds.has(node.getAttribute("data-chat-message-id"))) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [chatOpen, chatMessages, unreadIds]);
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
    if (!text || text.length > 4000 || (role === "host" && audience === "participant" && (!recipientId || !connectedRecipients.some((participant) => participant.participantId === recipientId)))) return;
    const protocolAudience = audience === "participant" ? "host" : audience;
    if (sendChatMessage(text, protocolAudience, role === "host" && audience === "participant" ? recipientId : null)) setDraft("");
  };
  const visibleUnreadCount = unreadIds.size;
  const handleMessageScroll = () => {
    const node = messagesRef.current;
    if (!node) return;
    atBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
  };
  return (
    <>
      {open && (
        <div className="collaboration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="collaboration-dialog" role="dialog" aria-modal="true" aria-labelledby="collaboration-title">
            <div className="collaboration-dialog-header">
              <div>
                <strong id="collaboration-title">{mode === "create" ? "Create collaboration" : mode === "join" ? "Join collaboration" : "Collaboration"}</strong>
                {mode === "active" && <span className={`collaboration-status ${status}`}>{status}</span>}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close collaboration">×</button>
            </div>
            {mode === "create" && collaborationCreationState === "idle" && <>
              <label className="collaboration-field"><span>Collaboration name</span><input autoFocus value={draftName} maxLength={120} placeholder="e.g. Backend Architecture Discussion" onChange={(event) => setDraftName(event.target.value)} /></label>
              <label className="collaboration-field"><span>Your name</span><input value={displayName} maxLength={48} placeholder="e.g. Alex" onChange={(event) => setDisplayName(event.target.value)} /></label>
              <div className="collaboration-actions"><button type="button" disabled={!draftName.trim() || !displayName.trim()} onClick={createCollaboration}>Create collaboration</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>
            </>}
            {mode === "join" && <>
              <p className="collaboration-copy">You were invited to join this collaboration.</p>
              <label className="collaboration-field"><span>Your name</span><input autoFocus value={displayName} maxLength={48} placeholder="e.g. Alex" onChange={(event) => setDisplayName(event.target.value)} /></label>
              <div className="collaboration-field"><span>Share link</span><input readOnly value={link || ""} /></div>
              <div className="collaboration-actions"><button type="button" disabled={!displayName.trim()} onClick={() => { setOpen(false); connectCollaboration(roomId, "", displayName); }}>Join collaboration</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>
            </>}
            {mode === "active" && <>
              <div className="collaboration-session-summary"><strong>{sessionName || "Collaboration"}</strong><span>{count} {count === 1 ? "person" : "people"} connected · You: {permissionLabel(permission)}</span></div>
              {isViewer && <div className="collaboration-permission-banner"><strong>Read-only</strong><span>You can view, pan, zoom and follow the room. Editing requires host approval.</span><button type="button" disabled={requestState === "pending"} onClick={onRequestEditAccess}>{requestState === "pending" ? "Edit access requested…" : requestState === "denied" ? "Request edit access again" : "Request edit access"}</button></div>}
              {requestState === "approved" && isViewer === false && <div className="collaboration-permission-success">You can now edit this canvas.</div>}
              {requestState === "denied" && isViewer && <div className="collaboration-permission-denied">Edit request declined.</div>}
              {role === "host" && requests.length > 0 && <div className="collaboration-request-list"><strong>Edit requests</strong>{requests.map((request) => <div className="collaboration-request-row" key={request.participantId}><div><b>{request.displayName}</b><span>wants to edit</span></div><div><button type="button" onClick={() => onDecideEditRequest(request.participantId, "approve")}>Allow</button><button type="button" className="secondary" onClick={() => onDecideEditRequest(request.participantId, "deny")}>Deny</button></div></div>)}</div>}
              <CollaborationPresence participants={participants} selfId={selfId} activityLabel={activityLabel} role={role} onRevokeEditAccess={onRevokeEditAccess} />
              <div className="collaboration-field"><span>Share link</span><input readOnly value={link || ""} /></div>
              <div className="collaboration-actions"><CollaborationShare link={link} sessionName={sessionName} showToast={showToast} /><button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button></div>
            </>}
            {error && <div className="collaboration-error" role="alert">{error}</div>}
          </section>
        </div>
      )}
      {role && status !== "disconnected" && (
        <div className="collaboration-status-bar" role="status" aria-label="Collaboration status">
          <div className="collaboration-status-info"><strong title={sessionName}>{sessionName || "Collaboration"}</strong><span className={`collaboration-connection-state ${status}`}>● {status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting…" : status === "connecting" ? "Connecting…" : "Disconnected"} · {permissionLabel(permission)}</span></div>
          <CollaborationPresence participants={participants} selfId={selfId} activityLabel={activityLabel} role={role} onRevokeEditAccess={onRevokeEditAccess} />
          <div className="collaboration-status-actions">
            {role === "host" && requests.length > 0 && <button type="button" className="collaboration-request-pill" onClick={() => setOpen(true)}>{requests.length} edit request{requests.length === 1 ? "" : "s"}</button>}
            {isViewer && <button type="button" className="collaboration-request-pill" disabled={requestState === "pending"} onClick={onRequestEditAccess}>{requestState === "pending" ? "Request pending" : "Request edit access"}</button>}
            {role === "host" && <CollaborationShare link={link} sessionName={sessionName} showToast={showToast} compact />}
            <button type="button" className="collaboration-status-link collaboration-chat-trigger" onClick={() => setChatOpen((value) => { if (!value) atBottomRef.current = true; return !value; })} aria-expanded={chatOpen} aria-label={`Chat${visibleUnreadCount ? `, ${visibleUnreadCount} unread messages` : ""}`}>
              Chat{visibleUnreadCount > 0 && <span className="collaboration-chat-badge">{visibleUnreadCount > 9 ? "9+" : visibleUnreadCount}</span>}
            </button>
            <button type="button" className="collaboration-status-link" onClick={onOpenDetails}>Details</button>
            <button type="button" className="collaboration-lifecycle-button" onClick={onLeaveOrEnd}>{role === "host" ? "End collaboration" : "Leave"}</button>
          </div>
        </div>
      )}
      {role && status !== "disconnected" && chatOpen && (
        <section className="collaboration-chat-panel" aria-label="Collaboration chat">
          <header className="collaboration-chat-header"><strong>Chat</strong><button type="button" onClick={() => setChatOpen(false)} aria-label="Close chat">×</button></header>
          <div className="collaboration-chat-messages" ref={messagesRef} onScroll={handleMessageScroll} role="log" aria-live="polite">
            {chatMessages.length === 0 && <p className="collaboration-chat-empty">No messages yet. Start the conversation.</p>}
            {chatMessages.map((message) => (
              <article data-chat-message-id={message.id} className={`collaboration-chat-message ${message.senderId === selfId ? "is-own" : ""}`} key={message.id}>
                <div className="collaboration-chat-message-meta"><strong>{message.senderId === selfId ? "You" : message.senderName}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
                {message.audience === "host" && <span className="collaboration-chat-private-label">{role === "host" && message.senderId === selfId ? "Participant · Private" : "Host only · Private"}</span>}
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          {visibleUnreadCount > 0 && <button type="button" className="collaboration-chat-new-messages" onClick={() => { atBottomRef.current = true; const node = messagesRef.current; if (node) node.scrollTop = node.scrollHeight; }}>↓ {visibleUnreadCount} new message{visibleUnreadCount === 1 ? "" : "s"}</button>}
          <form className="collaboration-chat-composer" onSubmit={(event) => { event.preventDefault(); sendChat(); }}>
            <div className="collaboration-chat-audience-row">
              <label><span>Send to</span><select value={role === "host" && audience === "host" ? "participant" : audience} onChange={(event) => setAudience(event.target.value)}><option value="everyone">Everyone</option>{role === "host" ? <option value="participant">Participant</option> : <option value="host">Host only</option>}</select></label>
              {role === "host" && audience === "participant" && <label><span>Participant</span><select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} disabled={connectedRecipients.length === 0}><option value="">Choose participant</option>{connectedRecipients.map((participant) => <option key={participant.participantId} value={participant.participantId}>{participant.displayName}</option>)}</select></label>}
            </div>
            <textarea value={draft} maxLength={4000} rows={2} placeholder="Write a message…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendChat(); } }} aria-label="Chat message" />
            {role === "host" && audience === "participant" && connectedRecipients.length === 0 && <p className="collaboration-chat-error" role="status">No connected participants are available for a private message.</p>}
            {chatError && <p className="collaboration-chat-error" role="alert">{chatError}</p>}
            <div className="collaboration-chat-send-row"><span>{draft.length}/4000 · Shift+Enter for newline</span><button type="submit" disabled={!draft.trim() || draft.length > 4000 || (role === "host" && audience === "participant" && (!recipientId || connectedRecipients.length === 0))}>Send</button></div>
          </form>
        </section>
      )}
    </>
  );
}
