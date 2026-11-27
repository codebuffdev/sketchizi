// Ink-Adaptive Hairline Ghost frame for the text box open in Excalidraw's editor.
//
// Excalidraw positions the editing <textarea> absolutely inside
// `.excalidraw-textEditorContainer`. We add ONE sibling wrapper element
// (`.sketchizi-text-editor-frame`) that is sized and placed around the textarea. It is the only
// element that draws a focus frame: the textarea itself has no border, outline or shadow, and the
// canvas selection rectangle / handles are suppressed by CSS while the editor exists.
//
// --active-ink is the element's strokeColor, so a swatch click recolors the frame in real time.
// The wrapper is inflated around the textarea (never the other way round), so the text and the
// top-left (x, y) anchor never move while the box grows.

export const FRAME_CLASS = "sketchizi-text-editor-frame";
export const FRAME_PAD_X = 6;
export const FRAME_PAD_Y = 4;
const EDITOR_SELECTOR = ".excalidraw-textEditorContainer textarea";

export function safeInk(value, fallback = "#2f2f33") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) || /^rgba?\(\s*[\d.\s,%]+\)$/i.test(color) ? color : fallback;
}

export function computeFrameBox({ left, top, width, height }, padX = FRAME_PAD_X, padY = FRAME_PAD_Y) {
  return { left: left - padX, top: top - padY, width: width + padX * 2, height: height + padY * 2 };
}

function ensureFrame(textarea) {
  const container = textarea.parentElement;
  let frame = container.querySelector(`:scope > .${FRAME_CLASS}`);
  if (!frame) {
    frame = document.createElement("div");
    frame.className = FRAME_CLASS;
    frame.setAttribute("aria-hidden", "true");
    container.insertBefore(frame, textarea);
  }
  return frame;
}

function setStyle(node, key, value) {
  if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
}

function sync(root, apiRef) {
  const textarea = root.querySelector(EDITOR_SELECTOR);
  if (!textarea) {
    root.querySelectorAll(`.${FRAME_CLASS}`).forEach((node) => node.remove());
    return;
  }
  const api = apiRef?.current;
  const editingId = api?.getAppState?.()?.editingTextElement?.id;
  const element = editingId
    ? (api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || []).find((candidate) => candidate.id === editingId)
    : null;
  const ink = safeInk(element?.strokeColor ?? textarea.style.color);
  const frame = ensureFrame(textarea);
  // offset* ignore rotation; the textarea's own transform is mirrored below so a rotated box stays framed.
  const box = computeFrameBox({
    left: textarea.offsetLeft,
    top: textarea.offsetTop,
    width: textarea.offsetWidth,
    height: textarea.offsetHeight,
  });
  setStyle(frame, "--active-ink", ink);
  setStyle(frame, "left", `${box.left}px`);
  setStyle(frame, "top", `${box.top}px`);
  setStyle(frame, "width", `${box.width}px`);
  setStyle(frame, "height", `${box.height}px`);
  setStyle(frame, "transform", textarea.style.transform || "none");
  setStyle(frame, "transform-origin", textarea.style.transformOrigin || "50% 50%");
  setStyle(textarea, "caret-color", ink);
}

// Returns a cleanup function.
export function attachTextEditorFrame({ root, apiRef }) {
  if (!root || typeof requestAnimationFrame !== "function") return () => {};
  let frameId = 0;
  const schedule = () => {
    if (frameId) return;
    frameId = requestAnimationFrame(() => { frameId = 0; sync(root, apiRef); });
  };
  const observers = [];
  let watched = null;
  let poll = 0;
  const watch = () => {
    const textarea = root.querySelector(EDITOR_SELECTOR);
    if (textarea === watched) return;
    watched = textarea;
    observers.forEach((observer) => observer.disconnect());
    observers.length = 0;
    if (poll) { clearInterval(poll); poll = 0; }
    if (!textarea) return;
    // Scene-only changes (a swatch click updating strokeColor) never touch the DOM: sample while editing.
    poll = setInterval(schedule, 120);
    // Auto-grow: Excalidraw resizes the textarea through inline style on input / font changes.
    if (typeof MutationObserver === "function") {
      const styleObserver = new MutationObserver(schedule);
      styleObserver.observe(textarea, { attributes: true, attributeFilter: ["style"] });
      observers.push(styleObserver);
    }
    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(textarea);
      observers.push(resizeObserver);
    }
  };
  const tree = typeof MutationObserver === "function" ? new MutationObserver(() => { watch(); schedule(); }) : null;
  tree?.observe(root, { childList: true, subtree: true });
  const onInput = (event) => { if (event.target?.matches?.(EDITOR_SELECTOR)) schedule(); };
  root.addEventListener("input", onInput, true);
  const unsubscribe = apiRef?.current?.onChange?.(schedule);
  watch();
  schedule();
  return () => {
    if (frameId) cancelAnimationFrame(frameId);
    if (poll) clearInterval(poll);
    tree?.disconnect();
    observers.forEach((observer) => observer.disconnect());
    root.removeEventListener("input", onInput, true);
    if (typeof unsubscribe === "function") unsubscribe();
    root.querySelectorAll(`.${FRAME_CLASS}`).forEach((node) => node.remove());
  };
}
