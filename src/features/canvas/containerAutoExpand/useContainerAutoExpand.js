import { useCallback, useEffect, useRef } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { getBoundTextElement, getContainerIdOf, getTextSignature, planContainerExpansion } from "./containerFit.js";
import { measureTextBlock } from "./textMeasure.js";

const EDITOR_SELECTOR = ".excalidraw-textEditorContainer textarea";

/**
 * Grows / shrinks a shape so its bound text keeps a 16 x 12 inner margin.
 * Reacts to typing, deleting and font-size or font-family changes made on the
 * selected / edited shape. Returns `onSceneChange(elements, appState)` to call
 * from the canvas's Excalidraw onChange handler.
 *
 * Only the local user's selection or edit is considered, so a remote
 * collaborator's change is never re-fitted on this client (their client does it).
 */
export function useContainerAutoExpand({ apiRef, canEdit, viewModeEnabled }) {
  const enabledRef = useRef(Boolean(canEdit) && !viewModeEnabled);
  enabledRef.current = Boolean(canEdit) && !viewModeEnabled;
  const signaturesRef = useRef(new Map());   // containerId -> last seen text signature
  const pendingRef = useRef(new Set());      // containerIds waiting for the next frame
  const liveTextRef = useRef(new Map());     // textId -> text currently in the editor
  const frameRef = useRef(0);

  const flush = useCallback(() => {
    frameRef.current = 0;
    const api = apiRef?.current;
    const ids = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (!api || !ids.length || !enabledRef.current) return;
    const all = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
    const patches = planContainerExpansion({
      elements: all,
      containerIds: ids,
      measure: measureTextBlock,
      liveTextById: liveTextRef.current,
      editingTextId: api.getAppState?.()?.editingTextElement?.id ?? null,
    });
    if (!patches.size) return;
    // EVENTUALLY: the resize joins the next undo step instead of making its own.
    api.updateScene({
      elements: all.map((element) => (patches.has(element.id) ? { ...element, ...patches.get(element.id) } : element)),
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    });
  }, [apiRef]);

  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(flush);
  }, [flush]);

  /** Queues `containerId` when its text signature moved since we last looked. */
  const consider = useCallback((container, textElement, { editing }) => {
    const signature = getTextSignature(textElement, liveTextRef.current.get(textElement.id));
    const previous = signaturesRef.current.get(container.id);
    if (previous === signature) return;
    signaturesRef.current.set(container.id, signature);
    // First sight of a merely-selected shape only records its baseline, so opening
    // a file or selecting a shape never resizes anything.
    if (previous === undefined && !editing) return;
    pendingRef.current.add(container.id);
    schedule();
  }, [schedule]);

  const onSceneChange = useCallback((elements, appState) => {
    if (!enabledRef.current || !Array.isArray(elements)) return;
    const byId = new Map(elements.map((element) => [element.id, element]));
    const editingId = appState?.editingTextElement?.id ?? null;
    const watched = new Set(Object.entries(appState?.selectedElementIds || {}).filter(([, on]) => on).map(([id]) => id));
    if (editingId) watched.add(editingId);
    for (const id of watched) {
      const element = byId.get(id);
      const containerId = getContainerIdOf(element, byId);
      if (!containerId) continue;
      const container = byId.get(containerId);
      const textElement = getBoundTextElement(container, byId);
      if (textElement) consider(container, textElement, { editing: textElement.id === editingId });
    }
  }, [consider]);

  // Typing: act on the editor's own text so the box tracks every keystroke.
  useEffect(() => {
    const onInput = (event) => {
      const textarea = event.target;
      if (!enabledRef.current || !(textarea instanceof HTMLTextAreaElement) || !textarea.matches(EDITOR_SELECTOR)) return;
      const api = apiRef?.current;
      const editingId = api?.getAppState?.()?.editingTextElement?.id;
      if (!editingId) return;
      const elements = api.getSceneElements?.() || [];
      const byId = new Map(elements.map((element) => [element.id, element]));
      const containerId = getContainerIdOf(byId.get(editingId), byId);
      if (!containerId) return;
      liveTextRef.current.set(editingId, textarea.value);
      const container = byId.get(containerId);
      const textElement = getBoundTextElement(container, byId);
      if (textElement) consider(container, textElement, { editing: true });
    };
    const onEditorClosed = (event) => {
      if (event.target instanceof HTMLTextAreaElement && event.target.matches(EDITOR_SELECTOR)) liveTextRef.current.clear();
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusout", onEditorClosed, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("focusout", onEditorClosed, true);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [apiRef, consider]);

  return { onSceneChange };
}
