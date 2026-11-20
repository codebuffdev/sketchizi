import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("opening a workspace diagram persists its last-opened timestamp before navigation", async () => {
  const dashboard = await read("../src/features/workspace/WorkspaceDashboard.jsx");
  assert.match(dashboard, /await workspaceClient\.updateDiagram\(d\.id, \{ lastOpenedAt: usedAt \}\)/);
  assert.match(dashboard, /await workspaceClient\.updateDiagram[\s\S]*window\.location\.assign/);
  assert.match(dashboard, /sortWorkspaceRecentlyUsed/);
});

test("duplicate-name normalization collapses repeated whitespace and case", async () => {
  const source = await read("../src/features/workspace/diagramNames.js");
  assert.match(source, /replace\(\/\\s\+\/g, " "\)/);
  assert.match(source, /toLocaleLowerCase/);
});

test("grammar suggestions are actionable and do not rewrite canvas text automatically", async () => {
  const component = await read("../src/features/canvas/CanvasGrammarAssistant.jsx");
  assert.match(component, /Apply suggestion/);
  assert.match(component, /Ignore/);
  assert.match(component, /setRangeText/);
  assert.match(component, /replaceContentEditableText/);
  assert.match(component, /onClick=\{apply\}/);
});
