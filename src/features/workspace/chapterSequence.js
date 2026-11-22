// Chapter sequence model for Cloud Workspace projects.
//
// A project's diagrams form an ordered list of "chapters" (CH 01, CH 02, ...).
// Sequence position (`orderIndex`) is deliberately decoupled from activity
// (`lastOpenedAt` / `updatedAt`): opening or saving a diagram never moves it.
//
// Where the order lives
//   1. `orderIndex` / `chapterStatus` on the diagram record, when the backend
//      returns a complete, unique set for the project.
//   2. Otherwise a per-project layout kept in localStorage (the fallback, and
//      the place the order is first "locked" for projects that predate this).
//   3. Otherwise natural numeric title order (day-01 < day-02 < ... < day-10).

export const CHAPTER_LAYOUT_STORAGE_KEY = "sketchizi.workspace.chapterLayout.v1";

export const CHAPTER_STATUSES = Object.freeze(["up-next", "active", "done"]);
export const CHAPTER_STATUS_LABELS = Object.freeze({
  "up-next": "Up Next",
  active: "Active Chapter",
  done: "Done",
});

const pad = (value) => String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(2, "0");

export const formatChapterLabel = (chapterNumber) => `CH ${pad(chapterNumber)}`;
export const formatChapterShortLabel = (chapterNumber) => `Ch ${pad(chapterNumber)}`;
export const formatChapterBadge = (chapterNumber) => `${pad(chapterNumber)} · CH ${pad(chapterNumber)}`;

export function normalizeChapterStatus(value) {
  return CHAPTER_STATUSES.includes(value) ? value : "up-next";
}

export function cycleChapterStatus(status) {
  const index = CHAPTER_STATUSES.indexOf(normalizeChapterStatus(status));
  return CHAPTER_STATUSES[(index + 1) % CHAPTER_STATUSES.length];
}

const diagramTitle = (diagram) => String(diagram?.name ?? diagram?.title ?? "");

export function naturalTitleCompare(a, b) {
  return diagramTitle(a).localeCompare(diagramTitle(b), undefined, { numeric: true, sensitivity: "base" });
}

/* ---------- local layout persistence ---------- */

function readAllLayouts(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(CHAPTER_LAYOUT_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readChapterLayout(projectId, storage = globalThis.localStorage) {
  const layout = projectId ? readAllLayouts(storage)[projectId] : null;
  return {
    order: Array.isArray(layout?.order) ? layout.order.filter((id) => typeof id === "string") : [],
    status: layout?.status && typeof layout.status === "object" && !Array.isArray(layout.status) ? layout.status : {},
  };
}

export function writeChapterLayout(projectId, layout, storage = globalThis.localStorage) {
  if (!projectId || !storage) return false;
  try {
    const all = readAllLayouts(storage);
    all[projectId] = { order: layout.order, status: layout.status, updatedAt: new Date().toISOString() };
    storage.setItem(CHAPTER_LAYOUT_STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export const buildChapterLayout = (chapters) => ({
  order: chapters.map((chapter) => chapter.id),
  status: Object.fromEntries(chapters.map((chapter) => [chapter.id, chapter.chapterStatus])),
});

/* ---------- resolving the ordered chapter list ---------- */

function hasCompleteServerOrder(rows) {
  if (!rows.length) return false;
  if (!rows.every((row) => Number.isInteger(row.orderIndex) && row.orderIndex >= 0)) return false;
  return new Set(rows.map((row) => row.orderIndex)).size === rows.length;
}

/**
 * Returns every diagram with a normalized, contiguous `orderIndex` (0..n-1),
 * a 1-based `chapterNumber` and a valid `chapterStatus`. Never reads activity
 * timestamps, so opening or editing a diagram cannot change its position.
 */
export function resolveChapterSequence(diagrams, layout = { order: [], status: {} }) {
  const rows = (Array.isArray(diagrams) ? diagrams : []).filter((row) => row && row.id);
  let ordered;
  if (hasCompleteServerOrder(rows)) {
    ordered = [...rows].sort((a, b) => a.orderIndex - b.orderIndex);
  } else {
    const position = new Map((layout.order || []).map((id, index) => [id, index]));
    const known = rows.filter((row) => position.has(row.id)).sort((a, b) => position.get(a.id) - position.get(b.id));
    const unknown = rows.filter((row) => !position.has(row.id)).sort(naturalTitleCompare);
    ordered = [...known, ...unknown];
  }
  return ordered.map((row, index) => ({
    ...row,
    orderIndex: index,
    chapterNumber: index + 1,
    chapterStatus: normalizeChapterStatus(row.chapterStatus ?? layout.status?.[row.id]),
  }));
}

const renumber = (chapters) => chapters.map((chapter, index) => ({ ...chapter, orderIndex: index, chapterNumber: index + 1 }));

/** Swap a chapter with its neighbour (`delta` is -1 or +1). */
export function moveChapter(chapters, id, delta) {
  const from = chapters.findIndex((chapter) => chapter.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= chapters.length) return chapters;
  const next = [...chapters];
  [next[from], next[to]] = [next[to], next[from]];
  return renumber(next);
}

/** Drag-and-drop: lift `fromId` and drop it into `toId`'s position. */
export function reorderChapters(chapters, fromId, toId) {
  const from = chapters.findIndex((chapter) => chapter.id === fromId);
  const to = chapters.findIndex((chapter) => chapter.id === toId);
  if (from < 0 || to < 0 || from === to) return chapters;
  const next = [...chapters];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return renumber(next);
}

/** Remove a chapter and compact the remaining orderIndex / chapter numbers. */
export function removeChapter(chapters, id) {
  return renumber(chapters.filter((chapter) => chapter.id !== id));
}

export function setChapterStatus(chapters, id, status) {
  return chapters.map((chapter) => (chapter.id === id ? { ...chapter, chapterStatus: normalizeChapterStatus(status) } : chapter));
}

export function appendChapter(chapters, diagram) {
  if (!diagram?.id || chapters.some((chapter) => chapter.id === diagram.id)) return chapters;
  return renumber([...chapters, { ...diagram, chapterStatus: normalizeChapterStatus(diagram.chapterStatus) }]);
}

/** Which chapters need their server-side metadata rewritten after an edit. */
export function getChapterChanges(before, after) {
  const previous = new Map(before.map((chapter) => [chapter.id, chapter]));
  return after
    .filter((chapter) => {
      const old = previous.get(chapter.id);
      return !old || old.orderIndex !== chapter.orderIndex || old.chapterStatus !== chapter.chapterStatus;
    })
    .map((chapter) => ({ id: chapter.id, orderIndex: chapter.orderIndex, chapterStatus: chapter.chapterStatus }));
}

export const countCompletedChapters = (chapters) => chapters.filter((chapter) => chapter.chapterStatus === "done").length;

export function getChapterNeighbors(chapters, id) {
  const index = chapters.findIndex((chapter) => chapter.id === id);
  if (index < 0) return null;
  return { index, total: chapters.length, current: chapters[index], previous: chapters[index - 1] || null, next: chapters[index + 1] || null };
}

/* ---------- naming ---------- */

/**
 * Suggest the next chapter's name, inheriting the naming prefix of the last
 * chapter: `day-05-systemdesign-implementation` -> `day-06-systemdesign-`
 * (the person completes the final segment). Falls back to `Chapter 06`.
 */
export function suggestNextChapterName(chapters) {
  const fallback = `Chapter ${pad(chapters.length + 1)}`;
  const last = chapters[chapters.length - 1];
  const match = diagramTitle(last).match(/^(.*?)(\d+)(.*)$/);
  if (!match) return fallback;
  const [, prefix, digits, rest] = match;
  const next = String(Number.parseInt(digits, 10) + 1).padStart(digits.length, "0");
  const lastSeparator = Math.max(rest.lastIndexOf("-"), rest.lastIndexOf("_"), rest.lastIndexOf(" "));
  return `${prefix}${next}${lastSeparator >= 0 ? rest.slice(0, lastSeparator + 1) : ""}`;
}
