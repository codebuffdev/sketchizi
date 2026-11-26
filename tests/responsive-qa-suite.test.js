import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Contract tests for the Responsive QA Automation Suite (tests/responsive).
 * They need NO browser and NO Playwright install: they guard the matrix, the
 * breakpoint evidence, the report schema and repo hygiene. The in-page
 * detector test runs only when a Chromium-capable `playwright` is resolvable.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const R = (...p) => path.join(root, "tests", "responsive", ...p);
const imp = (...p) => import(pathToFileURL(R(...p)).href);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("viewport matrix has the 14 required device viewports with correct emulation flags", async () => {
  const { FULL_VIEWPORTS } = await imp("config", "viewports.js");
  assert.deepEqual(FULL_VIEWPORTS.map((v) => `${v.width}x${v.height}`), [
    "320x568", "360x800", "375x812", "390x844", "414x896", "600x900", "768x1024", "820x1180",
    "1024x768", "1280x800", "1366x768", "1440x900", "1920x1080", "2560x1440",
  ]);
  for (const v of FULL_VIEWPORTS.filter((x) => x.width <= 820 && x.height > x.width)) assert.ok(v.isMobile && v.hasTouch, `${v.id} must be mobile+touch`);
  const land = FULL_VIEWPORTS.find((v) => v.id === "1024x768");
  assert.equal(land.hasTouch, true);
  assert.equal(land.isMobile, false);
  for (const v of FULL_VIEWPORTS.filter((x) => x.width >= 1280)) assert.ok(!v.isMobile && !v.hasTouch, `${v.id} must be plain desktop`);
});

test("smoke profile is the 4 representative viewports; full profile adds 10 boundary projects", async () => {
  const m = await imp("config", "viewports.js");
  assert.deepEqual(m.selectViewports("smoke").map((v) => v.id), ["375x812", "768x1024", "1440x900", "2560x1440"]);
  assert.equal(m.selectViewports("full").length, 14);
  assert.equal(m.selectBoundaries("smoke").length, 0);
  assert.deepEqual(m.selectBoundaries("full").map((v) => v.width), [520, 521, 760, 761, 767, 768, 1023, 1024, 1099, 1100]);
});

test("required breakpoint edges are backed by real CSS in src/", async () => {
  const { discover } = await imp("scripts", "discover-breakpoints.mjs");
  const px = new Set(discover().map((e) => e.px));
  for (const needed of [520, 521, 760, 761, 767, 1100]) assert.ok(px.has(needed), `no @media rule at ${needed}px found in src CSS`);
  assert.ok(px.has(1023.98) || px.has(1024), "no ~1024px edge found in src CSS");
});

test("every feature suite A-O exists, plus the breakpoint suite", () => {
  const expected = ["global-shell", "infinite-canvas", "tool-dock", "contextual-dock", "canvas-tabs", "icon-library", "properties-panel", "minimap", "ai-ask", "architecture-validation", "pages-workspace", "design-studio", "studios", "collaboration", "export-dialogs", "breakpoint-boundaries"];
  for (const name of expected) {
    const file = R("suites", `${name}.spec.js`);
    assert.ok(fs.existsSync(file), `${name}.spec.js missing`);
    const src = fs.readFileSync(file, "utf8");
    assert.match(src, /test\.describe\(/);
    assert.match(src, /qa\.checkpoint\(/, `${name} never runs the defect detectors`);
  }
});

test("suite selectors reference classes/labels that exist in the app source", () => {
  const sources = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.(jsx|js|css)$/.test(e.name)) sources.push(fs.readFileSync(f, "utf8")); } };
  walk(path.join(root, "src"));
  const all = sources.join("\n");
  for (const cls of ["sketchizi-tool-sidebar", "sketchizi-tool-options-dock", "canvas-tabs-bar", "canvas-tabs-overflow-menu", "library-panel", "properties-panel", "ai-ask-panel", "ai-ask-composer", "pages-book-workspace", "design-studio-screen", "sketchizi-export-modal", "startup-canvas-chooser", "k8s-studio", "docker-studio", "collaboration-chat-panel"]) {
    assert.ok(all.includes(cls), `selector class "${cls}" no longer exists in src/ - update tests/responsive/config/selectors.js`);
  }
  for (const label of ["Open Icon Library", "Toggle Minimap", "Start Collaboration", "Open Kubernetes Studio", "Open Docker Compose Studio", "Browse Design Templates"]) {
    assert.ok(all.includes(label), `command "${label}" no longer exists in src/`);
  }
});

test("report aggregation, diffable projection and regression diff", async () => {
  const { buildReport, toDiffable, diffReports, stripThumbs } = await imp("reporters", "aggregate.js");
  const vp = { id: "375x812", name: "iPhone", width: 375, height: 812, isMobile: true, hasTouch: true };
  const f = (o) => ({ viewport: "375x812", suite: "tool-dock", checkpoint: "expanded", category: "touch-target", severity: "P2", message: "Touch target is 20×20px", selector: "button", ...o });
  const recs = (extra = []) => [{ suite: "tool-dock", title: "t", viewport: vp, status: "passed", durationMs: 5, checkpoints: [{ name: "expanded", screenshot: "s.png", findingCount: 1, stats: {}, thumb: "data:x" }], findings: [f({}), ...extra] }];
  const a = buildReport(recs(), { profile: "smoke", generatedAt: "2026-01-01T00:00:00Z" });
  assert.equal(a.summary.findings, 1);
  assert.equal(a.summary.bySeverity.P2, 1);
  assert.equal(a.matrix["tool-dock"]["375x812"].worst, "P2");
  assert.equal(stripThumbs(a).results[0].checkpoints[0].thumb, undefined);
  const b = buildReport(recs([f({ severity: "P1", category: "overlap", message: "dock overlaps minimap" })]), { profile: "smoke" });
  const d = diffReports(toDiffable(a), toDiffable(b));
  assert.equal(d.added.length, 1);
  assert.equal(d.resolved.length, 0);
  // diffable output must not contain timestamps or durations
  assert.doesNotMatch(JSON.stringify(toDiffable(b)), /generatedAt|durationMs/);
});

test("HTML dashboard is self-contained and escapes embedded data", async () => {
  const { buildReport } = await imp("reporters", "aggregate.js");
  const { renderHtml } = await imp("reporters", "responsive-html-reporter.js");
  const vp = { id: "1440x900", name: "Desktop", width: 1440, height: 900 };
  const html = renderHtml(buildReport([{ suite: "s", title: "t", viewport: vp, status: "failed", durationMs: 1, error: "</script><img onerror=x>", checkpoints: [], findings: [{ viewport: "1440x900", suite: "s", checkpoint: "c", category: "overlap", severity: "P1", message: "</script><script>alert(1)</script>", selector: null }] }]));
  assert.ok(!/<script[^>]+src=/i.test(html), "dashboard must not load external scripts");
  assert.ok(!/<link[^>]+href=/i.test(html), "dashboard must not load external stylesheets");
  assert.equal((html.match(/<\/script>/g) || []).length, 2, "embedded JSON must not terminate the script element early");
});

test("npm scripts and git hygiene", () => {
  assert.match(pkg.scripts["test:responsive:smoke"], /run-responsive\.mjs smoke/);
  assert.match(pkg.scripts["test:responsive:full"], /run-responsive\.mjs full/);
  assert.ok(pkg.scripts["test:responsive:discover"]);
  assert.ok(pkg.scripts["test:responsive:contract"]);
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(ignore, /tests\/responsive\/artifacts\//);
  assert.doesNotMatch(ignore, /tests\/responsive\/baselines/, "baselines must stay tracked");
  assert.ok(fs.existsSync(R("baselines", ".gitkeep")));
  assert.equal(pkg.devDependencies?.["@playwright/test"], undefined, "Playwright must stay isolated in e2e/package.json");
  const e2e = JSON.parse(fs.readFileSync(path.join(root, "e2e", "package.json"), "utf8"));
  assert.ok(e2e.devDependencies["@playwright/test"]);
});

test("existing e2e smoke suite and its port are untouched", () => {
  const cfg = fs.readFileSync(path.join(root, "e2e", "playwright.config.js"), "utf8");
  assert.match(cfg, /5173/);
  const resp = fs.readFileSync(R("playwright.responsive.config.js"), "utf8");
  assert.match(resp, /5174/, "responsive suite must not collide with e2e's port 5173");
});

/* ---- optional: run the real in-page detectors in Chromium ---- */
async function launchChromium() {
  const req = createRequire(import.meta.url);
  const paths = [path.join(root, "e2e"), root, ...(process.env.PW_NODE_PATH ? [process.env.PW_NODE_PATH] : [])];
  for (const name of ["playwright", "playwright-core"]) {
    try {
      const dir = path.dirname(req.resolve(`${name}/package.json`, { paths }));
      const mod = await import(pathToFileURL(path.join(dir, "index.mjs")).href);
      return await mod.chromium.launch();
    } catch { /* try next */ }
  }
  return null;
}

test("in-page detectors find planted defects (Chromium, optional)", async (t) => {
  const browser = await launchChromium();
  if (!browser) return t.skip("no Chromium-capable playwright available");
  try {
    const { installInPageDetectors } = await imp("helpers", "inpage.js");
    const { runChecks } = await imp("helpers", "checks.js");
    const vp = { id: "375x812", width: 375, height: 812, isMobile: true, hasTouch: true };
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await installInPageDetectors(ctx);
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html data-viewport="phone"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font:14px sans-serif">
      <div style="width:600px;height:20px">wide</div>
      <div style="display:flex;overflow-x:auto;width:300px"><button style="flex:none;width:300px;height:48px">scroller-a</button><button style="flex:none;width:300px;height:48px">scroller-b</button></div>
      <button style="position:fixed;left:300px;top:100px;width:120px;height:48px">clipped</button>
      <button id="tiny" style="width:20px;height:20px">x</button>
      <div class="sketchizi-tool-sidebar" style="position:fixed;left:10px;top:300px;width:100px;height:100px"></div>
      <div class="canvas-tabs-bar" style="position:fixed;left:50px;top:350px;width:100px;height:100px"></div>
      <div style="width:80px;overflow:hidden;white-space:nowrap">This label is much too long to fit here</div>
      <div style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Ellipsis is intentional and fine here</div>
    </body></html>`);
    const { findings } = await runChecks(page, { viewport: vp });
    const has = (cat, re) => findings.some((f) => f.category === cat && (!re || re.test(`${f.message} ${f.selector}`)));
    assert.ok(has("horizontal-overflow"), "overflow not detected under isMobile emulation (innerWidth inflation regression)");
    assert.ok(has("viewport-clipping", /clipped/), "clipped fixed button not detected");
    assert.ok(!findings.some((f) => /scroller-[ab]/.test(f.message)), "buttons inside an intentional horizontal scroller must not be reported");
    assert.ok(has("touch-target", /tiny/), "20px touch target not detected");
    assert.ok(has("overlap", /primary-dock/), "dock/tabs overlap not detected");
    assert.ok(has("text-clipping", /too long/), "silently clipped text not detected");
    assert.ok(!findings.some((f) => f.category === "text-clipping" && /Ellipsis/.test(f.message)), "ellipsis truncation is intentional");
  } finally {
    await browser.close();
  }
});
