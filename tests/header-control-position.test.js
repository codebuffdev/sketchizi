import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "src/components/app/DesktopAppHeader.jsx"), "utf8");

test("tools and search stay grouped in the header actions, with theme and AI Ask in their own global controls", () => {
  const actionsStart = source.indexOf('<div className="desktop-app-header-actions">');
  const actionsEnd = source.indexOf("</div>\n    </header>", actionsStart);
  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart, "right-side header actions should exist");
  const actions = source.slice(actionsStart, actionsEnd);
  const tools = actions.indexOf("{moreToolsToggle}");
  const search = actions.indexOf('className="desktop-app-header-icon-button desktop-app-search-button"');
  assert.ok(tools >= 0 && search > tools, "Tools control sits before command search");
  // Sign-in leads the header; theme and AI Ask are floating global controls after it.
  const signIn = source.indexOf("<AuthenticationControl />");
  assert.ok(signIn >= 0 && signIn < actionsStart);
  const theme = source.indexOf('<div className="desktop-app-global-theme-control">');
  const aiAsk = source.indexOf('<div className="desktop-app-global-ai-control">{children}</div>');
  assert.ok(theme > actionsEnd && aiAsk > theme);
});

test("theme toggle and AI Ask retain their existing callbacks and props", () => {
  assert.match(source, /<ThemeControl setThemeMode=\{setThemeMode\} themeMode=\{themeMode\} isDarkTheme=\{isDarkTheme\} canvasAppearance=\{canvasAppearance\} onCanvasAppearanceChange=\{onCanvasAppearanceChange\} api=\{canvasApi\} canEdit=\{canEditCanvas\} \/>/);
  assert.match(source, /<div className="desktop-app-global-ai-control">\{children\}<\/div>/);
});

test("desktop right header rail uses the same frameless shell as the canvas dock", async () => {
  const styles = await readFile(resolve(root, "src/styles/right-header-rail.css"), "utf8");
  assert.match(styles, /\.desktop-app-header-right-rail\s*>\s*\.desktop-app-header-island\s*\{/);
  assert.match(styles, /background:\s*transparent\s*!important/);
  assert.match(styles, /box-shadow:\s*none\s*!important/);
  assert.match(styles, /backdrop-filter:\s*none\s*!important/);
});


test("desktop right header rail aligns controls on one vertical axis", async () => {
  const styles = await readFile(resolve(root, "src/styles/right-header-rail.css"), "utf8");
  assert.match(styles, /desktop-app-header-right-rail\s*>\s*\.desktop-app-header-island\s*\{[\s\S]*?flex-direction:\s*column\s*!important/);
  assert.match(styles, /desktop-app-header-right-rail :is\([\s\S]*?\)\s*\{[\s\S]*?align-self:\s*center/);
  assert.match(styles, /desktop-app-header-right-rail\s+\.desktop-app-save-status-trigger[\s\S]*?width:\s*36px/);
  assert.match(styles, /desktop-app-header-right-rail\s+\.desktop-app-header-spacer\s*\{[\s\S]*?display:\s*none\s*!important/);
});


test("all desktop right-rail controls share a 36px slot and one vertical axis", async () => {
  const styles = await readFile(resolve(root, "src/styles/right-header-rail.css"), "utf8");
  const alignment = styles.slice(styles.lastIndexOf("Flatten the header's legacy horizontal groups"));
  assert.match(alignment, /desktop-app-header-right-rail\s*\{[\s\S]*?flex-direction:\s*column\s*!important/);
  assert.match(alignment, /desktop-app-header-island,[\s\S]*?desktop-app-header-actions,[\s\S]*?display:\s*contents\s*!important/);
  assert.match(alignment, /desktop-app-header-right-rail\s+:is\([\s\S]*?sketchizi-more-tools-header[\s\S]*?width:\s*36px\s*!important[\s\S]*?height:\s*36px\s*!important/);
  assert.match(alignment, /sketchizi-more-tools-trigger[\s\S]*?width:\s*36px\s*!important[\s\S]*?height:\s*36px\s*!important/);
  assert.match(alignment, /desktop-app-header-spacer\s*\{[\s\S]*?display:\s*none\s*!important/);
});
