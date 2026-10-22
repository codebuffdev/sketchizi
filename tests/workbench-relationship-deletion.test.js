import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/workbench.css", import.meta.url), "utf8");

test("relationship deletion removes the canonical model relation and increments model revision", () => {
  assert.match(controller, /const deleteRelation = useCallback/);
  assert.match(controller, /relations: workbench\.relations\.filter\(\(item\) => item\.id !== relationId\)/);
  assert.match(controller, /modelRevision: workbench\.modelRevision \+ 1/);
});

test("relationship deletion only tombstones the linked semantic connector", () => {
  assert.match(controller, /customData\?\.workbench\?\.relationId !== relationId/);
  assert.match(controller, /customData\?\.workbench\?\.role !== "relation"/);
  assert.match(controller, /isDeleted: true/);
});

test("relationship deletion is wired through the app and requires confirmation in the inspector", () => {
  assert.match(app, /onDeleteRelation=\{workbenchController\.deleteRelation\}/);
  assert.match(panel, /Delete relationship/);
  assert.match(panel, /globalThis\.confirm/);
  assert.match(css, /\.workbench-danger/);
});
