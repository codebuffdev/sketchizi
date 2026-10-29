import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "src/components/app/SketchiziCanvas.jsx"), "utf8");

test("Sketchizi starts in the standard workspace instead of Zen Mode", () => {
  const initialDataStart = source.indexOf("initialData={{");
  const initialDataEnd = source.indexOf("excalidrawAPI={registerExcalidrawAPI}", initialDataStart);
  assert.ok(initialDataStart >= 0 && initialDataEnd > initialDataStart, "Excalidraw initial data should be present");
  const initialData = source.slice(initialDataStart, initialDataEnd);
  assert.match(initialData, /zenModeEnabled:\s*false/);
  assert.doesNotMatch(initialData, /zenModeEnabled:\s*true/);
  assert.match(initialData, /\.\.\.\(savedSketch\?\.appState \|\| \{\}\)[\s\S]*zenModeEnabled:\s*false/, "startup default must override old saved Zen Mode state");
});

test("contextual formatting toolbar remains available when Zen Mode is explicitly enabled", () => {
  assert.match(source, /\(apiRef\.current\?\.getAppState\?\.\(\)\.zenModeEnabled \?\? true\) && \(/);
  assert.match(source, /<ContextualFormattingToolbar/);
});
