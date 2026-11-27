// Editor-side support for inline text colors.
//
// Excalidraw's own editor is a <textarea>, which can show only one color and whose
// native ::selection highlight hides anything layered beneath it. While a text
// element is being edited we therefore swap the visible editor for a single
// contentEditable <div> that renders element.customData.runs as colored <span>s.
// Selecting text in it highlights the background *behind* real glyphs, so the text
// can never disappear.
//
// Excalidraw's textarea stays in the DOM as the hidden model: its value, selection
// and input/keydown handlers keep driving Excalidraw's resize, submit and undo logic.
//
//   contentEditable --input--> textarea.value + input event --> Excalidraw onChange
//   contentEditable --selectionchange--> textarea selection (+ "select" event for the toolbar tracker)
//   toolbar color swatch --> runs in scene --TEXT_RUNS_CHANGED_EVENT--> re-render spans, restore selection
//
// On submit Excalidraw removes the textarea; the editor is unmounted and the
// <canvas> draws the committed runs.

import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { baseColorOf, compactRuns, getElementRuns, runsForText, setElementRuns } from "./textRuns.js";
import { getOffsets, readModel, renderRuns, setOffsets } from "./runsDom.js";

export const TEXT_RUNS_CHANGED_EVENT = "sketchizi:text-runs-changed";
export const RUNS_EDITOR_CLASS = "sketchizi-runs-editor";
const EDITOR_SELECTOR = ".excalidraw-textEditorContainer textarea";
const DARK_FILTER = "invert(93%) hue-rotate(180deg)";
const COPIED_STYLES = [
  "position", "left", "top", "width", "transform", "transformOrigin", "opacity", "zIndex",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textAlign",
  "whiteSpace", "wordBreak", "overflowWrap", "boxSizing", "direction",
];
// Keys Excalidraw's textarea handler reacts to (submit, zoom, font size, save).
const isPlainEnter = (event) => event.key === "Enter" && !event.ctrlKey && !event.metaKey;

const isTextarea = (node) => node instanceof HTMLTextAreaElement && node.matches(EDITOR_SELECTOR);

export function attachTextRunsEditor({ apiRef }) {
  let session = null; // { textarea, ce, observer, containerObserver, nativeSetSelectionRange, syncing, moving }

  const api = () => apiRef?.current;
  const editingElement = () => {
    const id = api()?.getAppState?.()?.editingTextElement?.id;
    if (!id) return null;
    return (api().getSceneElementsIncludingDeleted?.() || api().getSceneElements?.() || []).find((element) => element.id === id) || null;
  };
  const isDark = () => api()?.getAppState?.()?.theme === "dark";

  function syncStyles() {
    if (!session) return;
    const { textarea, ce } = session;
    if (!textarea.isConnected) return unmount();
    const computed = getComputedStyle(textarea);
    for (const name of COPIED_STYLES) ce.style[name] = computed[name];
    Object.assign(ce.style, {
      height: "auto", minHeight: computed.height, margin: "0", border: "0", padding: "0", overflow: "visible",
      color: computed.color, background: "transparent", caretColor: computed.color,
    });
    session.observer?.takeRecords();
  }

  function renderFromElement({ keepSelection = true } = {}) {
    if (!session) return;
    const { textarea, ce } = session;
    const element = editingElement();
    const text = textarea.value;
    const runs = element ? runsForText(element, text) : (text ? [{ text }] : []);
    const saved = keepSelection ? { start: textarea.selectionStart, end: textarea.selectionEnd } : null;
    renderRuns(ce, runs, { darkFilter: isDark() ? DARK_FILTER : "" });
    if (saved && document.activeElement === ce) setOffsets(ce, saved.start, saved.end);
  }

  function pushSelectionToTextarea() {
    if (!session || document.activeElement !== session.ce) return;
    const offsets = getOffsets(session.ce);
    if (!offsets) return;
    const { textarea } = session;
    if (textarea.selectionStart === offsets.start && textarea.selectionEnd === offsets.end) return;
    session.syncing = true;
    session.nativeSetSelectionRange(offsets.start, offsets.end);
    session.syncing = false;
    // The toolbar's selection tracker listens for "select" on the editor textarea.
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
  }

  function onCeInput() {
    if (!session) return;
    const { textarea, ce } = session;
    const { text, runs } = readModel(ce);
    const offsets = getOffsets(ce);
    textarea.value = text;
    if (offsets) {
      session.syncing = true;
      session.nativeSetSelectionRange(offsets.start, offsets.end);
      session.syncing = false;
    }
    textarea.dispatchEvent(new Event("input")); // Excalidraw's onChange: text, resize, containers
    const element = editingElement();
    const apiNow = api();
    if (!element || !apiNow) return;
    const hasColor = compactRuns(runs, baseColorOf(element)).some((run) => run.color);
    if (!hasColor && !getElementRuns(element).length) return;
    const elements = apiNow.getSceneElementsIncludingDeleted?.() || apiNow.getSceneElements?.() || [];
    apiNow.updateScene?.({
      elements: elements.map((item) => (item.id === element.id
        ? { ...setElementRuns(item, runs), version: (Number(item.version) || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }
        : item)),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    pushSelectionToTextarea();
  }

  function onCeKeyDown(event) {
    if (!session) return;
    const { textarea, ce } = session;
    if (event.isComposing) return;
    if (isPlainEnter(event)) {
      event.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      document.execCommand("insertText", false, event.shiftKey ? "" : "    ");
      return;
    }
    // Escape, Ctrl/Cmd+Enter, zoom and font-size shortcuts live in Excalidraw's handler.
    textarea.onkeydown?.(event);
    event.stopPropagation(); // typing must never reach canvas hotkeys
    void ce;
  }

  function onCePaste(event) {
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\r\n?/g, "\n");
    if (text) document.execCommand("insertText", false, text);
  }

  function onSelectionChange() { pushSelectionToTextarea(); }

  function mount(textarea) {
    unmount();
    const ce = document.createElement("div");
    ce.className = RUNS_EDITOR_CLASS;
    ce.contentEditable = "true";
    ce.spellcheck = false;
    ce.dir = "auto";
    ce.dataset.type = "wysiwyg"; // Excalidraw's isWritableElement(): keep canvas hotkeys out of this editor
    ce.setAttribute("role", "textbox");
    ce.setAttribute("aria-multiline", "true");
    textarea.parentNode.insertBefore(ce, textarea);

    const nativeSetSelectionRange = textarea.setSelectionRange.bind(textarea);
    const nativeSelect = textarea.select.bind(textarea);
    session = { textarea, ce, nativeSetSelectionRange, syncing: false, moving: false, observer: null, containerObserver: null };

    // Hidden model: keeps size/position/value for Excalidraw but never paints or takes input.
    textarea.dataset.skRunsEditor = "1";
    textarea.style.visibility = "hidden";
    textarea.style.pointerEvents = "none";

    // Excalidraw re-focuses its textarea after every scene update and selects/sets ranges on it.
    textarea.focus = (options) => { session.moving = true; ce.focus(options); session.moving = false; };
    textarea.setSelectionRange = (start, end, direction) => {
      nativeSetSelectionRange(start, end, direction);
      if (!session?.syncing && session?.ce === ce) setOffsets(ce, start, end);
    };
    textarea.select = () => { nativeSelect(); if (session?.ce === ce) setOffsets(ce, 0, textarea.value.length); };

    ce.addEventListener("input", onCeInput);
    ce.addEventListener("keydown", onCeKeyDown);
    ce.addEventListener("paste", onCePaste);
    ce.addEventListener("pointerdown", (event) => event.stopPropagation());
    ce.addEventListener("dblclick", (event) => event.stopPropagation());
    ce.addEventListener("blur", (event) => {
      if (!session || session.ce !== ce || session.moving) return;
      textarea.onblur?.(event); // same commit path as a textarea blur
    });

    syncStyles();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    renderRuns(ce, runsForText(editingElement() || { originalText: textarea.value }, textarea.value), { darkFilter: isDark() ? DARK_FILTER : "" });
    session.moving = true;
    ce.focus({ preventScroll: true });
    session.moving = false;
    setOffsets(ce, start, end);

    if (typeof MutationObserver === "function") {
      session.observer = new MutationObserver(() => syncStyles());
      session.observer.observe(textarea, { attributes: true, attributeFilter: ["style"] });
      session.containerObserver = new MutationObserver(() => { if (!textarea.isConnected) unmount(); });
      session.containerObserver.observe(textarea.parentNode, { childList: true });
    }
  }

  function unmount() {
    if (!session) return;
    const { ce, observer, containerObserver } = session;
    observer?.disconnect();
    containerObserver?.disconnect();
    ce.remove();
    session = null;
  }

  const onFocusIn = (event) => {
    if (isTextarea(event.target) && event.target.dataset.skRunsEditor !== "1") mount(event.target);
  };

  // Moving focus from the textarea to the editor must not count as leaving the editor:
  // Excalidraw commits and closes on textarea blur.
  const onWindowBlur = (event) => {
    if (!session || event.target !== session.textarea) return;
    if (session.moving || event.relatedTarget === session.ce) event.stopImmediatePropagation();
  };

  const onChanged = () => {
    if (!session) return;
    renderFromElement();
    requestAnimationFrame(() => renderFromElement()); // the scene update re-renders the editor on the next frame
  };

  window.addEventListener("blur", onWindowBlur, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("selectionchange", onSelectionChange);
  window.addEventListener(TEXT_RUNS_CHANGED_EVENT, onChanged);
  return () => {
    window.removeEventListener("blur", onWindowBlur, true);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("selectionchange", onSelectionChange);
    window.removeEventListener(TEXT_RUNS_CHANGED_EVENT, onChanged);
    unmount();
  };
}
