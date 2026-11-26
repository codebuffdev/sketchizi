import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "../pw.js";
import { installInPageDetectors } from "../helpers/inpage.js";
import { installNetworkMocks } from "../helpers/network.js";
import { bootApp } from "../helpers/navigation.js";
import { runChecks, ALL_CHECKS } from "../helpers/checks.js";
import { captureScreenshot, compareBaseline, slug } from "../helpers/screenshots.js";
import { makeFinding, isFailing, failThreshold } from "../helpers/findings.js";
import { settle } from "../helpers/viewport.js";
import { IGNORE } from "../config/ignore.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ARTIFACTS_DIR = process.env.RESPONSIVE_ARTIFACTS_DIR || path.resolve(here, "../artifacts");

const FREEZE_CSS = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}`;

function embedPolicy() {
  return process.env.RESPONSIVE_EMBED_SCREENSHOTS || (process.env.RESPONSIVE_PROFILE === "smoke" ? "all" : "findings");
}

export const test = base.extend({
  /** 'anonymous' (default) | 'signed-in' */
  authMode: ["anonymous", { option: true }],

  qa: async ({ page, context, authMode }, use, testInfo) => {
    const viewport = testInfo.project.metadata.viewport;
    if (!viewport) throw new Error(`Project ${testInfo.project.name} has no metadata.viewport`);
    const suite = path.basename(testInfo.file).replace(/\.spec\.js$/, "");
    const threshold = failThreshold();
    const findings = [];
    const checkpoints = [];
    const consoleErrors = [];

    await installInPageDetectors(context);
    // Deterministic app state: light theme, no persisted onboarding surprises.
    await context.addInitScript(() => {
      try { localStorage.setItem("diagram-app-theme", "light"); } catch { /* storage unavailable */ }
    });
    if (process.env.RESPONSIVE_FREEZE_ANIMATIONS === "1") {
      await context.addInitScript((css) => {
        const add = () => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
        if (document.head) add(); else document.addEventListener("DOMContentLoaded", add, { once: true });
      }, FREEZE_CSS);
    }
    const mocks = await installNetworkMocks(context, { auth: authMode });

    page.on("pageerror", (error) => {
      findings.push(makeFinding({ viewport: viewport.id, suite, checkpoint: "runtime", category: "runtime-error", severity: "P1", message: `Uncaught page error: ${String(error.message).slice(0, 300)}` }));
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (IGNORE.consoleErrors.some((re) => re.test(text))) return;
      consoleErrors.push(text.slice(0, 300));
    });

    const tagFinding = (f, checkpoint) => ({ viewport: viewport.id, suite, checkpoint, ...f });

    const qa = {
      page,
      viewport,
      suite,
      mocks,

      boot: (opts) => bootApp(page, opts),

      record(finding, checkpoint = "manual") {
        findings.push(tagFinding(makeFinding(finding), checkpoint));
      },

      /** A feature that could not be reached at this viewport. Never silently passes. */
      gap(feature, reason, details = null) {
        const strict = process.env.RESPONSIVE_STRICT === "1";
        const f = tagFinding(makeFinding({ category: "coverage-gap", severity: strict ? "P1" : "P3", message: `${feature}: ${reason}`, details }), "coverage");
        findings.push(f);
        if (strict) expect.soft(false, f.message).toBe(true);
      },

      /** Runs the detectors, captures a screenshot, records everything, soft-asserts. */
      async checkpoint(name, { checks = ALL_CHECKS, scope = null, extraSurfaces = [], grids = [], fullPage = false, baseline = true } = {}) {
        await settle(page);
        const { findings: found, stats } = await runChecks(page, { viewport, checks, scope, extraSurfaces, grids });
        const tagged = found.map((f) => tagFinding(f, name));

        const policy = embedPolicy();
        const embed = policy === "all" || (policy === "findings" && tagged.some((f) => f.severity !== "P3"));
        const shot = await captureScreenshot(page, { artifactsDir: ARTIFACTS_DIR, viewportId: viewport.id, suite, name, fullPage, embed });

        const mode = process.env.RESPONSIVE_BASELINE;
        if (baseline && (mode === "compare" || mode === "update")) {
          const diff = await compareBaseline(page, expect, { viewportId: viewport.id, suite, name });
          if (diff) {
            tagged.push(tagFinding(makeFinding({
              category: "visual-regression",
              severity: diff.missing ? "P3" : "P1",
              message: diff.missing ? "No baseline yet (run with RESPONSIVE_BASELINE=update to create it)" : `Screenshot differs from baseline: ${diff.message}`,
            }), name));
          }
        }

        findings.push(...tagged);
        checkpoints.push({ name, slug: slug(name), screenshot: shot.file, thumb: shot.thumb, stats, findingCount: tagged.length });

        const failing = tagged.filter((f) => isFailing(f, threshold));
        if (failing.length) {
          const lines = failing.slice(0, 8).map((f) => `  [${f.severity}] ${f.category}: ${f.message} (${f.selector || "-"})`).join("\n");
          expect.soft(failing.length, `${failing.length} responsive defect(s) at "${name}" (${viewport.id}):\n${lines}`).toBe(0);
        }
        return { findings: tagged, stats };
      },

      step: (title, fn) => test.step(title, fn),
    };

    await use(qa);

    for (const text of consoleErrors) {
      findings.push(tagFinding(makeFinding({ category: "runtime-error", severity: "P2", message: `console.error: ${text}` }), "runtime"));
    }
    const report = {
      suite,
      title: testInfo.titlePath.slice(1).join(" › "),
      viewport,
      threshold,
      checkpoints,
      findings,
      network: { requests: [...new Set(mocks.requests)], blockedHosts: [...new Set(mocks.blocked)] },
    };
    fs.mkdirSync(path.join(ARTIFACTS_DIR, "raw"), { recursive: true });
    await testInfo.attach("qa-report", { body: JSON.stringify(report), contentType: "application/json" });
  },
});

export { expect };
