import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "src/components/app/SketchiziCanvas.jsx"), "utf8");

test("Sketchizi starts in the standard workspace instead of Zen Mode", () => {
  // Initial data is frozen once per editor instance in a useState initializer
  // and handed to Excalidraw as a stable object.
  const initialDataStart = source.indexOf("const [excalidrawInitialData] = useState(() => ({");
  const initialDataEnd = source.indexOf("return (", initialDataStart);
  assert.ok(initialDataStart >= 0 && initialDataEnd > initialDataStart, "Excalidraw initial data should be present");
  assert.match(source, /initialData=\{excalidrawInitialData\}/);
  const initialData = source.slice(initialDataStart, initialDataEnd);
  assert.match(initialData, /zenModeEnabled:\s*false/);
  assert.doesNotMatch(initialData, /zenModeEnabled:\s*true/);
  assert.match(initialData, /\.\.\.\(savedSketch\?\.appState \|\| \{\}\)[\s\S]*zenModeEnabled:\s*false/, "startup default must override old saved Zen Mode state");
});

test("contextual tool options dock remains available when Zen Mode is explicitly enabled", async () => {
  // The contextual dock is mounted whenever the HUD is not suppressed; Zen Mode
  // must never be a condition for mounting it.
  assert.match(source, /\{!hudSuppressed && <ToolOptionsDock /);
  assert.doesNotMatch(source, /zenModeEnabled[^\n]*&&[^\n]*<ToolOptionsDock/);
  const dock = await readFile(resolve(root, "src/components/app/ToolOptionsDock.jsx"), "utf8");
  // In Zen Mode, Escape only returns to the primary dock when it is expanded.
  assert.match(dock, /document\.querySelector\("\.app\.is-zen-mode"\) && !document\.querySelector\("\.sketchizi-tool-sidebar\.is-expanded"\)/);
});
