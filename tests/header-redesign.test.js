import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("header has a compact Sketchizi brand mark and an accessible library shortcut", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /className="desktop-app-brand-mark"/);
  assert.match(header, /src="\/sketchizi-logo\.svg"/);
  assert.match(header, /\{libraryToggle\}/); // existing Icon Library shortcut is preserved
  assert.match(header, /aria-label="Search commands"/);
  assert.match(header, /Ctrl\+K/);
});

test("product feature actions are ordered AI Ask, Validation, then More Tools", async () => {
  const app = await read("../src/App.jsx");
  const start = app.indexOf("<DesktopAppHeader");
  const end = app.indexOf("</DesktopAppHeader>", start);
  const headerChildren = app.slice(start, end);
  const ai = headerChildren.indexOf("className={aiAskOpen");
  const validation = headerChildren.indexOf("className={architectureValidationOpen");
  const moreTools = headerChildren.indexOf("<MoreTools");
  assert.ok(ai >= 0 && validation > ai && moreTools > validation);
});

test("collaboration CTA remains actionable and has an icon for compact widths", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /startCollaboration\?\.\(\)/);
  assert.match(header, /desktop-app-start-collaboration-icon/);
  assert.match(header, /desktop-app-start-collaboration-label/);
});

test("account sign-out is available from an accessible profile menu", async () => {
  const auth = await read("../src/features/auth/AuthenticationControl.jsx");
  assert.match(auth, /aria-haspopup="menu"/);
  assert.match(auth, /className="auth-account-menu"/);
  assert.match(auth, /role="menuitem"/);
  assert.match(auth, /handleSignOut\(\)/);
});

test("premium-minimal header stays single-row at tablet and desktop sizes", async () => {
  const css = await read("../src/styles/header-redesign.css");
  assert.match(css, /--sketchizi-desktop-header-height:\s*54px/);
  assert.match(css, /\.desktop-app-header-panel-actions\s*\{[^}]*border-right/);
  assert.match(css, /\.desktop-app-search-shortcut/);
  assert.match(css, /@media \(min-width: 521px\) and \(max-width: 650px\)[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(css, /\.app\.theme-dark \.desktop-app-search-button/);
  const styles = await read("../src/styles.css");
  assert.match(styles, /@import "\.\/styles\/header-redesign\.css"/);
});
