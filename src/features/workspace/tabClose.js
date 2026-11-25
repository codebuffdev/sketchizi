/**
 * Pure decisions for closing a canvas tab. Keeping them outside App.jsx lets
 * the last-tab scenario be regression-tested without mounting Excalidraw.
 */

/** Work out what remains after closing `closingId` and which tab becomes active. */
export function resolveTabClose({ tabs = [], closingId, activeId = "" } = {}) {
  const list = Array.isArray(tabs) ? tabs : [];
  const index = list.findIndex((tab) => tab?.id === closingId);
  if (index < 0) return { found: false, remainingTabs: list, nextActiveId: activeId, returnToWelcome: false };
  const remainingTabs = list.filter((tab) => tab?.id !== closingId);
  if (remainingTabs.length === 0) {
    return { found: true, remainingTabs, nextActiveId: "", returnToWelcome: true };
  }
  const closingActive = closingId === activeId;
  const nextActive = closingActive ? (list[index - 1] || remainingTabs[0]) : null;
  return {
    found: true,
    remainingTabs,
    nextActiveId: nextActive ? nextActive.id : activeId,
    returnToWelcome: false,
  };
}

/**
 * The canvas may only be mounted while an open tab owns it. A stale active id
 * that no longer matches a tab must never keep the old scene on screen.
 */
export function hasMountableCanvas({ tabs = [], activeCanvasId = "" } = {}) {
  if (!activeCanvasId) return false;
  return (Array.isArray(tabs) ? tabs : []).some((tab) => tab?.id === activeCanvasId);
}


const DEFAULT_UNTITLED_NAMES = /^(?:untitled(?: page| canvas| drawing)?|page 1|canvas [0-9]+)$/i;
const PAGE_CONTENT_FIELDS = ["tagline", "subtitle", "summary", "focus", "focusText", "focus_text", "keyNote", "description"];

function hasPageEditorialContent(value) {
  if (!value || typeof value !== "object") return false;
  return PAGE_CONTENT_FIELDS.some((field) => String(value[field] ?? "").trim().length > 0);
}

/**
 * A pristine tab has no authored scene content, editorial page metadata, or
 * dirty state. Pages mode's generated frame and paper are layout scaffolding,
 * not user content, and must not force the close-draft confirmation.
 */
export function isPristineCanvas({ tab, snapshot, elements, dirty = false } = {}) {
  const source = snapshot || tab?.snapshot || {};
  const scene = Array.isArray(elements) ? elements : (Array.isArray(source.elements) ? source.elements : []);
  if (dirty || tab?.dirty || source.fileDirty || source.documentDirty || source.dirty || source.systemDesign?.active) return false;

  const live = scene.filter((element) => element && !element.isDeleted);
  const authored = live.filter((element) => {
    const data = element.customData || {};
    const isPageFrame = element.type === "frame" && data.sketchiziPage === true;
    const isPagePaper = Boolean(data.sketchiziPagePaper);
    return !isPageFrame && !isPagePaper;
  });
  if (authored.length) return false;

  const tabName = String(tab?.name || "").trim();
  if (tabName && !DEFAULT_UNTITLED_NAMES.test(tabName)) return false;

  const pageFrames = live.filter((element) => element.type === "frame" && element.customData?.sketchiziPage === true);
  if (pageFrames.some((frame) => {
    const title = String(frame.customData?.chapterTitle || frame.name || "").trim();
    return (title && !DEFAULT_UNTITLED_NAMES.test(title)) || hasPageEditorialContent(frame.customData);
  })) return false;

  const chapters = Array.isArray(source.chapters) ? source.chapters : [];
  if (chapters.some((chapter) => {
    const title = String(chapter?.title || "").trim();
    return (title && !DEFAULT_UNTITLED_NAMES.test(title)) || hasPageEditorialContent(chapter);
  })) return false;

  return !hasPageEditorialContent(tab) && !hasPageEditorialContent(source);
}
