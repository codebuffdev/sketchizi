// Host-side lifecycle for Excalidraw's built-in paste hint toast:
//   "Use Ctrl+Shift+V to paste as a single element, or paste into an existing text editor"
//
// Excalidraw owns that toast and its auto-dismiss timer lives inside its Toast
// component, where every host re-render can restart it, so under steady scene
// updates it may never fire and the pill stays on screen. This guard owns ONE
// timer of its own (a single closure reference that is always cleared before it
// is re-armed and on teardown) and dismisses the hint on every relevant action.

export const PASTE_HINT_PATTERN = /paste as a single element/i;
export const PASTE_HINT_MS = 3500;
const FADE_MS = 180;
const TOAST_SELECTOR = ".excalidraw .Toast";
const HINT_CLASS = "sketchizi-paste-hint";
const CLOSE_CLASS = "sketchizi-paste-hint-close";

export const isEditableTarget = (node) => Boolean(node)
  && (node.isContentEditable === true
    || /^(TEXTAREA|INPUT|SELECT)$/.test(String(node.tagName || ""))
    || Boolean(node.closest?.("textarea, input, [contenteditable='true'], .excalidraw-textEditorContainer")));

export const isPasteAsSingleElementShortcut = (event) =>
  (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && String(event.key).toLowerCase() === "v";

/** One timer, one reference: start() always clears the previous timer first. */
export function createHintTimer({ delay = PASTE_HINT_MS, onExpire, setT = (fn, ms) => setTimeout(fn, ms), clearT = (id) => clearTimeout(id) }) {
  let id = null;
  const cancel = () => { if (id !== null) { clearT(id); id = null; } };
  return {
    start() { cancel(); id = setT(() => { id = null; onExpire(); }, delay); },
    cancel,
    active: () => id !== null,
  };
}

export function attachPasteHintGuard({ apiRef, doc = document, win = window }) {
  let pendingPaste = false;
  let pendingTimer = null;
  let fadeTimer = null;
  const timer = createHintTimer({ onExpire: () => dismiss() });

  const findHint = () => [...doc.querySelectorAll(TOAST_SELECTOR)].find((el) => PASTE_HINT_PATTERN.test(el.textContent || "")) || null;
  const isLive = (el) => Boolean(el) && !el.classList.contains("is-dismissing") && !el.hasAttribute("data-sketchizi-dismissed");

  function decorate(el) {
    el.classList.add(HINT_CLASS);
    if (!el.querySelector(`.${CLOSE_CLASS}`)) {
      const close = doc.createElement("button");
      close.type = "button";
      close.className = CLOSE_CLASS;
      close.setAttribute("aria-label", "Dismiss paste hint");
      close.textContent = "×";
      el.appendChild(close);
    }
  }

  function finish() {
    fadeTimer = null;
    try { apiRef?.current?.setToast?.(null); } catch { /* best effort: Excalidraw state */ }
    // If Excalidraw kept the node (same instance reused), hide it for good until the next paste.
    const el = findHint();
    if (el) el.setAttribute("data-sketchizi-dismissed", "true");
  }

  function dismiss({ immediate = false } = {}) {
    timer.cancel();
    pendingPaste = false;
    const el = findHint();
    if (!el) { try { apiRef?.current?.setToast?.(null); } catch { /* ignore */ } return; }
    el.classList.add("is-dismissing");
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    if (immediate) finish(); else fadeTimer = setTimeout(finish, FADE_MS);
  }

  function sync() {
    const el = findHint();
    if (!el) { timer.cancel(); return; }
    decorate(el);
    if (!isLive(el)) return;
    if (pendingPaste) { pendingPaste = false; timer.start(); } // fresh paste: reset, never stack
    else if (!timer.active()) timer.start();
  }

  const observer = typeof MutationObserver === "function" ? new MutationObserver(() => sync()) : null;
  observer?.observe(doc.body, { childList: true, subtree: true, characterData: true });

  const onPaste = (event) => {
    // A new paste may reuse the same toast node: clear stale dismissal flags first.
    doc.querySelectorAll(TOAST_SELECTOR).forEach((el) => { el.classList.remove("is-dismissing"); el.removeAttribute("data-sketchizi-dismissed"); });
    if (isEditableTarget(event.target) || isEditableTarget(doc.activeElement)) { dismiss({ immediate: true }); return; }
    pendingPaste = true;
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pendingTimer = null; pendingPaste = false; }, 1500);
    [60, 250, 700].forEach((ms) => setTimeout(sync, ms)); // clipboard read is async
  };
  const onKeyDown = (event) => {
    if (isPasteAsSingleElementShortcut(event)) dismiss({ immediate: true });
    else if (event.key === "Escape" && isLive(findHint())) dismiss();
  };
  const onPointerDown = () => { if (isLive(findHint())) dismiss(); };
  const onVisibility = () => { if (doc.visibilityState === "hidden") dismiss({ immediate: true }); };

  doc.addEventListener("paste", onPaste, true);
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("sketchizi:dismiss-paste-hint", onVisibility);
  sync();

  return () => {
    doc.removeEventListener("paste", onPaste, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("sketchizi:dismiss-paste-hint", onVisibility);
    observer?.disconnect();
    timer.cancel();
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    // Tab switch / unmount: never leave the pill behind.
    try { apiRef?.current?.setToast?.(null); } catch { /* ignore */ }
    doc.querySelectorAll(`.${HINT_CLASS}`).forEach((el) => el.setAttribute("data-sketchizi-dismissed", "true"));
  };
}
