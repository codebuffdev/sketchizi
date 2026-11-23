import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(path.join(here, "..", name), "utf8");

test("native drawing and contextual docks remain visible for every selection in System Design mode", () => {
  const studio = read("SystemDesignStudio.jsx");
  const css = read("systemDesign.css");
  assert.match(studio, /isSystemDesignEdge\(selectedElement\)/);
  assert.doesNotMatch(studio, /sd-has-system-selection|CollapsibleQuickDock/);
  assert.doesNotMatch(css, /sketchizi-tool-options-dock|display:\s*none\s*!important/);
  assert.doesNotMatch(css, /\.sd-dock|\.sd-more-menu/);
});

test("standard canvas arrows are not mistaken for System Design orthogonal connectors", () => {
  const studio = read("SystemDesignStudio.jsx");
  assert.match(studio, /import \{ readGraph, isSystemDesignEdge \} from "\.\/sceneModel\.js"/);
  assert.match(studio, /edge && isSystemDesignEdge\(selectedElement\)/);
});

test("node contextual pill exposes label, replica stepper, health, YAML and delete", () => {
  const drawer = read("ContextualInspectorDrawer.jsx");
  for (const text of ["aria-label=\"Label\"", "aria-label=\"Replicas\"", "Decrease replicas", "Increase replicas", "Health override", "YAML", "aria-label=\"Delete\""]) {
    assert.ok(drawer.includes(text), `missing node contextual control: ${text}`);
  }
});

test("edge contextual pill exposes protocol, solid/dashed style and delete", () => {
  const drawer = read("ContextualInspectorDrawer.jsx");
  assert.match(drawer, /className="sd-edge-protocol" aria-label="Protocol"/);
  assert.match(drawer, /PROTOCOLS\.map/);
  assert.match(drawer, /aria-label="Line style"/);
  assert.match(drawer, /\["solid", "dashed"\]/);
  assert.match(drawer, /aria-label="Delete"/);
});

test("inspector can be opened without a selection and from the top bar", () => {
  const drawer = read("ContextualInspectorDrawer.jsx");
  const studio = read("SystemDesignStudio.jsx");
  const top = read("TopWorkspaceBar.jsx");
  assert.match(drawer, /!selection \?/);
  assert.match(drawer, /System Design Inspector/);
  assert.match(studio, /inspectorOpen/);
  assert.match(top, /Inspector/);
  assert.match(top, /onToggleInspector/);
});
