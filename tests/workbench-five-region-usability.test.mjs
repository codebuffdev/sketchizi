import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/responsive-final.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("wide desktop Workbench layout retains the resource palette instead of hiding it unconditionally", () => {
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*?\.desktop-workspace\.desktop-workspace-workbench-open \.desktop-resources-region\s*\{[^}]*display:\s*block/);
  assert.match(css, /desktop-workspace-library-closed \.desktop-resources-region[\s\S]*?display:\s*none/);
});

test("wide desktop Workbench layout allocates a dedicated canvas, engineering, and optional context region", () => {
  assert.match(css, /grid-template-columns:\s*minmax\(190px, 220px\) minmax\(320px, 1fr\) minmax\(320px, 368px\) minmax\(230px, 280px\)/);
  assert.match(css, /\.desktop-workspace\.desktop-workspace-workbench-open \.desktop-context-region\s*\{[^}]*display:\s*flex/);
  assert.match(css, /desktop-workspace-context-closed \.desktop-context-region\s*\{\s*display:\s*none/);
});

test("resource and context regions remain part of the existing application shell", () => {
  assert.match(app, /className=\{`desktop-resources-region/);
  assert.match(app, /className=\{`desktop-context-region/);
  assert.match(app, /<WorkbenchPanel/);
});
