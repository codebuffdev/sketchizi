import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
test("canvas plus button opens a three-mode picker with accessible keyboard navigation", () => {
 const tabs=read("../src/components/app/CanvasTabs.jsx");
 for (const value of ["aria-haspopup=\"menu\"","NEW CANVAS","Infinity","Pages","System Design","ArrowDown","ArrowUp","closeOnOutsideInteraction"]) assert.ok(tabs.includes(value), value);
 assert.match(tabs,/onCreate\?\.\(\{ type: option\.type, mode: option\.mode \}\)/);
});
test("new canvas modes persist independently and System Design starts enabled", () => {
 const hook=read("../src/hooks/useWorkspaceTabs.js");
 assert.match(hook,/const requestedMode = requestedType === "canvas" \? "infinity" : requestedType/);
 assert.match(hook,/mode: requestedMode/);\n assert.match(hook,/mode: type === "pages" \? "pages" : "infinity"/);
 assert.match(hook,/const tabType = isPagesTab \? "pages" : isSystemDesignTab \? "system-design" : "canvas"/);
 assert.match(hook,/isSystemDesignTab \? \{ active: true \} : \{\}/);
 assert.match(hook,/isPagesTab \? createDefaultPagesSnapshot\(apiRef\.current\)/);\n const systemDesign=read("../src/features/system-design/useSystemDesignWorkspace.js");\n assert.match(systemDesign,/Hydrate it from its persisted snapshot/);\n assert.match(systemDesign,/readSystemDesignTabState\(canvasTabsRef\?\.current \|\| \[\], activeCanvasId\)/);
});
test("new canvas picker uses compact tab-bar styling and sits below the plus control", () => {
 const styles=read("../src/styles/canvas-tabs.css");
 assert.match(styles,/\.canvas-tabs-create-wrap \{ position:relative/);
 assert.match(styles,/top:calc\(100% \+ 8px\); right:0; z-index:50/);
 assert.match(styles,/\.canvas-tabs-create-option:focus-visible/);
 assert.match(styles,/\.app\.theme-dark \.canvas-tabs-create-menu/);
});
