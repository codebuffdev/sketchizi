import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function initials(name) {
  const parts = String(name || "Guest").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function ParticipantAvatar({ participant, compact = false }) {
  return (
    <span
      className={`collaboration-avatar ${compact ? "compact" : ""}`}
      style={{ "--presence-color": participant.color }}
      title={`${participant.displayName}${participant.status !== "connected" ? ` · ${participant.status}` : ""}`}
      aria-label={participant.displayName}
    >
      {initials(participant.displayName)}
    </span>
  );
}

const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 8;

export default function CollaborationPresence({ participants = [], selfId, activityLabel = "", role = null, onRevokeEditAccess }) {
  const [expanded, setExpanded] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState(null);
  const stackRef = useRef(null);
  const popoverRef = useRef(null);
  const connected = participants.filter((participant) => participant.status === "connected");
  const ordered = [...participants].sort((a, b) => (a.participantId === selfId ? -1 : b.participantId === selfId ? 1 : 0));
  const visible = ordered.slice(0, 4);

  const positionPopover = useCallback(() => {
    const anchor = stackRef.current;
    const popup = popoverRef.current;
    if (!anchor || !popup || !document.documentElement.contains(anchor)) {
      setExpanded(false);
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

    let left = anchorRect.left;
    if (left + popupRect.width > viewportWidth - VIEWPORT_MARGIN) {
      left = anchorRect.right - popupRect.width;
    }
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - popupRect.width - VIEWPORT_MARGIN));

    let top = anchorRect.bottom + POPOVER_GAP;
    if (top + popupRect.height > viewportHeight - VIEWPORT_MARGIN) {
      top = anchorRect.top - popupRect.height - POPOVER_GAP;
    }
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportHeight - popupRect.height - VIEWPORT_MARGIN));

    setPopoverStyle({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!expanded) {
      setPopoverStyle(null);
      return undefined;
    }
    positionPopover();
    return undefined;
  }, [expanded, positionPopover, ordered.length]);

  useEffect(() => {
    if (!expanded) return undefined;
    const reposition = () => positionPopover();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const frame = requestAnimationFrame(reposition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [expanded, positionPopover]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onPointerDown = (event) => {
      if (stackRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      setExpanded(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  const popover = expanded && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={popoverRef}
          className="collaboration-participant-popover"
          role="list"
          aria-label="Participants"
          style={popoverStyle ? { left: popoverStyle.left, top: popoverStyle.top, visibility: "visible" } : { visibility: "hidden", left: 0, top: 0 }}
        >
          {ordered.map((participant) => (
            <div className="collaboration-participant-row" role="listitem" key={participant.participantId}>
              <ParticipantAvatar participant={participant} />
              <div className="collaboration-participant-copy">
                <strong>{participant.displayName}{participant.participantId === selfId ? " (you)" : ""}</strong>
                <span>{participant.permission === "host" ? "Host" : participant.permission === "editor" ? "Editor" : "Viewer"}{participant.status === "connected" ? (participant.activity === "drawing" ? " · Drawing…" : participant.activity === "editing/moving" ? " · Editing / moving…" : participant.selectedElementIds?.length ? ` · Selected ${participant.selectedElementIds.length} object${participant.selectedElementIds.length === 1 ? "" : "s"}` : "") : participant.status === "disconnected" ? " · Disconnected" : " · Reconnecting…"}</span>
              </div>
              {role === "host" && participant.participantId !== selfId && participant.permission === "editor" && participant.status === "connected" && (
                <button type="button" className="collaboration-permission-action" onClick={() => onRevokeEditAccess?.(participant.participantId)}>Revoke</button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="collaboration-presence" aria-label="Collaboration participants">
      <button
        ref={stackRef}
        type="button"
        className="collaboration-avatar-stack"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`${connected.length} connected ${connected.length === 1 ? "person" : "people"}`}
      >
        {visible.map((participant) => <ParticipantAvatar key={participant.participantId} participant={participant} compact />)}
        <span className="collaboration-avatar-count">{connected.length}</span>
      </button>
      {activityLabel && <span className="collaboration-activity" aria-live="polite">{activityLabel}</span>}
      {popover}
    </div>
  );
}

export function RemoteCursors({ participants = [], selfId }) {
  return (
    <div className="collaboration-cursor-layer" aria-hidden="true">
      {participants.filter((participant) => participant.participantId !== selfId && participant.status === "connected" && participant.cursor).map((participant) => (
        <div
          className="collaboration-remote-cursor"
          key={participant.participantId}
          style={{ left: `${participant.cursor.x}px`, top: `${participant.cursor.y}px`, "--presence-color": participant.color }}
        >
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
            <path d="M2 1 16 12.5 10.1 13.8 13.3 20 10.8 21 7.6 14.7 3.4 18.3 2 1Z" fill="var(--presence-color)" stroke="white" strokeWidth="1.2" />
          </svg>
          <span>{participant.displayName}</span>
        </div>
      ))}
    </div>
  );
}


export function RemoteSelections({ participants = [], selfId, apiRef }) {
  const selected = useMemo(() => participants.filter((participant) => participant.participantId !== selfId && participant.status === "connected" && participant.selectedElementIds?.length), [participants, selfId]);
  const [boxes, setBoxes] = useState([]);

  useEffect(() => {
    if (!selected.length) {
      setBoxes([]);
      return undefined;
    }
    const update = () => {
      const api = apiRef.current;
      const root = document.querySelector(".canvas .excalidraw");
      if (!api || !root) return;
      const appState = api.getAppState();
      const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements();
      const byId = new Map(elements.map((element) => [element.id, element]));
      const zoom = appState.zoom?.value ?? 1;
      const rootRect = root.getBoundingClientRect();
      const next = [];
      for (const participant of selected) {
        for (const id of participant.selectedElementIds.slice(0, 20)) {
          const element = byId.get(id);
          if (!element || element.isDeleted) continue;
          const x = (element.x + (appState.scrollX ?? 0)) * zoom;
          const y = (element.y + (appState.scrollY ?? 0)) * zoom;
          const width = Math.abs(element.width * zoom);
          const height = Math.abs(element.height * zoom);
          next.push({
            id: `${participant.participantId}:${id}`,
            left: x,
            top: y,
            width: Math.max(width, 2),
            height: Math.max(height, 2),
            color: participant.color,
            name: participant.displayName,
          });
        }
      }
      if (rootRect.width) setBoxes(next);
    };
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [apiRef, selected]);

  return (
    <div className="collaboration-selection-layer" aria-hidden="true">
      {boxes.map((box) => (
        <div
          key={box.id}
          className="collaboration-remote-selection"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height, "--presence-color": box.color }}
        >
          <span>{box.name}</span>
        </div>
      ))}
    </div>
  );
}
