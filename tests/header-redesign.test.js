import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("header uses an accessible hamburger application-menu trigger and preserves the library shortcut", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /className=\{nativeMenuOpen \?/);
  assert.match(header, /desktop-app-menu-trigger active/);
  assert.match(header, /Open application menu/);
  assert.match(header, /toggleNativeMenu\?\.\(/);
  assert.match(header, /aria-expanded=\{nativeMenuOpen\}/);
  assert.doesNotMatch(header, /desktop-app-brand-mark/);
  assert.doesNotMatch(header, /src="\/sketchizi-logo\.svg"/);
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

test("desktop hamburger reuses native menu and suppresses duplicate trigger only on wide layouts", async () => {
  const css = await read("../src/styles/responsive-desktop.css");
  assert.match(css, /@media \(min-width: 761px\)[\s\S]*?\.App-menu_top \.dropdown-menu-button \{[\s\S]*?visibility: hidden !important/);
  assert.match(css, /pointer-events: none !important/);
  const app = await read("../src/App.jsx");
  assert.match(app, /nativeMenuOpen=\{nativeMenuOpen\}/);
});

test("hamburger trigger toggles Excalidraw menu state directly and can close an open menu", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /toggleNativeMenu\?\.\(/);
  assert.match(header, /menuWasOpenOnPointerDownRef\.current/);
  assert.match(header, /window\.addEventListener\("pointerdown", captureMenuState, true\)/);
  assert.doesNotMatch(header, /nativeMenuButton\?\.click\(\)/);
  const app = await read("../src/App.jsx");
  assert.match(app, /const toggleNativeMenu = useCallback/);
  assert.match(app, /openMenu: shouldOpen \? "canvas" : null/);
});


test("header layout responds to measured available width rather than viewport breakpoints", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  const css = await read("../src/styles/header-redesign.css");
  assert.match(header, /new ResizeObserver/);
  assert.match(header, /header\?\.parentElement/);
  assert.match(header, /container\.getBoundingClientRect\(\)\.width/);
  assert.match(header, /observer\.observe\(container\)/);
  assert.match(header, /availableWidth < 1120 \? " is-compact"/);
  assert.match(header, /availableWidth < 900 \? " is-constrained"/);
  assert.match(css, /\.desktop-app-header\.is-compact/);
  assert.match(css, /\.desktop-app-header\.is-constrained/);
  assert.match(css, /grid-template-areas:[\s\S]*?"menu library document account save collab search"[\s\S]*?"features features features features features features features"/);
  assert.doesNotMatch(css, /@media screen and \(min-width: 761px\) and \(max-width: 1024px\)/);
  const widthDrivenStyles = css.slice(css.indexOf("/* Width-driven responsive header states"));
  assert.doesNotMatch(widthDrivenStyles, /content: "More Tools"/);
});


test("narrow desktop uses the flex shell while preserving the base desktop grid", async () => {
  const css = await read("../src/styles/responsive-desktop.css");
  const finalShell = await read("../src/styles/responsive-final.css");
  assert.match(css, /@media \(min-width: 761px\) \{[\s\S]*?\.desktop-workspace \{[\s\S]*?display: grid/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.desktop-app-header \{[\s\S]*?display: contents/);
  assert.match(finalShell, /@media \(min-width: 521px\) and \(max-width: 1024px\)/);
  assert.match(finalShell, /\.app \{[\s\S]*?display: flex/);
  assert.match(finalShell, /\.desktop-workspace \{[\s\S]*?display: block/);
  assert.doesNotMatch(css, /--sketchizi-desktop-resources-width: 220px/);
  assert.doesNotMatch(css, /--sketchizi-desktop-context-width: 280px/);
});


test("constrained header keeps fixed actions visible when the document title must shrink", async () => {
  const css = await read("../src/styles/header-redesign.css");
  const responsive = css.slice(css.indexOf("/* Width-driven responsive header states."));
  assert.match(responsive, /\.app \.desktop-app-header\.is-constrained\s*\{/);
  assert.match(responsive, /grid-template-columns:\s*30px 30px minmax\(0, 1fr\) auto 30px 34px 32px/);
  assert.match(responsive, /\.app \.desktop-app-header\.is-constrained > \.desktop-app-header-panel-actions/);
  assert.match(responsive, /\.app \.desktop-app-header\.is-constrained \.desktop-app-document-identity-name[\s\S]*?text-overflow:\s*ellipsis/);
});


test("header width measurement is clamped to visible viewport in split-window layouts", async () => {
  const header = await read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /Math\.min\(containerWidth, viewportWidth\)/);
  assert.match(header, /document\.documentElement\.clientWidth \|\| window\.innerWidth/);
  assert.match(header, /window\.addEventListener\("resize", updateWidth\)/);
});


test("desktop header uses a frameless transparent surface", async () => {
  const css = await read("../src/styles/header-redesign.css");
  const frameless = css.slice(css.indexOf("/* Frameless header treatment"));
  assert.match(frameless, /\.app \.desktop-app-header\s*\{[\s\S]*?background: transparent !important/);
  assert.match(frameless, /box-shadow: none !important/);
  assert.match(frameless, /@media \(min-width: 1025px\)/);
});


test("desktop header action controls render without boxed backgrounds", async () => {
  const css = await read("../src/styles/header-redesign.css");
  const frameless = css.slice(css.lastIndexOf("/* Frameless header controls"));
  assert.match(frameless, /\.desktop-app-header-panel-actions button[\s\S]*?background: transparent !important/);
  assert.match(frameless, /\.desktop-app-header-panel-actions,[\s\S]*?background: transparent !important/);
  assert.match(frameless, /\.desktop-app-nav-button:hover/);
});
