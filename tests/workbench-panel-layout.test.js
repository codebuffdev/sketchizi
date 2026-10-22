import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/workbench.css", import.meta.url), "utf8");

test("Workbench has one shared scroll region with fixed header and footer", () => {
  assert.equal((panelSource.match(/className=\"workbench-panel-scroll\"/g) || []).length, 2, "welcome and active-model branches each need one scroll wrapper");
  assert.match(panelSource, /<header className=\"workbench-panel-header\">[\s\S]*?<div className=\"workbench-panel-scroll\">/);
  assert.match(panelSource, /<div className=\"workbench-panel-scroll\">[\s\S]*?<footer className=\"workbench-panel-footer\">/);
  assert.match(styles, /\.workbench-panel-scroll\s*\{[^}]*overflow-y:\s*auto/);
});

test("Workbench content sections do not create nested scroll areas or viewport height caps", () => {
  const selectors = [".workbench-components-section", ".workbench-inspector", ".workbench-findings", ".sim-experiment-panel"];
  for (const selector of selectors) {
    const rules = [...styles.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g"))];
    assert.ok(rules.length, `missing CSS rule for ${selector}`);
    for (const rule of rules) {
      assert.doesNotMatch(rule[1], /overflow-y:\s*auto|overflow:\s*auto|max-height:\s*\d/, `${selector} must not create an inner scrollbar or constrained viewport height`);
    }
  }
});


test("simulation panel gives explicit guidance when typed request links are missing", async () => {
  const simulationPanel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  const guidanceHelper = await readFile(new URL("../src/features/simulation/experiments/typedRequestGuidance.js", import.meta.url), "utf8");
  assert.match(simulationPanel, /Connect the typed request path/);
  assert.match(simulationPanel, /arrows already drawn on the canvas are visual only unless they are linked to a Workbench relationship/);
  assert.match(guidanceHelper, /client-calls-service/);
  assert.match(guidanceHelper, /service-accesses-database/);
  assert.match(guidanceHelper, /relationKind: "calls"/);
  assert.match(simulationPanel, /Create \{link\.relationLabel === "Calls"/);
  assert.match(simulationPanel, /typedCallMissing/);
  assert.match(simulationPanel, /Warnings and context — not blockers/);
  assert.match(styles, /\.sim-typed-request-guidance\s*\{/);
});

test("Workbench task tabs separate build, run, add, and inspect so all tools are not stacked in one scroll", () => {
  assert.match(panelSource, /aria-label="Workbench workflow"/);
  assert.match(panelSource, /Validate<\/button>/);
  assert.match(panelSource, /Explore<\/button>/);
  for (const tab of ["build", "run", "components", "inspect"]) assert.match(panelSource, new RegExp(`activePanelTab === "${tab}"`));
  assert.match(panelSource, /<div hidden=\{activePanelTab !== "build"\} className="workbench-task-pane" role="tabpanel" aria-label="Design, review and artifacts"/);
  assert.match(panelSource, /<div hidden=\{activePanelTab !== "run"\} className="workbench-task-pane" role="tabpanel" aria-label="Simulation and exploration"/);
  assert.match(panelSource, /<div hidden=\{activePanelTab !== "components"\} className="workbench-task-pane" role="tabpanel" aria-label="Add components"/);
  assert.match(panelSource, /<div hidden=\{activePanelTab !== "inspect"\} className="workbench-task-pane" role="tabpanel" aria-label="Inspect component"/);
  assert.doesNotMatch(panelSource, /activePanelTab === "run" && <div className="workbench-task-pane"/, "the Run pane should stay mounted so experiment results survive tab changes");
});

test("Workbench model review and generated source preview use progressive disclosure", () => {
  assert.match(panelSource, /className="workbench-disclosure-trigger" aria-expanded=\{reviewExpanded\}/);
  assert.match(panelSource, /artifactPreviewExpanded \? "Hide preview" : "View preview"/);
  assert.match(panelSource, /artifactPreviewExpanded && <pre className="workbench-artifact-preview">/);
  assert.match(styles, /\.workbench-artifact-preview\s*\{\s*max-height:\s*none;\s*overflow:\s*visible;[^}]*white-space:\s*pre-wrap/);
});

test("simulation comparisons and secondary diagnostic copy are collapsed until requested", async () => {
  const simulationPanel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(simulationPanel, /<details className="sim-suite-overview">/);
  assert.doesNotMatch(simulationPanel, /<details className="sim-suite-overview" open/);
  assert.match(simulationPanel, /<details className="sim-scope-explainer">/);
  assert.match(simulationPanel, /showAllExplanations \? explanations\.length : 2/);
  assert.match(styles, /\.sim-show-more-explanations/);
});

test("component catalog is searchable and category groups collapse to reduce vertical clutter", () => {
  assert.match(panelSource, /aria-label="Search components"/);
  assert.match(panelSource, /componentSearch/);
  assert.match(panelSource, /className="workbench-component-group-trigger" aria-expanded=\{expanded\}/);
  assert.match(panelSource, /No components found/);
  assert.match(styles, /\.workbench-component-search\s*\{/);
  assert.match(styles, /\.workbench-component-group-trigger\s*\{/);
});

test("empty inspector offers clear next actions instead of a plain help sentence", () => {
  assert.match(panelSource, /className="workbench-inspector-empty"/);
  assert.match(panelSource, /No component selected/);
  assert.match(panelSource, /Browse components/);
  assert.match(panelSource, /Go to System view/);
  assert.match(styles, /\.workbench-inspector-empty\s*\{/);
});

test("simulation explains when the active view lacks a React traffic source and offers navigation", async () => {
  const simulationPanel = await readFile(new URL("../src/features/simulation/experiments/SimulationExperimentPanel.jsx", import.meta.url), "utf8");
  assert.match(panelSource, /activeViewId=\{activeViewId\}/);
  assert.match(panelSource, /onSwitchView=\{onSwitchView\}/);
  assert.match(simulationPanel, /No React traffic source in this view/);
  assert.match(simulationPanel, /Switch to System view/);
  assert.match(simulationPanel, /disabled=\{!canEdit \|\| missingTrafficSource/);
  assert.match(simulationPanel, /if \(missingTrafficSource\) \{ setRunError/);
  assert.match(styles, /\.sim-view-scope-notice\s*\{/);
});


test("empty Workbench model offers a persistent HLD/LLD starting action outside the Build tab", () => {
  assert.match(panelSource, /aria-label="Start an HLD and LLD design"/);
  assert.match(panelSource, /No architecture model yet/);
  assert.match(panelSource, /Create starter architecture/);
  assert.match(panelSource, /Or build from components/);
  assert.match(panelSource, /activePanelTab !== "build"/);
  assert.match(styles, /\.workbench-empty-design\s*\{/);
});


test("HLD and LLD have separate component catalogs while retaining the shared semantic model", async () => {
  const registry = await readFile(new URL("../src/features/workbench/workbenchRegistry.js", import.meta.url), "utf8");
  assert.match(panelSource, /activeViewId === "lld"/);
  assert.match(panelSource, /component\.designLevel === "lld"/);
  assert.match(panelSource, /component\.designLevel !== "lld"/);
  assert.match(registry, /Low-level design/);
  assert.match(registry, /Classes, interfaces, repositories and domain models/);
  assert.match(panelSource, /workbench-level-hint/);
  assert.match(styles, /\.workbench-level-hint/);
});

test("design perspective navigation is shown only in Design; other tasks use a compact current-context summary", () => {
  assert.match(panelSource, /activePanelTab === "build" \? <div className="workbench-section workbench-perspectives-section">/);
  assert.match(panelSource, /className="workbench-current-context" aria-live="polite"/);
  assert.match(panelSource, /Change design view/);
  assert.match(styles, /\.workbench-current-context\s*\{/);
  assert.match(styles, /\.workbench-current-context \.workbench-secondary/);
});

test("Design perspective exposes a searchable HLD/LLD semantic model navigator", () => {
  assert.match(panelSource, /aria-label="Engineering model navigator"/);
  assert.match(panelSource, /aria-label="Search model components"/);
  assert.match(panelSource, /HIGH-LEVEL DESIGN/);
  assert.match(panelSource, /LOW-LEVEL DESIGN/);
  assert.match(panelSource, /workbench\.relations\.filter\(\(relation\) => relation\.sourceId === entity\.id \|\| relation\.targetId === entity\.id\)/);
  assert.match(panelSource, /onFocusFinding\?\.\(\{ entityIds: \[entity\.id\] \}\); changePanelTab\("inspect"\)/);
  assert.match(styles, /\.workbench-model-navigator\s*\{/);
  assert.match(styles, /\.workbench-model-entity:focus-visible/);
});

test("canvas-first shell exposes workspace breadcrumbs and direct design-view navigation", () => {
  assert.match(panelSource, /className="workbench-workspace-path"/);
  assert.match(panelSource, /aria-label="Current workspace location"/);
  assert.match(panelSource, /className="workbench-quick-views" aria-label="Design workspaces"/);
  assert.match(panelSource, /onSwitchView\(view\.id\)/);
  assert.match(styles, /\.workbench-workspace-path\s*\{/);
  assert.match(styles, /\.workbench-quick-views\s*\{/);
});

test("expandable Results dock summarizes model validation and distinguishes synthetic simulation", () => {
  assert.match(panelSource, /className=\{`workbench-results-dock/);
  assert.match(panelSource, /aria-label="Engineering results"/);
  assert.match(panelSource, /aria-expanded=\{resultsExpanded\}/);
  assert.match(panelSource, /Open validation results/);
  assert.match(panelSource, /Simulation results are synthetic unless explicitly connected to a real runtime or database/);
  assert.match(styles, /\.workbench-results-dock\s*\{/);
  assert.match(styles, /\.workbench-results-content\s*\{/);
});

test("Workbench layout preferences persist separately from the engineering model", () => {
  assert.match(panelSource, /WORKBENCH_LAYOUT_PREFERENCES_KEY = "sketchizi\.workbench\.layout\.v1"/);
  assert.match(panelSource, /readWorkbenchLayoutPreferences\(\)\.workspaceWidth/);
  assert.match(panelSource, /readWorkbenchLayoutPreferences\(\)\.resultsExpanded/);
  assert.match(panelSource, /writeWorkbenchLayoutPreferences\(\{ workspaceWidth, resultsExpanded, panelCollapsed, modelNavigatorCollapsed, dockSide, lldParentId \}\)/);
  assert.match(panelSource, /localStorage\?\.setItem\(WORKBENCH_LAYOUT_PREFERENCES_KEY/);
  assert.match(panelSource, /Layout preferences are optional; storage failures must not block design work/);
});


test("Workbench can collapse to a compact canvas-reclaiming rail and persist that preference", () => {
  assert.match(panelSource, /panelCollapsed: value\?\.panelCollapsed === true/);
  assert.match(panelSource, /writeWorkbenchLayoutPreferences\(\{ workspaceWidth, resultsExpanded, panelCollapsed, modelNavigatorCollapsed, dockSide, lldParentId \}\)/);
  assert.match(panelSource, /aria-label=\{panelCollapsed \? "Expand Workbench panel" : "Collapse Workbench panel"\}/);
  assert.match(panelSource, /workbench-panel-collapsed/);
  assert.match(styles, /\.workbench-panel-collapsed > :not\(\.workbench-panel-header\) \{ display: none !important; \}/);
  assert.match(styles, /\.workbench-panel-collapsed \.workbench-width-toggle/);
});


test("model navigator can collapse independently and its preference persists", () => {
  assert.match(panelSource, /modelNavigatorCollapsed: value\?\.modelNavigatorCollapsed === true/);
  assert.match(panelSource, /aria-expanded=\{!modelNavigatorCollapsed\}/);
  assert.match(panelSource, /setModelNavigatorCollapsed\(\(value\) => !value\)/);
  assert.match(panelSource, /workbench-model-navigator-collapsed/);
  assert.match(styles, /\.workbench-model-navigator-toggle/);
});


test("Workbench dock side can switch left/right and persists as a layout preference", () => {
  assert.match(panelSource, /dockSide: value\?\.dockSide === "right" \? "right" : "left"/);
  assert.match(panelSource, /setDockSide\(\(side\) => side === "left" \? "right" : "left"\)/);
  assert.match(panelSource, /workbench-panel-dock-\$\{dockSide\}/);
  assert.match(panelSource, /writeWorkbenchLayoutPreferences\(\{ workspaceWidth, resultsExpanded, panelCollapsed, modelNavigatorCollapsed, dockSide, lldParentId \}\)/);
  assert.match(panelSource, /Move Workbench to right side/);
  assert.match(styles, /\.workbench-panel-dock-right \{ left: auto; right: 10px; \}/);
  assert.match(styles, /\.workbench-panel-collapsed \.workbench-dock-toggle \{ display: none; \}/);
});

test("wide desktop Workbench uses a dedicated grid lane instead of covering the canvas", () => {
  assert.match(styles, /desktop-workspace-workbench-open\s*>\s*\.workbench-panel\s*\{[^}]*position:\s*relative/s);
  assert.match(styles, /grid-template-areas:\s*"resources canvas workbench context"/);
  assert.match(styles, /grid-template-areas:\s*"resources canvas workbench"/);
  assert.match(styles, /@media\s*\(min-width:\s*761px\) and \(max-width:\s*1100px\)/);
});


test("design workspace navigation has a single primary control instead of a duplicated perspectives list", () => {
  assert.match(panelSource, /aria-label="Design workspaces"/);
  assert.doesNotMatch(panelSource, /DESIGN PERSPECTIVES/);
  assert.doesNotMatch(panelSource, /aria-label="Workbench views"/);
  assert.match(panelSource, /workbench-view-context/);
});

test("desktop left/right docking changes grid flow instead of only changing overlay offsets", () => {
  assert.match(styles, /:has\(> \.workbench-panel-dock-left\)[\s\S]*grid-template-areas:\s*"resources workbench canvas context"/);
  assert.match(styles, /:has\(> \.workbench-panel-dock-left\)[\s\S]*grid-template-areas:\s*"resources workbench canvas"/);
  assert.match(styles, /:has\(> \.workbench-panel-dock-left\) > \.workbench-panel\s*\{[^}]*border-right:?/s);
});

test("narrow desktop uses a split view instead of an overlay when Workbench is open", () => {
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1100px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(280px, 36%\)/);
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1100px\)[\s\S]*?\.desktop-workspace\.desktop-workspace-workbench-open > \.workbench-panel\s*\{[^}]*position:\s*relative/s);
  assert.match(styles, /\.desktop-workspace\.desktop-workspace-workbench-open:has\(> \.workbench-panel-dock-left\) \.desktop-canvas-region\s*\{\s*grid-column:\s*2/s);
});

test("desktop workspace grid lets the canvas absorb width changes without fixed minimum overflow", () => {
  assert.match(styles, /grid-template-columns:\s*minmax\(150px, 18vw\)\s+minmax\(0, 1fr\)\s+minmax\(260px, 25vw\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(260px, 25vw\)/);
  assert.match(styles, /desktop-workspace\.desktop-workspace-workbench-open \.desktop-canvas-region\s*\{\s*min-width:\s*0;\s*overflow:\s*hidden;/);
});

test("narrow desktop exposes explicit Palette, Canvas, Engineering and Inspector views", async () => {
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /aria-label="Workspace panels"/);
  for (const label of ["Palette", "Canvas", "Engineering", "Inspector"]) assert.ok(appSource.includes(`"${label}"`), `missing ${label} workspace view`);
  assert.match(appSource, /narrowWorkspaceView === id/);
  assert.match(styles, /\.desktop-workspace-workbench-open\.narrow-workspace-view-palette > \.desktop-resources-region/);
  assert.match(styles, /\.desktop-workspace-workbench-open\.narrow-workspace-view-canvas > \.desktop-canvas-region/);
  assert.match(styles, /\.desktop-workspace-workbench-open\.narrow-workspace-view-workbench > \.workbench-panel/);
  assert.match(styles, /\.desktop-workspace-workbench-open\.narrow-workspace-view-inspector > \.desktop-context-region/);
});


test("HLD-to-LLD drill-down selection persists independently from the engineering model", () => {
  assert.match(panelSource, /lldParentId: typeof value\?\.lldParentId === "string" \? value\.lldParentId : ""/);
  assert.match(panelSource, /useState\(\(\) => readWorkbenchLayoutPreferences\(\)\.lldParentId\)/);
  assert.match(panelSource, /writeWorkbenchLayoutPreferences\(\{ workspaceWidth, resultsExpanded, panelCollapsed, modelNavigatorCollapsed, dockSide, lldParentId \}\)/);
  assert.match(panelSource, /\[workspaceWidth, resultsExpanded, panelCollapsed, modelNavigatorCollapsed, dockSide, lldParentId\]/);
  assert.match(panelSource, /setLldParentId\(entity\.id\); onSwitchView\("lld"\)/);
});


test("quick-add creates a component and immediately opens its contextual properties", () => {
  assert.match(panelSource, /onAddComponent\?\.\(item\.kind\); changePanelTab\("inspect"\)/);
  assert.match(panelSource, /aria-label={`Add \$\{item\.label\} and open properties`}/);
  assert.match(panelSource, /aria-label="Component inspector"/);
});
