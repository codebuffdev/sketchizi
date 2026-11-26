import React from "react";

/**
 * One distinct 24x24 glyph per dock child (no shared or fallback icons).
 * Stroke is applied by <DockIcon/>: 1.75px, currentColor, round caps/joins.
 */
export const DOCK_ICONS = {
  select: <><path d="m5 3 14 11-6 .8-2.6 5.2L5 3Z" /><path d="m12 15 3.5 4" /></>,
  lasso: <><path d="M12 4c5 0 8 2.2 8 5s-3 5-8 5-8-2.2-8-5 3-5 8-5Z" strokeDasharray="2.6 2.2" /><path d="M7 13.2c-.7 2.7-.2 4.8 1.6 5.5 1.5.6 3.2-.6 3.2-2.1 0-1.2-1.5-1.8-2.3-.8-.7.8-.2 2.3 1.4 3.2" /></>,
  hand: <path d="M8 12V5a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6c0 4-2.5 6-6 6h-2c-2 0-3.5-1-4.5-2.5L4 14a1.7 1.7 0 0 1 2.5-2.2L8 13" />,
  rectangle: <rect x="4" y="5.5" width="16" height="13" rx="0" />,
  "rounded-rectangle": <rect x="4" y="5.5" width="16" height="13" rx="6.5" />,
  ellipse: <circle cx="12" cy="12" r="8" />,
  diamond: <path d="m12 3 9 9-9 9-9-9 9-9Z" />,
  triangle: <path d="M12 4 21 19H3L12 4Z" />,
  hexagon: <path d="M7.5 4.5h9L21 12l-4.5 7.5h-9L3 12l4.5-7.5Z" />,
  cylinder: <><ellipse cx="12" cy="6.5" rx="7" ry="2.5" /><path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11" /></>,
  funnel: <path d="M3.5 5h17L14 12.5V19l-4 1.5v-8L3.5 5Z" />,
  bucketfill: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z" fill="currentColor" stroke="none" /></>,
  "draw-to-shape": <><path d="M4 18c2-8 5-11 8-8s4 6 8 2" /><path d="M15 5h5v5" /><rect x="4" y="17" width="4" height="4" rx="1" /></>,
  arrow: <><path d="M4 20 19 5" /><path d="M9 5h10v10" /></>,
  "double-arrow": <><path d="m5 19 14-14" /><path d="M5 14v5h5" /><path d="M14 5h5v5" /></>,
  "curved-arrow": <><path d="M4.5 19.5C5 11 9.5 6.5 18 6" /><path d="m14.5 3.5 3.5 2.5-2.5 3.5" /></>,
  "elbow-arrow": <><path d="M4 19V8h15" /><path d="m15.5 4.5 3.5 3.5-3.5 3.5" /></>,
  "dashed-arrow": <><path d="M3 12h3M9 12h3M15 12h3" /><path d="m16.5 7.5 4.5 4.5-4.5 4.5" /></>,
  line: <path d="M4 20 20 4" />,
  pen: <path d="M3.5 16c2.2-7.5 4.2-9.5 6-6.5s3 8 5 5 3.3-7 6-7" />,
  highlighter: <><path d="m14.5 4.5 5 5L10 19l-5.5 1 1-5.5 9-10Z" /><path d="m9.5 8.5 6 6" /><path d="M3.5 22h9" /></>,
  text: <><path d="M5 7V5h14v2" /><path d="M12 5v14" /><path d="M9 19h6" /></>,
  "sticky-note": <><path d="M5 4h14v10.5L13.5 20H5V4Z" /><path d="M13.5 20v-5.5H19" /></>,
  image: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m5 17 5-5 3 3 2-2 4 4" /></>,
  frame: <><path d="M8 3v18M16 3v18M3 8h18M3 16h18" /></>,
  eraser: <><path d="m7 16 8-10a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-8 9H9l-5-5a2 2 0 0 1 0-3l3-4" /><path d="m11 20 8 0" /></>,
  laser: <><path d="m4 20 8-8" /><circle cx="15.5" cy="8.5" r="2.5" /><path d="M15.5 2.5v1.5M21.5 8.5H20M19.7 4.3l-1 1M11.3 4.3l1 1" /></>,
  "ai-assist": <><path d="m11 3 1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8L11 3Z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></>,
  embed: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2" /></>,
  todo: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="m7.5 9 1.5 1.5L12 7.5M14 9h3M7.5 15l1.5 1.5 3-3M14 15h3" /></>,
  library: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><path d="M16.75 13.5v6.5M13.5 16.75H20" /></>,
};

export function DockIcon({ name, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {DOCK_ICONS[name]}
    </svg>
  );
}
