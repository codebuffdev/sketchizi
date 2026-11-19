import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction, getCommonBounds, newElementWith, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import { getActiveSelectedElementIds } from "../../features/canvas/selectedElementIds.js";
import { getPageViewportMask } from "../../features/pages/pageModel.js";
import "./RectangleTitles.css";

const TITLE_KEY = "sketchiziRectangleTitle";
const TITLE_HEIGHT = 26;
const TITLE_INSET = 6;
const MAX_WIDTH = 260;
const MAX_LENGTH = 80;

function isTitleableRectangle(element) {
  return element?.type === "rectangle" && !element.isDeleted && !element.customData?.sketchiziPagePaper;
}

function getTitle(element) {
  const value = element.customData?.[TITLE_KEY];
  return typeof value === "string" ? value.trim() : "";
}

function getPosition(element, state, origin, visible, selected, minimumClearance) {
  const [minX, minY, maxX, maxY] = getCommonBounds([element]);
  const start = sceneCoordsToViewportCoords({ sceneX: minX, sceneY: minY }, state);
  const end = sceneCoordsToViewportCoords({ sceneX: maxX, sceneY: maxY }, state);
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
  if (start.x >= visible.right || end.x <= visible.left || start.y >= visible.bottom || end.y <= visible.top) return null;

  const left = Math.max(visible.left, start.x) + TITLE_INSET;
  const availableWidth = Math.min(MAX_WIDTH, visible.right - left - TITLE_INSET);
  // Keep the title control clear of the centered rotation handle on narrow shapes.
  const widthBeforeHandle = (start.x + end.x) / 2 - left - 12;
  const aboveHandle = selected && widthBeforeHandle < Math.min(availableWidth, minimumClearance);
  const maxWidth = selected && !aboveHandle ? Math.min(availableWidth, widthBeforeHandle) : availableWidth;
  const gap = aboveHandle ? 26 : 7;
  const top = Math.max(visible.top + 2, start.y - TITLE_HEIGHT - gap);
  if (maxWidth < 32 || top + TITLE_HEIGHT > visible.bottom) return null;

  return { left: left - origin.x, top: top - origin.y, maxWidth };
}

function stopPropagation(event) {
  event.stopPropagation();
}

function RectangleTitleInput({ style, initialValue, onFinish }) {
  const inputRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    input.focus({ preventScroll: true });
    input.select();
    const finishOnOutsideClick = (event) => {
      // A canvas pointer down does not always move focus on its own.
      if (event.target !== input) input.blur();
    };
    document.addEventListener("pointerdown", finishOnOutsideClick, true);
    return () => document.removeEventListener("pointerdown", finishOnOutsideClick, true);
  }, []);

  return (
    <input
      ref={inputRef}
      className="sk-rectangle-title sk-rectangle-title-input"
      data-sketchizi-inline-editor
      aria-label="Rectangle name"
      placeholder="Name this rectangle"
      defaultValue={initialValue}
      maxLength={MAX_LENGTH}
      style={style}
      onPointerDown={stopPropagation}
      onBlur={(event) => onFinish(cancelledRef.current ? null : event.currentTarget.value.trim())}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || (event.key !== "Enter" && event.key !== "Escape")) return;
        event.preventDefault();
        cancelledRef.current = event.key === "Escape";
        event.currentTarget.blur();
      }}
    />
  );
}

export default function RectangleTitles({ api, canvasRootRef, elements, pageContext, canEdit }) {
  const [editor, setEditor] = useState(null);
  const state = api?.getAppState();
  const editingAllowed = canEdit && !state?.viewModeEnabled;
  const selectionTool = state?.activeTool?.type === "selection";
  const selection = getActiveSelectedElementIds(state?.selectedElementIds);
  const selectedId = selection.length === 1 ? selection[0] : null;
  const candidates = [];
  for (const element of elements) {
    if (!isTitleableRectangle(element)) continue;
    const title = getTitle(element);
    const selected = element.id === selectedId;
    const editing = editingAllowed && !element.locked && editor?.id === element.id;
    if (title || editing) candidates.push({ element, title, selected, editing });
  }

  const host = candidates.length ? canvasRootRef.current?.querySelector(":scope > .excalidraw") : null;
  const pageMode = pageContext?.mode === "pages";
  const page = pageMode && elements.find((element) => element.id === pageContext.page?.id);
  const pageRect = page ? getPageViewportMask(page, state)?.pageRect : null;
  const labels = [];

  if (host && state && (!pageMode || pageRect)) {
    const bounds = host.getBoundingClientRect();
    const origin = { x: bounds.left + host.clientLeft, y: bounds.top + host.clientTop };
    const visible = pageRect ? {
      left: Math.max(origin.x, pageRect.left),
      top: Math.max(origin.y, pageRect.top),
      right: Math.min(origin.x + host.clientWidth, pageRect.left + pageRect.width),
      bottom: Math.min(origin.y + host.clientHeight, pageRect.top + pageRect.height),
    } : {
      left: origin.x,
      top: origin.y,
      right: origin.x + host.clientWidth,
      bottom: origin.y + host.clientHeight,
    };

    for (const candidate of candidates) {
      const { element, selected, editing } = candidate;
      const style = getPosition(element, state, origin, visible, selected, editing ? 220 : 112);
      if (style) labels.push({ ...candidate, style });
    }
  }

  const editorVisible = labels.some(({ editing }) => editing);
  useEffect(() => {
    if (editor && !editorVisible) setEditor(null);
  }, [editor, editorVisible]);

  const finishEdit = (title) => {
    setEditor(null);
    if (title === null || title === editor.initialValue || !editingAllowed) return;

    const all = api.getSceneElementsIncludingDeleted();
    const current = all.find((element) => element.id === editor.id);
    if (!isTitleableRectangle(current) || current.locked || title === getTitle(current)) return;

    const customData = { ...current.customData };
    if (title) customData[TITLE_KEY] = title;
    else delete customData[TITLE_KEY];
    const updated = newElementWith(current, { customData });
    api.updateScene({
      elements: all.map((element) => element.id === current.id ? updated : element),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  if (!host || !labels.length) return null;

  return createPortal(
    <div className="sk-rectangle-titles" style={{ "--rectangle-title-height": `${TITLE_HEIGHT}px` }}>
      {labels.map(({ element, title, editing, style }) => {
        if (editing) {
          return <RectangleTitleInput key={element.id} style={style} initialValue={editor.initialValue} onFinish={finishEdit} />;
        }
        if (!editingAllowed || !selectionTool || element.locked) {
          return <span key={element.id} className="sk-rectangle-title" style={style}>{title}</span>;
        }
        return (
          <button
            key={element.id}
            type="button"
            className={title ? "sk-rectangle-title" : "sk-rectangle-title sk-rectangle-title-add"}
            aria-label={title ? `Rename rectangle: ${title}` : "Add name to rectangle"}
            title={title ? `Click to rename ${title}` : undefined}
            style={style}
            onPointerDown={stopPropagation}
            onClick={() => setEditor({ id: element.id, initialValue: title })}
          >
            {title || <><span aria-hidden="true">+</span> Add name</>}
          </button>
        );
      })}
    </div>,
    host,
  );
}
