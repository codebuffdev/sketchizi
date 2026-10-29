import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "src/components/app/DesktopAppHeader.jsx"), "utf8");

test("theme toggle and AI Ask are grouped before the existing right-side utility controls", () => {
  const actionsStart = source.indexOf('<div className="desktop-app-header-actions">');
  const actionsEnd = source.indexOf("</div>\n    </header>", actionsStart);
  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart, "right-side header actions should exist");
  const actions = source.slice(actionsStart, actionsEnd);
  const theme = actions.indexOf('<div className="desktop-app-header-account-zone">');
  const aiAsk = actions.indexOf('<div className="desktop-app-header-panel-actions">{children}</div>');
  const tools = actions.indexOf("{moreToolsToggle}");
  const search = actions.indexOf('className="desktop-app-header-icon-button desktop-app-search-button"');
  const signIn = actions.indexOf("<AuthenticationControl />");
  assert.ok(theme >= 0 && aiAsk > theme && tools > aiAsk && search > tools && signIn > search);
});

test("theme toggle and AI Ask retain their existing callbacks and props", () => {
  assert.match(source, /<ThemeControl setThemeMode=\{setThemeMode\} isDarkTheme=\{isDarkTheme\} \/>/);
  assert.match(source, /<div className="desktop-app-header-panel-actions">\{children\}<\/div>/);
});
