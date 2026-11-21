import { useEffect, useMemo, useRef, useState } from "react";
import { getLocalDateString, isValidCanvasStartDate } from "../../features/canvas/canvasStartDate.js";
import usePresence from "../../features/hud/usePresence.js";
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
const toLocalDate = (value) => {
  if (!isValidCanvasStartDate(value)) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};
const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const monthLabel = (date) => date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

export default function CanvasStartDate({ canvasId, value, originalValue, activity = [], onActivityChange, onChange, disabled = false }) {
  const dateValue = isValidCanvasStartDate(value) ? value : getLocalDateString();
  const selectedDate = toLocalDate(dateValue);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const rootRef = useRef(null);
  const popoverPresence = usePresence(open, 130);
  const sessionRef = useRef(null);
  const activityRef = useRef(activity);
  const callbackRef = useRef(onActivityChange);
  activityRef.current = activity;
  callbackRef.current = onActivityChange;

  useEffect(() => {
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [dateValue]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("keydown", closeEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("keydown", closeEscape, true);
    };
  }, [open]);

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

  const calendarDays = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12);
      return { key: toDateKey(date), day: date.getDate(), inMonth: date.getMonth() === visibleMonth.getMonth() };
    });
  }, [visibleMonth]);

  const label = selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const selectDate = (next) => {
    if (disabled) return;
    onChange?.(next);
    setVisibleMonth(toLocalDate(next));
    setOpen(false);
  };
  const shiftMonth = (amount) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));

  return (
    <div className="canvas-start-date-wrap" ref={rootRef}>
      <button type="button" className="canvas-start-date" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)} title="Document start date" aria-label={`Document start date: ${label}`}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.25" y="3.5" width="11.5" height="10" rx="1.7" />
          <path d="M5 2v3M11 2v3M2.5 6.5h11" />
        </svg>
        <span>{label}</span>
      </button>
      {popoverPresence.mounted && (
        <section className={`canvas-start-date-popover${popoverPresence.closing ? " is-closing" : ""}`} role="dialog" aria-label="Document Start Date">
          <div className="canvas-start-date-title-row">
            <strong>Document Start Date</strong>
            <button type="button" className="canvas-start-date-reset" disabled={disabled || !originalValue || originalValue === dateValue} onClick={() => selectDate(originalValue)} title="Restore this board's original creation date">Reset</button>
          </div>
          <header className="canvas-start-date-calendar-header">
            <strong>{monthLabel(visibleMonth)}</strong>
            <div>
              <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><svg viewBox="0 0 16 16"><path d="m10 3-5 5 5 5" /></svg></button>
              <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5" /></svg></button>
            </div>
          </header>
          <div className="canvas-start-date-weekdays" aria-hidden="true">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="canvas-start-date-calendar-grid">
            {calendarDays.map((day) => (
              <button
                type="button"
                key={day.key}
                className={`canvas-start-date-day${day.inMonth ? "" : " is-outside"}${day.key === dateValue ? " is-selected" : ""}`}
                aria-label={new Date(`${day.key}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "full" })}
                aria-pressed={day.key === dateValue}
                disabled={disabled}
                onClick={() => selectDate(day.key)}
              >{day.day}</button>
            ))}
          </div>
          <div className="canvas-start-date-footer">
            <span>{label}</span>
          </div>
          {grouped.length > 0 && (
            <details className="canvas-start-date-activity">
              <summary>Canvas activity history</summary>
              <div className="canvas-activity-list">
                {grouped.map(([day, entries]) => (
                  <div className="canvas-activity-day" key={day}>
                    <h3>{day}</h3>
                    {entries.map((entry) => (
                      <div className="canvas-activity-entry" key={entry.id}>
                        <span className="canvas-activity-dot" />
                        <div><strong>{formatTime(entry.startedAt)} – {formatTime(entry.endedAt)}</strong><span>{formatDuration(entry.durationMs)} · Opened canvas</span></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
