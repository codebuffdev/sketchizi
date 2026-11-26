import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "./pw.js";
import { selectViewports, selectBoundaries } from "./config/viewports.js";

/**
 * Responsive QA Automation Suite.
 *
 *   npm run test:responsive:smoke   4 viewports  x 15 suites
 *   npm run test:responsive:full    14 viewports x 15 suites + 10 breakpoint-edge checks
 *
 * Playwright is the SAME install the repo already uses for `npm run test:e2e`
 * (e2e/package.json); pw.js resolves it. No second framework, root lockfile untouched.
 *
 * Environment:
 *   RESPONSIVE_PROFILE            smoke | full (default full)
 *   RESPONSIVE_VIEWPORTS          comma list of viewport ids, e.g. 375x812,1440x900
 *   RESPONSIVE_EXTRA_BOUNDARIES   1 -> also test CSS edges discovered in the stylesheets
 *   RESPONSIVE_FAIL_ON            P0 | P1 (default) | P2 | P3 | none (report-only)
 *   RESPONSIVE_STRICT             1 -> unreachable features count as failures
 *   RESPONSIVE_BASELINE           compare | update (pixel baselines in tests/responsive/baselines)
 *   RESPONSIVE_EMBED_SCREENSHOTS  all | findings | none (HTML report embedding)
 *   RESPONSIVE_FREEZE_ANIMATIONS  1 -> force 0s animations/transitions
 *   RESPONSIVE_SERVER             dev (default) | preview (vite build + preview)
 *   RESPONSIVE_PORT               default 5174 (e2e uses 5173)
 *   RESPONSIVE_BASE_URL           use an already running server (disables webServer)
 *   RESPONSIVE_WORKERS            worker count
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const profile = process.env.RESPONSIVE_PROFILE || "full";
const port = Number(process.env.RESPONSIVE_PORT || 5174);
const externalBase = process.env.RESPONSIVE_BASE_URL || "";
const baseURL = externalBase || `http://127.0.0.1:${port}`;
const artifactsDir = process.env.RESPONSIVE_ARTIFACTS_DIR || path.join(here, "artifacts");

const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
const workers = Number(process.env.RESPONSIVE_WORKERS) || (process.env.CI ? 2 : Math.max(1, Math.min(4, Math.floor(cpuCount / 2))));

const sharedUse = {
  baseURL,
  colorScheme: "light",
  reducedMotion: "reduce", // CSS already honours prefers-reduced-motion
  locale: "en-US",
  timezoneId: "UTC",
  deviceScaleFactor: 1,
  serviceWorkers: "block",
  acceptDownloads: true,
  trace: "retain-on-failure",
};

const viewportProject = (vp, extra = {}) => ({
  name: vp.id.startsWith("bp-") ? vp.id : `vp-${vp.id}`,
  metadata: { viewport: vp },
  use: {
    ...sharedUse,
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
  },
  ...extra,
});

const projects = [
  ...selectViewports(profile).map((vp) => viewportProject(vp, { testIgnore: "**/breakpoint-boundaries.spec.js" })),
  ...selectBoundaries(profile).map((vp) => viewportProject(vp, { testMatch: "**/breakpoint-boundaries.spec.js" })),
];

const serverCommand =
  process.env.RESPONSIVE_SERVER === "preview"
    ? `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`
    : `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`;

export default defineConfig({
  testDir: path.join(here, "suites"),
  outputDir: path.join(artifactsDir, "test-results"),
  snapshotPathTemplate: path.join(here, "baselines", "{arg}{ext}"),
  updateSnapshots: process.env.RESPONSIVE_BASELINE === "update" ? "all" : "none",
  fullyParallel: true,
  workers,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  forbidOnly: Boolean(process.env.CI),
  globalSetup: path.join(here, "config/global-setup.js"),
  reporter: [
    ["list"],
    [path.join(here, "reporters/responsive-json-reporter.js"), { outputDir: artifactsDir, profile }],
    [path.join(here, "reporters/responsive-html-reporter.js"), { outputDir: artifactsDir, profile }],
  ],
  projects,
  webServer: externalBase
    ? undefined
    : {
        command: serverCommand,
        cwd: repoRoot,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: process.env.RESPONSIVE_SERVER === "preview" ? 300_000 : 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
