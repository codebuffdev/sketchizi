import { useEffect, useRef, useState } from "react";

export const DRAWER_ENTER_MS = 240;
export const DRAWER_EXIT_MS = 150;

/**
 * Keeps a drawer mounted for the exit animation. Returns:
 *   present: render the drawer (open, or still animating out)
 *   phase:   "enter" | "exit" | "idle" -> data-edge-motion
 */
export function useDrawerPresence(open, exitMs = DRAWER_EXIT_MS) {
  const [present, setPresent] = useState(Boolean(open));
  const [phase, setPhase] = useState(open ? "enter" : "idle");
  const timerRef = useRef(null);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (open) {
      setPresent(true);
      setPhase("enter");
      timerRef.current = window.setTimeout(() => setPhase("idle"), DRAWER_ENTER_MS);
    } else {
      setPhase((current) => (current === "idle" && !present ? "idle" : "exit"));
      timerRef.current = window.setTimeout(() => {
        setPresent(false);
        setPhase("idle");
      }, exitMs);
    }
    return () => window.clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exitMs]);

  return { present: present || Boolean(open), phase: open ? (phase === "exit" ? "enter" : phase) : phase };
}
