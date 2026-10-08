import CollaborationPresence from "./CollaborationPresence";
import CollaborationShare from "./CollaborationShare";

function permissionLabel(permission) {
  return permission === "host" ? "Host" : permission === "editor" ? "Editor" : "Viewer";
}

export default function CollaborationUI({
  open, setOpen, mode, status, draftName, setDraftName, displayName, setDisplayName, sessionName, link, users, participants, selfId, error,
  createCollaboration, connectCollaboration, roomId, role, permission, requestState, requests = [], onRequestEditAccess, onOpenDetails, onDecideEditRequest, onRevokeEditAccess, onLeaveOrEnd, showToast, collaborationCreationState,
}) {
  const count = Math.max(users, 1);
  const activeActivity = participants?.find((participant) => participant.participantId !== selfId && participant.status === "connected" && participant.activity !== "idle");
  const activityLabel = activeActivity ? `${activeActivity.displayName} is ${activeActivity.activity === "drawing" ? "drawing…" : "editing…"}` : "";
  const isViewer = permission === "viewer";
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
            <button type="button" className="collaboration-status-link" onClick={onOpenDetails}>Details</button>
            <button type="button" className="collaboration-lifecycle-button" onClick={onLeaveOrEnd}>{role === "host" ? "End collaboration" : "Leave"}</button>
          </div>
        </div>
      )}
    </>
  );
}
