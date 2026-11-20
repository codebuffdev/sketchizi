import { useEffect, useMemo, useRef, useState } from "react";
import { formatCanvasStartDate, isValidCanvasStartDate } from "../../features/canvas/canvasStartDate.js";
import "./CanvasStartDate.css";

const CHECKPOINT_MS = 5 * 60 * 1000;
const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const formatDay = (value) => new Date(value).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
const formatDuration = (milliseconds) => {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
};

export default function CanvasStartDate({ canvasId, value, activity = [], onActivityChange, onChange, disabled = false }) {
  const dateValue = isValidCanvasStartDate(value) ? value : "";
  const label = useMemo(() => formatCanvasStartDate(dateValue), [dateValue]);
  const [open, setOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const sessionRef = useRef(null);
  const activityRef = useRef(activity);
  const callbackRef = useRef(onActivityChange);
  activityRef.current = activity;
  callbackRef.current = onActivityChange;

  useEffect(() => {
    if (disabled || !canvasId) return undefined;
    const session = { id: `${canvasId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, startedAt: new Date().toISOString() };
    sessionRef.current = session;
    const saveCheckpoint = (endedAt) => {
      const end = endedAt || new Date().toISOString();
      const durationMs = Math.max(0, new Date(end).getTime() - new Date(session.startedAt).getTime());
      const entry = { ...session, endedAt: end, durationMs };
      const next = [...(activityRef.current || []).filter((item) => item.id !== session.id), entry].slice(-200);
      activityRef.current = next;
      callbackRef.current?.(canvasId, next);
    };
    const interval = window.setInterval(() => saveCheckpoint(), CHECKPOINT_MS);
    return () => {
      window.clearInterval(interval);
      saveCheckpoint();
      sessionRef.current = null;
    };
  }, [canvasId, disabled]);

  const grouped = useMemo(() => {
    const groups = new Map();
    [...activity].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).forEach((entry) => {
      const day = formatDay(entry.startedAt);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(entry);
    });
    return [...groups.entries()];
  }, [activity]);

  return (
    <div className="canvas-start-date-wrap">
      <button type="button" className="canvas-start-date" aria-expanded={open} onClick={() => setOpen((current) => !current)} title="View canvas activity history">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.25" y="3.5" width="11.5" height="10" rx="1.7" />
          <path d="M5 2v3M11 2v3M2.5 6.5h11" />
        </svg>
        <span>{label}</span>
        <svg className="canvas-start-date-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </button>
      {open && (
        <section className="canvas-activity-popover" aria-label="Canvas activity history">
          <header className="canvas-activity-header">
            <div><strong>Canvas activity</strong><span>Time spent in this canvas</span></div>
            {!disabled && <button type="button" className="canvas-activity-edit" onClick={() => setEditingDate((current) => !current)}>{editingDate ? "Done" : "Edit date"}</button>}
          </header>
          {editingDate && <label className="canvas-activity-date-editor">Canvas start date<input type="date" value={dateValue} onChange={(event) => onChange?.(event.target.value)} /></label>}
          <div className="canvas-activity-list">
            {grouped.length ? grouped.map(([day, entries]) => (
              <div className="canvas-activity-day" key={day}>
                <h3>{day}</h3>
                {entries.map((entry) => (
                  <div className="canvas-activity-entry" key={entry.id}>
                    <span className="canvas-activity-dot" />
                    <div><strong>{formatTime(entry.startedAt)} – {formatTime(entry.endedAt)}</strong><span>{formatDuration(entry.durationMs)} · Opened canvas</span></div>
                  </div>
                ))}
              </div>
            )) : <p className="canvas-activity-empty">Your visits will appear here. Activity is saved every 5 minutes and when you leave this canvas.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
