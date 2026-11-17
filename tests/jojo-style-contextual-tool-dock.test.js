import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canvas = await readFile(new URL("../src/components/app/SketchiziCanvas.jsx", import.meta.url), "utf8");
const dock = await readFile(new URL("../src/components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/ui-modernization-toolbar-dock.css", import.meta.url), "utf8");

test("Sketchizi mounts its own contextual tool options dock in the canvas", () => {
  assert.match(canvas, /<ToolOptionsDock apiRef=\{apiRef\} selectedElements=\{selectedElements\}/);
  assert.doesNotMatch(canvas, /<ContextualFormattingToolbar/);
});

test("the bottom dock exposes compact tool-specific controls, not a properties inspector", () => {
  assert.match(dock, /sketchizi-tool-options-dock/);
  assert.match(dock, /function ContextShapeIcon/);
  assert.match(dock, /<ContextShapeIcon type=\{type\}/);
  assert.doesNotMatch(dock, /<span className="sk-tool-dock-context">\{title\}<\/span>/);
  assert.match(dock, /Stroke color/);
  assert.match(dock, /Fill style/);
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
  assert.match(dock, /sk-tool-stroke-width-icon/);
  assert.match(dock, /strokeWidth=\{width === 1 \? 1\.5 : width === 2 \? 2\.5 : width === 4 \? 4 : 5\.5\}/);
  assert.doesNotMatch(dock, /onClick=\{\(\) => update\(\{ strokeWidth: width \}\)\}>\{width\}<\/ToolButton>/);
  assert.match(dock, /title=\{\`Stroke width \$\{width\}\`\}/);
});


test("the primary dock defaults to a vertical left-edge position on desktop", () => {
  assert.match(canvas, /toolbar\.dataset\.sketchiziOrientation = "vertical"/);
  assert.match(canvas, /toolbar\.dataset\.sketchiziDockSide = "left"/);
  assert.match(canvas, /container\.style\.setProperty\("left", "8px", "important"\)/);
  assert.match(canvas, /container\.style\.setProperty\("top", "50%", "important"\)/);
  assert.match(canvas, /container\.dataset\.sketchiziDockPositioned = "true"/);
});


test("font family changes target the text element currently being edited", () => {
  assert.match(dock, /const editingTextElement = appState\.editingTextElement\?\.type === "text"/);
  assert.match(dock, /const isSelection = selected\.length > 0 \|\| Boolean\(isText && editingTextElement\?\.id\)/);
  assert.match(dock, /if \(isText && editingTextElement\?\.id\) ids\.add\(editingTextElement\.id\)/);
  assert.match(dock, /const first = selected\[0\] \|\| editingTextElement/);
});

test("font family picker exposes the supported Excalidraw font families", () => {
  assert.match(dock, /\[\[1, "Virgil"\], \[2, "Helvetica"\], \[3, "Cascadia"\], \[5, "Excalifont"\], \[6, "Nunito"\], \[7, "Lilita One"\], \[8, "Comic Shanns"\], \[9, "Liberation Sans"\]\]/);
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


test("the Primary Dock hides the redundant three-dot overflow control and keeps Eraser beside Bucket Fill", () => {
  assert.match(canvas, /sketchiziHideOverflowTools/);
  assert.match(canvas, /querySelectorAll\(":scope > \.dropdown-menu-button"\)/);
  assert.match(css, /\.App-toolbar > \.dropdown-menu-button[\s\S]*?display: none !important/);\n  assert.match(css, /data-sketchizi-hide-overflow-tools="true"[\s\S]*?display: none !important/);
  assert.match(css, /quick-tools[\s\S]*?flex: 0 0 34px !important;[\s\S]*?height: 34px !important/);
});
