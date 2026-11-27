// Editor-side support for inline text colors.
//
//  1. While typing, keeps element.customData.runs aligned with the text so colors
//     stay attached to the characters they were applied to.
//  2. Shows the colors inside the live editor. Excalidraw's editor is a plain
//     <textarea> (single color), so a backdrop <div> with the same metrics sits
//     behind it and draws the runs; the textarea's own glyphs are made
//     transparent (caret and selection highlight stay native).

import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { baseColorOf, getElementRuns, rebaseRuns, runsCoverText, setElementRuns } from "./textRuns.js";

export const TEXT_RUNS_CHANGED_EVENT = "sketchizi:text-runs-changed";
const EDITOR_SELECTOR = ".excalidraw-textEditorContainer textarea";
const MIRROR_CLASS = "sketchizi-text-runs-mirror";
const COPIED_STYLES = [
  "position", "left", "top", "width", "height", "transform", "transformOrigin", "filter", "opacity",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textAlign",
  "whiteSpace", "wordBreak", "overflowWrap", "padding", "boxSizing", "direction", "color",
];

const isEditor = (node) => node instanceof HTMLTextAreaElement && node.matches(EDITOR_SELECTOR);

export function attachTextRunsEditor({ apiRef }) {
  let lastValue = null;
  let observed = null;
  const observer = typeof MutationObserver === "function" ? new MutationObserver(() => sync()) : null;

  const editingElement = () => {
    const api = apiRef?.current;
    const id = api?.getAppState?.()?.editingTextElement?.id;
    if (!id) return null;
    return (api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || []).find((element) => element.id === id) || null;
  };

  function removeMirror(textarea) {
    textarea?.parentNode?.querySelector?.(`.${MIRROR_CLASS}`)?.remove();
    if (textarea) { textarea.style.removeProperty("-webkit-text-fill-color"); textarea.style.removeProperty("caret-color"); }
  }

  function sync() {
    const textarea = document.querySelector(EDITOR_SELECTOR);
    if (!textarea) return;
    const element = editingElement();
    if (!element || !getElementRuns(element).length || !runsCoverText(element, textarea.value)) {
      removeMirror(textarea);
      return;
    }
    if (observer && observed !== textarea) {
      observer.disconnect();
      observer.observe(textarea, { attributes: true, attributeFilter: ["style"] });
      observed = textarea;
    }
    let mirror = textarea.parentNode.querySelector(`.${MIRROR_CLASS}`);
    if (!mirror) {
      mirror = document.createElement("div");
      mirror.className = MIRROR_CLASS;
      mirror.setAttribute("aria-hidden", "true");
      textarea.parentNode.insertBefore(mirror, textarea);
    }
    const computed = getComputedStyle(textarea);
    for (const name of COPIED_STYLES) mirror.style[name] = computed[name];
    Object.assign(mirror.style, { margin: "0", border: "0", background: "transparent", pointerEvents: "none", overflow: "hidden", resize: "none" });
    mirror.replaceChildren(...getElementRuns(element).map((run) => {
      const span = document.createElement("span");
      span.textContent = run.text;
      if (run.color) span.style.color = run.color;
      return span;
    }));
    textarea.style.setProperty("-webkit-text-fill-color", "transparent");
    textarea.style.caretColor = baseColorOf(element);
    observer?.takeRecords(); // our own style writes must not retrigger sync
  }

  const onFocusIn = (event) => {
    if (!isEditor(event.target)) return;
    lastValue = event.target.value;
    sync();
  };

  const onInput = (event) => {
    const textarea = event.target;
    if (!isEditor(textarea)) return;
    const api = apiRef?.current;
    const element = editingElement();
    const previous = lastValue;
    lastValue = textarea.value;
    if (!api || !element || previous === null) return;
    const runs = getElementRuns(element);
    if (runs.length && previous !== textarea.value) {
      // Runs that did not cover the previous text are stale; drop them rather than guess.
      const next = runsCoverText(element, previous) ? rebaseRuns(runs, previous, textarea.value, baseColorOf(element)) : [];
      const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
      api.updateScene?.({
        elements: elements.map((item) => (item.id === element.id ? { ...setElementRuns(item, next), version: (Number(item.version) || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() } : item)),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
    sync();
  };

  const onChanged = () => {
    const textarea = document.querySelector(EDITOR_SELECTOR);
    if (textarea) lastValue = textarea.value;
    sync();
    requestAnimationFrame(sync); // the scene update re-renders the editor on the next frame
  };

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("input", onInput, true);
  window.addEventListener(TEXT_RUNS_CHANGED_EVENT, onChanged);
  return () => {
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("input", onInput, true);
    window.removeEventListener(TEXT_RUNS_CHANGED_EVENT, onChanged);
    observer?.disconnect();
    removeMirror(document.querySelector(EDITOR_SELECTOR));
  };
}
