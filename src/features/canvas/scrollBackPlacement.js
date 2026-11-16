const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** Keep the native return-to-content action next to a movable drawing dock. */
export function getScrollBackPlacement({
  dock,
  viewportWidth,
  viewportHeight,
  vertical = false,
  dockSide = "left",
  buttonWidth = 148,
  buttonHeight = 42,
  gap = 12,
  inset = 8,
}) {
  const maxLeft = Math.max(inset, viewportWidth - buttonWidth - inset);
  const maxTop = Math.max(inset, viewportHeight - buttonHeight - inset);
  const above = dock.top - buttonHeight - gap;
  const below = dock.bottom + gap;
  let left;
  let top;

  if (vertical) {
    const before = dock.left - buttonWidth - gap;
    const after = dock.right + gap;
    const preferred = dockSide === "right" ? before : after;
    const alternative = dockSide === "right" ? after : before;
    if (preferred >= inset && preferred <= maxLeft) {
      left = preferred;
    } else if (alternative >= inset && alternative <= maxLeft) {
      left = alternative;
    } else {
      left = dock.left + (dock.width - buttonWidth) / 2;
      top = above >= inset ? above : below;
    }
    top ??= dock.top + (dock.height - buttonHeight) / 2;
  } else {
    // First choice: centered in the clear space immediately ABOVE the dock.
    left = dock.left + (dock.width - buttonWidth) / 2;
    if (above >= inset) {
      top = above;
    } else if (below + buttonHeight <= viewportHeight - inset) {
      top = below;
    } else {
      // A dock dragged into a very short viewport may need a side fallback.
      const right = dock.right + gap;
      const leftOfDock = dock.left - buttonWidth - gap;
      if (right <= maxLeft) {
        left = right;
      } else if (leftOfDock >= inset) {
        left = leftOfDock;
      }
      top = dock.top + (dock.height - buttonHeight) / 2;
    }
  }

  return {
    left: Math.round(clamp(left, inset, maxLeft)),
    top: Math.round(clamp(top, inset, maxTop)),
  };
}
