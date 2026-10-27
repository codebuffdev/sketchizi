import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");

test("hamburger exposes Open repository and Clone repository actions", () => {
  assert.match(source, /data-sketchizi-repo-action="open"/);
  assert.match(source, /data-sketchizi-repo-action="clone"/);
});

test("repository picker loads repository metadata through same-origin backend gateway", () => {
  assert.match(source, /fetch\("\/api\/github\/repositories"/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /defaultBranch/);
});

test("repository picker browses authenticated repository contents and opens supported drawings", () => {
  assert.match(source, /\/api\/github\/repository-contents/);
  assert.match(source, /entry\.type === "dir"/);
  assert.match(source, /excalidraw\\\)\\\$\\\/i\\\.test/);
  assert.match(source, /loadDrawingFromText/);
  assert.doesNotMatch(source, /Repository file browsing and workspace creation are the next implementation step/);
});

test("repository picker styles are scoped", () => {
  assert.match(styles, /\.sketchizi-repository-picker-backdrop/);
  assert.match(styles, /\.sketchizi-repository-picker-item/);
});

test("repository picker includes a search field and filters repository metadata client-side", () => {
  assert.match(source, /data-repository-picker-search/);
  assert.match(source, /Search repositories by name/);
  assert.match(source, /search\.addEventListener\("input"/);
  assert.match(source, /item\.hidden = !item\.textContent\.toLocaleLowerCase\(\)\.includes\(query\)/);
  assert.match(styles, /\.sketchizi-repository-picker-search/);
});
