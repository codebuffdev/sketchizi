import { useCallback, useEffect, useRef, useState } from "react";
import {
  RECENT_CUSTOM_COLORS_EVENT,
  RECENT_CUSTOM_COLORS_KEY,
  addRecentCustomColor,
  readRecentCustomColors,
  writeRecentCustomColors,
} from "./recentCustomColors.js";

/**
 * Shared, persisted list of recent custom colors. Every hook instance stays in
 * sync (same tab via a custom event, other tabs via the `storage` event).
 * `commitRecent(color, presets)` records a color from the picker; call
 * `endPickSession()` when the picker closes/blur so the next pick is a new entry.
 */
export function useRecentCustomColors() {
  const [recent, setRecent] = useState(() => readRecentCustomColors());
  const sessionRef = useRef(false);

  useEffect(() => {
    const sync = () => setRecent(readRecentCustomColors());
    const onStorage = (event) => { if (!event.key || event.key === RECENT_CUSTOM_COLORS_KEY) sync(); };
    window.addEventListener(RECENT_CUSTOM_COLORS_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(RECENT_CUSTOM_COLORS_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const commitRecent = useCallback((color, presets = []) => {
    const current = readRecentCustomColors();
    const next = addRecentCustomColor(current, color, { presets, replaceHead: sessionRef.current });
    if (next === current) return;
    sessionRef.current = true;
    writeRecentCustomColors(next);
    setRecent(next);
    try { window.dispatchEvent(new Event(RECENT_CUSTOM_COLORS_EVENT)); } catch {}
  }, []);

  const endPickSession = useCallback(() => { sessionRef.current = false; }, []);

  return { recentCustomColors: recent, commitRecent, endPickSession };
}
