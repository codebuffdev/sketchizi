import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8");

test("hamburger does not expose GitHub repository open or clone actions", () => {
  assert.doesNotMatch(source, /data-sketchizi-repo-action/);
  assert.doesNotMatch(source, /GitHub repositories/);
  assert.doesNotMatch(source, /showRepositoryPicker/);
  assert.doesNotMatch(source, /\/api\/github\/(repositories|repository-contents)/);
});

test("repository picker styles are removed", () => {
  assert.doesNotMatch(styles, /\.sketchizi-repository-picker/);
  assert.doesNotMatch(styles, /\.sketchizi-git-repository-section/);
});
