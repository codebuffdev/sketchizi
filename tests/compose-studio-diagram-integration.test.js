import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Compose Studio tab navigation and diagram generator coexist", async () => {
  const [studio, styles, app, planner] = await Promise.all([
    read("src/features/docker-compose/ui/DockerComposeStudio.jsx"),
    read("src/features/docker-compose/ui/docker-compose-studio.css"),
    read("src/App.jsx"),
    read("src/features/docker-compose/composeDiagramLayout.js")
  ]);
  for (const tab of ["services", "dependencies", "validation", "conversion"]) {
    assert.ok(studio.includes('workspaceTab === "' + tab + '"'), tab + " view must be present");
  }
  assert.match(studio, /onCreateDiagram/);
  assert.match(studio, /studio-workspace-tabs/);
  assert.match(styles, /studio-tab-validation/);
  assert.match(app, /planComposeDiagram\(composeDocument\)/);
  assert.match(app, /resource\.members\.forEach/);
  assert.match(planner, /resourcePositions/);
});
