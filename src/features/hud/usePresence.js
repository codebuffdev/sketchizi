import { useEffect, useState } from "react";

/**
 * Keeps an element mounted for `exitMs` after `open` turns false so a CSS exit
 * animation can finish. Returns { mounted, closing }.
 */
export default function usePresence(open, exitMs = 130) {
  const [mounted, setMounted] = useState(Boolean(open));
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted: open || mounted, closing: !open };
}
