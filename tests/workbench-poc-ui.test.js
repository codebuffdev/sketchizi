import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const controller = await readFile(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
const simulationPanel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");
const template = await readFile(new URL("../src/features/workbench/workbenchPocTemplate.js", import.meta.url), "utf8");

test("Create POC action is wired from App to the Workbench controller", () => {
  assert.match(app, /onCreatePoc=\{workbenchController\.createPoc\}/);
  assert.match(panel, /onCreatePoc,/);
  assert.match(panel, /onClick=\{onCreatePoc\}/);
  assert.match(controller, /const createPoc = useCallback\(\(\) =>/);
});

test("POC flow uses a single canvas update and persists semantic extension with connector metadata", () => {
  assert.match(controller, /createReactRestPostgresPoc\(\{ workbench, idFactory: makeId \}\)/);
  assert.match(controller, /buildReactRestPostgresPocSceneDescriptors/);
  assert.match(controller, /withWorkbenchExtension\(documentMetadataRef\.current\?\.extensions, next\)/);
  assert.match(controller, /api\.updateScene\(\{\s*elements,\s*appState: selectedAppState,\s*captureUpdate: CaptureUpdateAction\.IMMEDIATELY/);
  assert.match(controller, /saveDocument\(next, \{ \.\.\.live, elements, appState: selectedAppState \}\)/);
});

test("template creation is guarded against overwriting an existing semantic model", () => {
  assert.match(panel, /workbench\.entities\.length === 0 && workbench\.relations\.length === 0/);
  assert.match(panel, /activeViewId !== "system"/);
  assert.match(template, /Existing diagrams and models will not be overwritten/);
});

test("POC UI provides component/relationship preview and navigation to configure, validate and experiment", () => {
  assert.match(panel, /Preview architecture/);
  assert.match(panel, /React application <b>Calls<\/b> REST service/);
  assert.match(panel, /GET \/api\/items/);
  assert.match(panel, /valid starting point/);
  assert.match(panel, /REST service <b>Reads from<\/b> PostgreSQL/);
  assert.match(panel, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(panel, /id="workbench-model-review"/);
  assert.match(panel, /id="workbench-inspector"/);
  assert.match(simulationPanel, /id="workbench-experiments"/);
  assert.match(styles, /\.workbench-poc-template/);
});


test("older POC templates can add starter OpenAPI and SQL models without recreating the diagram", () => {
  assert.match(app, /onCompletePocArtifacts=\{workbenchController\.completePocArtifacts\}/);
  assert.match(controller, /addMissingReactRestPostgresPocArtifacts/);
  assert.match(controller, /buildReactRestPostgresArtifactScaffoldingSceneDescriptors/);
  assert.match(panel, /Add starter API \+ table/);
  assert.match(panel, /needsPocArtifactScaffolding/);
});

test("guided debugging offers a one-variable capacity trial and records the comparison in experiment history", () => {
  assert.match(simulationPanel, /createCapacityImprovementProfile/);
  assert.match(simulationPanel, /Test a capacity improvement/);
  assert.match(simulationPanel, /chooseCapacityImprovementScenarioKey\(results\.runs, activeRunKey\)/);
  assert.match(simulationPanel, /compareSimulationRuns\(originalScenario\.result, improvedScenario\.result\)/);
  assert.match(simulationPanel, /comparisonScenarioLabel: originalScenario\.label/);
  assert.match(simulationPanel, /Test a capacity improvement/);
  assert.match(simulationPanel, /Traffic-surge scenario/);
  assert.match(simulationPanel, /<SimulationTimeSeries run=\{activeRun\}/);
  assert.match(simulationPanel, /timeSeries\?\.points/);
  assert.match(simulationPanel, /trafficMultiplier, scopeEntityIds/);
  assert.match(simulationPanel, /kind: "one-variable-improvement"/);
  assert.match(simulationPanel, /appendSimulationHistory\(simulationHistory, entry\)/);
  assert.match(simulationPanel, /canonical model and saved base profile were not modified/);
});
