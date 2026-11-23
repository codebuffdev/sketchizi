import test from "node:test";
import assert from "node:assert/strict";
import {
  appendChapter, buildChapterLayout, cycleChapterStatus, formatChapterBadge, formatChapterLabel, getChapterChanges, getChapterNeighbors,
  moveChapter, readChapterLayout, removeChapter, reorderChapters, resolveChapterSequence, setChapterStatus, suggestNextChapterName, writeChapterLayout,
} from "../src/features/workspace/chapterSequence.js";
import { findLastOpenedItem, sortWorkspaceDiagrams } from "../src/features/workspace/workspacePresentation.js";

const names = ["day-05-systemdesign-implementation", "day-01-systemdesign-requirement-gathering", "day-10-systemdesign-ops", "day-02-systemdesign-capacity-estimate", "day-03-systemdesign-HLD", "day-04-systemdesign-LLD"];
const rows = () => names.map((name, i) => ({ id: `d${i}`, name, updatedAt: "2026-11-01T00:00:00Z" }));
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const ids = (chapters) => chapters.map((c) => c.name.slice(0, 6));

test("migration without orderIndex uses natural numeric title order (day-10 after day-05)", () => {
  const chapters = resolveChapterSequence(rows());
  assert.deepEqual(ids(chapters), ["day-01", "day-02", "day-03", "day-04", "day-05", "day-10"]);
  assert.deepEqual(chapters.map((c) => c.orderIndex), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(chapters.map((c) => c.chapterNumber), [1, 2, 3, 4, 5, 6]);
  assert.ok(chapters.every((c) => c.chapterStatus === "up-next"));
});

test("opening or editing a diagram never changes its sequence position", () => {
  const before = resolveChapterSequence(rows());
  const layout = buildChapterLayout(before);
  const touched = rows().map((r) => r.name.startsWith("day-01") ? { ...r, lastOpenedAt: "2026-11-22T10:00:00Z", updatedAt: "2026-11-22T10:00:00Z" } : r);
  const after = resolveChapterSequence(touched, layout);
  assert.deepEqual(after.map((c) => c.id), before.map((c) => c.id));
  assert.equal(after[0].name.slice(0, 6), "day-01");
  assert.equal(findLastOpenedItem(after).name.slice(0, 6), "day-01");
});

test("a stored layout locks the order even if titles are renamed later", () => {
  const before = resolveChapterSequence(rows());
  const layout = buildChapterLayout(before);
  const renamed = rows().map((r) => r.name.startsWith("day-01") ? { ...r, name: "zzz intro" } : r);
  assert.equal(resolveChapterSequence(renamed, layout)[0].name, "zzz intro");
});

test("new diagrams unknown to the layout are appended after known chapters", () => {
  const layout = buildChapterLayout(resolveChapterSequence(rows()));
  const withNew = [...rows(), { id: "new", name: "aaa newest" }];
  const chapters = resolveChapterSequence(withNew, layout);
  assert.equal(chapters.at(-1).id, "new");
});

test("a complete unique server orderIndex wins; an incomplete or duplicated one is ignored", () => {
  const server = rows().map((r, i) => ({ ...r, orderIndex: 5 - i }));
  assert.deepEqual(resolveChapterSequence(server).map((c) => c.id), ["d5", "d4", "d3", "d2", "d1", "d0"]);
  const partial = rows().map((r, i) => i === 0 ? r : { ...r, orderIndex: i });
  assert.equal(resolveChapterSequence(partial)[0].name.slice(0, 6), "day-01");
  const dupes = rows().map((r) => ({ ...r, orderIndex: 0 }));
  assert.equal(resolveChapterSequence(dupes)[0].name.slice(0, 6), "day-01");
});

test("moveChapter swaps neighbours and renumbers; edges are no-ops", () => {
  const chapters = resolveChapterSequence(rows());
  const moved = moveChapter(chapters, chapters[1].id, 1);
  assert.deepEqual(ids(moved).slice(0, 3), ["day-01", "day-03", "day-02"]);
  assert.deepEqual(moved.map((c) => c.chapterNumber), [1, 2, 3, 4, 5, 6]);
  assert.equal(moveChapter(chapters, chapters[0].id, -1), chapters);
  assert.equal(moveChapter(chapters, chapters.at(-1).id, 1), chapters);
});

test("reorderChapters (drag and drop) lifts a chapter into the target slot", () => {
  const chapters = resolveChapterSequence(rows());
  const next = reorderChapters(chapters, chapters[0].id, chapters[3].id);
  assert.deepEqual(ids(next), ["day-02", "day-03", "day-04", "day-01", "day-05", "day-10"]);
  assert.equal(reorderChapters(chapters, chapters[0].id, chapters[0].id), chapters);
});

test("deleting CH 02 compacts the remaining chapters to CH 01..CH 05", () => {
  const chapters = resolveChapterSequence(rows());
  const next = removeChapter(chapters, chapters[1].id);
  assert.deepEqual(next.map((c) => formatChapterLabel(c.chapterNumber)), ["CH 01", "CH 02", "CH 03", "CH 04", "CH 05"]);
  assert.deepEqual(next.map((c) => c.orderIndex), [0, 1, 2, 3, 4]);
  assert.deepEqual(getChapterChanges(chapters, next).map((c) => c.id), chapters.slice(2).map((c) => c.id));
});

test("status cycles Up Next -> Active -> Done -> Up Next and is carried by the layout", () => {
  assert.equal(cycleChapterStatus("up-next"), "active");
  assert.equal(cycleChapterStatus("active"), "done");
  assert.equal(cycleChapterStatus("done"), "up-next");
  assert.equal(cycleChapterStatus("garbage"), "active");
  const chapters = setChapterStatus(resolveChapterSequence(rows()), "d1", "done");
  const restored = resolveChapterSequence(rows(), buildChapterLayout(chapters));
  assert.equal(restored.find((c) => c.id === "d1").chapterStatus, "done");
});

test("appendChapter adds at the end without displacing anything and ignores duplicates", () => {
  const chapters = resolveChapterSequence(rows());
  const next = appendChapter(chapters, { id: "n", name: "day-11-systemdesign-x" });
  assert.equal(next.at(-1).id, "n");
  assert.equal(next.at(-1).chapterNumber, 7);
  assert.equal(appendChapter(next, { id: "n", name: "again" }), next);
});

test("next chapter name inherits the naming prefix and zero padding", () => {
  const five = resolveChapterSequence(rows().filter((r) => !r.name.startsWith("day-10")));
  assert.equal(suggestNextChapterName(five), "day-06-systemdesign-");
  assert.equal(suggestNextChapterName([{ id: "a", name: "day-09" }]), "day-10");
  assert.equal(suggestNextChapterName([{ id: "a", name: "Intro" }, { id: "b", name: "Basics" }]), "Chapter 03");
  assert.equal(suggestNextChapterName([]), "Chapter 01");
});

test("chapter labels and neighbours", () => {
  assert.equal(formatChapterBadge(1), "01 · CH 01");
  const chapters = resolveChapterSequence(rows());
  const middle = getChapterNeighbors(chapters, chapters[2].id);
  assert.equal(middle.index, 2); assert.equal(middle.total, 6);
  assert.equal(middle.previous.id, chapters[1].id); assert.equal(middle.next.id, chapters[3].id);
  assert.equal(getChapterNeighbors(chapters, chapters[0].id).previous, null);
  assert.equal(getChapterNeighbors(chapters, "missing"), null);
});

test("layout round-trips through storage and tolerates corrupt data", () => {
  const storage = memoryStorage();
  const layout = buildChapterLayout(resolveChapterSequence(rows()));
  assert.equal(writeChapterLayout("p1", layout, storage), true);
  assert.deepEqual(readChapterLayout("p1", storage).order, layout.order);
  assert.deepEqual(readChapterLayout("other", storage), { order: [], status: {} });
  storage.setItem("sketchizi.workspace.chapterLayout.v1", "{not json");
  assert.deepEqual(readChapterLayout("p1", storage), { order: [], status: {} });
});

test("Grid view sorts by sequence by default and by recency on request", () => {
  const chapters = resolveChapterSequence(rows()).map((c, i) => i === 0 ? { ...c, lastOpenedAt: "2026-11-22T00:00:00Z" } : c);
  assert.equal(sortWorkspaceDiagrams(chapters)[0].chapterNumber, 1);
  assert.deepEqual(sortWorkspaceDiagrams(chapters).map((c) => c.orderIndex), [0, 1, 2, 3, 4, 5]);
  assert.equal(sortWorkspaceDiagrams(chapters, "recent")[0].id, chapters[0].id);
  const shuffled = [chapters[3], chapters[1], chapters[0]];
  assert.deepEqual(sortWorkspaceDiagrams(shuffled).map((c) => c.orderIndex), [0, 1, 3]);
  assert.equal(shuffled[0], chapters[3]);
});

import { readFile } from "node:fs/promises";
import { readAppSource } from "./helpers/app-source.js";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dashboard wires sequence flow, inline rename/delete, drag reorder and trailing add card", async () => {
  const dashboard = await read("../src/features/workspace/WorkspaceDashboard.jsx");
  for (const pattern of [
    /Sequence Flow/, /\+ Add Next Chapter/, /\+ Chapter \{nextChapterLabel\}/, /Chapters Completed/, /Resume Last Opened/, /Last Opened/,
    /onDoubleClick/, /e\.key === "Enter"/, /e\.key === "Escape"/, /role="alertdialog"/, /draggable/, /onDragStart/, /Move chapter earlier/, /Move chapter later/,
    /WORKSPACE_GRID_SORTS/, /updateDiagramChapter/,
  ]) assert.match(dashboard, pattern);
  // Opening a diagram must never write orderIndex.
  const openDiagram = dashboard.slice(dashboard.indexOf("const openDiagram"), dashboard.indexOf("const startRename"));
  assert.doesNotMatch(openDiagram, /orderIndex/);
  assert.match(openDiagram, /lastOpenedAt/);
});

test("editor header exposes the chapter switcher and app wires navigation", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const app = await readAppSource();
  assert.match(header, /Chapter \{chapterNav\.index \+ 1\} of \{chapterNav\.total\}/);
  assert.match(header, /onNavigateChapter\?\.\(chapterNav\.previous\)/);
  assert.match(app, /useChapterNavigation/);
  assert.match(app, /onNavigateChapter=\{navigateToChapter\}/);
});
