import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("AI Ask toggle is rendered outside the auto-hiding header rail", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const railStyles = await read("../src/styles/right-header-rail.css");
  assert.match(header, /<div className="desktop-app-global-ai-control">\{children\}<\/div>/);
  assert.match(header, /desktop-app-global-theme-control/);
  assert.match(railStyles, /desktop-app-global-ai-control/);
  assert.match(railStyles, /desktop-app-global-theme-control/);
});

test("canvas shell controls use the shared rectangular geometry", async () => {
  const styles = await read("../src/styles/right-header-rail.css");
  assert.match(styles, /Shared rectangular geometry for the canvas shell/);
  assert.match(styles, /desktop-app-global-ai-control[\s\S]*border-radius: 4px !important/);
});
