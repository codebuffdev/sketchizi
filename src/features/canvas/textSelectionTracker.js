// Remembers the highlighted range of Excalidraw's text editor <textarea> so the
// floating toolbar can color just that range, even after a toolbar control took
// focus, and can put the highlight back afterwards.
//
//  - Swatch buttons call preventDefault() on mousedown, so focus (and the live
//    selection) never leaves the textarea.
//  - Native controls (the custom color <input>) do take focus. The range cached
//    on select / keyup / mouseup / selectionchange covers that case, and
//    armToolbarSelection() keeps it valid while the picker is open.

import { useSyncExternalStore } from "react";
import { colorAtSelection, textOf } from "./textRuns.js";

const EDITOR_SELECTOR = ".excalidraw-textEditorContainer textarea";
const cache = { elementId: null, start: 0, end: 0, value: "", armed: false };
const listeners = new Set();
let version = 0;
let installed = null;

const isEditor = (node) => node instanceof HTMLTextAreaElement && node.matches(EDITOR_SELECTOR);
const findEditor = () => (typeof document === "undefined" ? null : document.querySelector(EDITOR_SELECTOR));
const emit = () => { version += 1; listeners.forEach((listener) => listener()); };

export function subscribeTextSelection(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
// Re-renders the toolbar whenever the caret or highlight moves in the editor.
export const useTextSelectionVersion = () => useSyncExternalStore(subscribeTextSelection, () => version, () => 0);

function snapshot(textarea, getEditingElementId) {
  const id = getEditingElementId?.() ?? cache.elementId;
  const changed = cache.elementId !== id || cache.start !== textarea.selectionStart
    || cache.end !== textarea.selectionEnd || cache.value !== textarea.value;
  cache.elementId = id;
  cache.start = textarea.selectionStart;
  cache.end = textarea.selectionEnd;
  cache.value = textarea.value;
  if (changed) emit();
}

function forget() {
  if (cache.elementId === null && cache.start === cache.end) return;
  cache.elementId = null; cache.start = 0; cache.end = 0; cache.value = ""; cache.armed = false;
  emit();
}

export function installTextSelectionTracker({ getEditingElementId } = {}) {
  if (installed) installed.dispose();
  const read = (event) => { if (isEditor(event.target)) snapshot(event.target, getEditingElementId); };
  const onSelectionChange = () => {
    const active = document.activeElement;
    if (isEditor(active)) snapshot(active, getEditingElementId);
  };
  const onFocusOut = (event) => {
    if (!isEditor(event.target) || cache.armed) return;
    // Real exit from editing (not a toolbar control that armed the cache).
    setTimeout(() => { if (!cache.armed && !isEditor(document.activeElement)) forget(); }, 0);
  };
  const names = ["select", "keyup", "mouseup", "input", "focusin"];
  names.forEach((name) => document.addEventListener(name, read, true));
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("focusout", onFocusOut, true);
  const dispose = () => {
    names.forEach((name) => document.removeEventListener(name, read, true));
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("focusout", onFocusOut, true);
    installed = null;
  };
  installed = { dispose };
  return dispose;
}

// Call when a native toolbar control (color input) is about to take focus.
export function armToolbarSelection() {
  if (cache.elementId && cache.start !== cache.end) cache.armed = true;
}
export function releaseToolbarSelection() {
  if (!cache.armed) return;
  cache.armed = false;
  if (!isEditor(document.activeElement)) forget();
}

const sceneElement = (api, id) =>
  id ? (api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || []).find((element) => element.id === id) : null;

// The range to act on: the live textarea while editing, else the armed cache.
// Returns { elementId, element, start, end, text, live } or null.
export function getTextEditSelection(api, { includeCollapsed = false } = {}) {
  const editor = findEditor();
  const editingId = api?.getAppState?.()?.editingTextElement?.id ?? null;
  let source = null;
  if (editor && editingId) source = { elementId: editingId, start: editor.selectionStart, end: editor.selectionEnd, text: editor.value, live: true };
  else if (cache.armed && cache.elementId) source = { elementId: cache.elementId, start: cache.start, end: cache.end, text: cache.value, live: false };
  if (!source) return null;
  const element = sceneElement(api, source.elementId);
  if (!element || element.type !== "text") return null;
  if (!source.live && textOf(element) !== source.text) return null; // text changed since it was cached
  if (!includeCollapsed && source.start === source.end) return null;
  return { ...source, element };
}

// Color at the caret / highlight for the toolbar's active swatch.
//  string = one color, null = mixed, undefined = not editing text.
export function getTextSelectionColor(api) {
  const selection = getTextEditSelection(api, { includeCollapsed: true });
  if (!selection) return undefined;
  return colorAtSelection(selection.element, { start: selection.start, end: selection.end }, selection.text);
}

// Put the exact highlight back after the toolbar applied a color. Scene updates
// can re-render the editor, so restore now and again after the next frame.
export function restoreTextSelection({ start, end, text, live }) {
  const restore = () => {
    const editor = findEditor();
    if (!editor || editor.value !== text) return;
    if (live) editor.focus({ preventScroll: true });
    // When a native picker holds focus, only the range is restored; pulling focus
    // would close the picker mid-drag.
    editor.setSelectionRange(start, end);
    cache.start = start; cache.end = end;
  };
  restore();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
}
