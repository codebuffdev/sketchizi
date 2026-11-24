import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canvas = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dock = await readFile(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");
import { readFileSync as readFileSyncLocalImpl } from "node:fs";
const readFileSyncLocal = (rel) => readFileSyncLocalImpl(new URL(rel, import.meta.url), "utf8");
const primary = await readFile(new URL("../src/components/app/PrimaryDock.jsx", import.meta.url), "utf8");
const dockPositionCss = await readFile(new URL("../src/styles/canvas-top-controls.css", import.meta.url), "utf8");

test("Sketchizi mounts its own contextual tool options dock in the canvas", () => {
  assert.match(canvas, /<ToolOptionsDock apiRef=\{apiRef\} selectedElements=\{selectedElements\}/);
  assert.doesNotMatch(canvas, /<ContextualFormattingToolbar/);
});

test("the bottom dock exposes compact tool-specific controls, not a properties inspector", () => {
  assert.match(dock, /sketchizi-tool-options-dock/);
  assert.doesNotMatch(dock, /function ContextShapeIcon|<ContextShapeIcon/);
  assert.doesNotMatch(dock, /sk-tool-dock-context/);
  assert.match(dock, /<DockGroup label=\{isText \? "Text color" : isShape \|\| isHighlighter \? "Color & fill" : "Stroke color"\}>/);
  assert.doesNotMatch(dock, /<span className="sk-tool-dock-context">\{title\}<\/span>/);
  assert.match(dock, /Stroke color/);
  assert.match(dock, /isShape \|\| isHighlighter \? "Color & fill"/);
  assert.match(dock, /Arrowheads/);
  assert.doesNotMatch(dock, /PropertiesPanel|properties-panel/);
});

test("Excalidraw's native selection properties panel is suppressed", () => {
  assert.match(css, /\.app \.excalidraw \.App-menu__left[\s\S]*?display: none !important/);
});
test("Escape returns from contextual options to the primary selection dock", () => {
  assert.match(dock, /handleEscapeToPrimaryDock/);
  assert.match(dock, /event\.key !== "Escape"/);
  assert.match(dock, /activeTool: \{ type: "selection" \}/);
  assert.match(dock, /selectedElementIds: \{\}/);
  assert.match(dock, /setCustomTool\(null\)/);
});

test("both docks use a neutral theme-aware visual system with visible keyboard focus", () => {
  assert.match(css, /Contextual dock polish/);
  assert.match(css, /\.app\.theme-light \.sketchizi-tool-options-dock/);
  assert.match(css, /\.sk-tool-option-button:focus-visible/);
  assert.match(css, /Unify primary dock with neutral graphite styling|primary tool dock visually aligned/);
  assert.match(css, /#626b76/);
  assert.match(css, /#c0c7cf/);
});


test("stroke width choices use visual line-weight icons instead of numeric labels", () => {
  assert.match(dock, /sk-tool-choice-value/);
  assert.match(dock, /String\(label\)\.toLowerCase\(\)\.includes\("width"\)/);
  assert.match(dock, /<DockSelect label=\{isDraw \? "Stroke width \/ thinning preset" : "Stroke width"\}/);
  assert.match(dock, /<span className="sk-tool-choice-value">\{selected.value\}px<\/span>/);
});


test("the primary dock is a React-owned left-edge dock anchored bottom-left on desktop", () => {
  assert.match(canvas, /\{!hudSuppressed && <PrimaryDock/);
  assert.match(primary, /aria-label="Drawing tools"/);
  assert.match(dockPositionCss, /\.sketchizi-tool-sidebar\.sketchizi-tool-sidebar \{[\s\S]*?left: calc\(12px \+ var\(--safe-left, 0px\)\);[\s\S]*?bottom: calc\(12px \+ var\(--safe-bottom, 0px\)\)/);
  assert.doesNotMatch(canvas, /sketchiziDockPositioned|sketchiziOrientation/);
});


test("font family changes target the text element currently being edited", () => {
  assert.match(dock, /const editingTextElement = appState\.editingTextElement\?\.type === "text"/);
  assert.match(dock, /const isSelection = selected\.length > 0 \|\| Boolean\(isText && editingTextElement\?\.id\)/);
  assert.match(dock, /if \(isText && activeEditingText\?\.id\) ids\.add\(activeEditingText\.id\)/);
  assert.match(dock, /const first = selected\[0\] \|\| editingTextElement/);
});

test("font family picker exposes the supported Excalidraw font families", () => {
  assert.match(dock, /\[\[3, "Cascadia"\], \[4, "Kalam"\], \[5, "Excalifont"\], \[7, "Lilita One"\], \[8, "Comic Shanns"\]\]/);
  assert.match(dock, /currentItemFontFamily", 5/);
});

test("the left Primary Dock removes excess shell and group spacing without shrinking tool targets", () => {
  assert.match(css, /Primary Dock density pass/);
  assert.match(css, /width: 44px !important;[\s\S]*?padding: 3px !important/);
  assert.match(css, /\[data-sketchizi-tool-group\][\s\S]*?width: 34px !important;[\s\S]*?margin: 0 !important;[\s\S]*?padding: 0 !important/);
  assert.match(css, /\.App-toolbar\[data-sketchizi-orientation="vertical"\] \.ToolIcon__icon[\s\S]*?width: 34px !important;[\s\S]*?height: 34px !important/);
  assert.match(css, /bottom contextual dock/);
});

test("the Primary Dock has no added gap between its lock grip and Hand tool", () => {
  assert.match(css, /Remove the extra vertical gap directly between the dock lock grip and Hand tool/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\][\s\S]*?row-gap: 0 !important/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\] > \.sketchizi-dock-grip[\s\S]*?margin-bottom: 0 !important/);
});

test("all nested Primary Dock wrappers use zero gaps and zero button margins", () => {
  assert.match(css, /Compact every vertical Primary Dock layer/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\] > div:not\(\.sketchizi-dock-grip\)[\s\S]*?gap: 0 !important;[\s\S]*?margin: 0 !important;[\s\S]*?padding: 0 !important/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\] \[data-sketchizi-tool-group\][\s\S]*?margin: 0 !important/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\] \[data-sketchizi-group-start="true"\][\s\S]*?margin-top: 0 !important/);
});


test("Bucket Fill sits directly beside Eraser in the vertical Primary Dock", () => {
  assert.match(css, /Keep Bucket Fill directly adjacent to Eraser/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\] > \.sketchizi-dock-quick-tools[\s\S]*?gap: 0 !important;[\s\S]*?margin: 0 !important;[\s\S]*?padding: 0 !important/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\] > :has\(\+ \.sketchizi-dock-quick-tools\)[\s\S]*?margin-block: 0 !important;[\s\S]*?padding-block: 0 !important/);
});


test("vertical Primary Dock grip has no reserved 24px space above Hand", () => {
  assert.match(css, /remaining Lock\/Hand gap came from the grip's 24px flex-basis/);
  assert.match(css, /Island\.App-toolbar\[data-sketchizi-orientation="vertical"\] > \.sketchizi-dock-grip[\s\S]*?flex: 0 0 10px !important;[\s\S]*?height: 10px !important;[\s\S]*?margin: 0 !important/);
});


test("the Primary Dock lists its own tools (no native overflow control) and keeps Eraser beside Bucket Fill", () => {
  // The dock renders an explicit tool list, so there is no native three-dot overflow to hide.
  assert.doesNotMatch(canvas, /sketchiziHideOverflowTools/);
  const ids = [...primary.matchAll(/\{ id: "([a-z]+)", label:/g)].map((m) => m[1]);
  assert.ok(ids.indexOf("eraser") >= 0 && ids.indexOf("bucketfill") === ids.indexOf("laser") + 1);
  assert.ok(ids.indexOf("bucketfill") - ids.indexOf("eraser") <= 2, "Bucket Fill stays next to Eraser");
  assert.match(css, /\.App-toolbar > \.dropdown-menu-button[\s\S]*?display: none !important/);
});


test("Primary Dock buttons show compact shortcut hints and a label tooltip with the key", () => {
  assert.match(primary, /\{tool\.keyHint && <span className="sketchizi-tool-sidebar-key">\{tool\.keyHint\}<\/span>\}/);
  assert.match(primary, /title=\{tool\.keyHint \? `\$\{tool\.label\} \(\$\{tool\.keyHint\}\)` : tool\.label\}/);
  assert.match(primary, /Hints are only shown for shortcuts already handled by Excalidraw/);
  const keyCss = readFileSyncLocal('../src/styles/ipad-radial-tool-wheel.css');
  assert.match(keyCss, /\.sketchizi-tool-sidebar-key \{[\s\S]*?position: absolute;[\s\S]*?font-size: 8px/);
});


test("Primary Dock keeps the active tool visible and reveals the full dock on hover or keyboard focus", () => {
  assert.match(primary, /onMouseEnter=\{expandDock\}/);
  assert.match(primary, /onMouseLeave=\{scheduleCollapse\}/);
  assert.match(primary, /inert=\{!expanded\}/);
  assert.match(primary, /aria-label=\{`Active tool: \$\{activeToolMeta\.label\}\. Expand drawing tools`\}/);
  assert.match(primary, /aria-expanded=\{expanded\}/);
  assert.match(primary, /handleExpandClick/);
  assert.match(primary, /firstToolButtonRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(canvas, /sketchizi-dock-collapse-toggle|sketchizi-primary-dock-collapsed/);
  assert.match(dockPositionCss, /\.sketchizi-tool-sidebar\.sketchizi-tool-sidebar:not\(\.is-expanded\) \{[\s\S]*?width: 48px/);
});
