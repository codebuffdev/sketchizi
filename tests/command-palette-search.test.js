import test from "node:test";
import assert from "node:assert/strict";
import { rankCommands } from "../src/features/commands/commandPaletteSearch.js";

const commands = [
  { id: "fit", label: "Fit to Canvas", description: "Fit the drawing into the viewport", category: "View", keywords: ["center", "viewport", "diagram"], shortcut: "F" },
  { id: "zoom", label: "Zoom In", description: "Increase canvas zoom", category: "View", keywords: ["magnify"], shortcut: "Ctrl++" },
  { id: "save", label: "Save", description: "Save the current drawing", category: "Files", keywords: ["persist"], shortcut: "Ctrl+S" },
];

test("ranks exact and prefix label matches ahead of weaker matches", () => {
  const result = rankCommands(commands, "zoom");
  assert.equal(result[0].id, "zoom");
});

test("matches synonyms and multi-term queries", () => {
  assert.deepEqual(rankCommands(commands, "center canvas").map(({ id }) => id), ["fit"]);
});

test("matches keyboard shortcuts", () => {
  assert.deepEqual(rankCommands(commands, "ctrl s").map(({ id }) => id), ["save"]);
});

test("supports typo-tolerant subsequence matching", () => {
  assert.ok(rankCommands(commands, "zmin").some(({ id }) => id === "zoom"));
});

test("returns the original command order for an empty query", () => {
  assert.deepEqual(rankCommands(commands, "").map(({ id }) => id), ["fit", "zoom", "save"]);
});
