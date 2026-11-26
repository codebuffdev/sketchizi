import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, openStudio, openCommand, isVisible, settle, drawFixtureScene } from "../helpers/suite-kit.js";

/**
 * DISCOVERY NOTE
 * src/components/app/ArchitectureValidationPanel.jsx exists (and its responsive
 * CSS is maintained) but App.jsx intentionally does NOT mount it:
 * tests/canvas-first-header.test.js, tests/header-redesign.test.js and
 * tests/kubernetes-deployment-review-integration.test.js all assert
 * `doesNotMatch(app, /<ArchitectureValidationPanel/)`.
 * The dashboard / diagnostics / export UI is therefore tested where it is
 * actually reachable: Kubernetes Studio ("Manifest validation"), Docker
 * Compose Studio ("Compose validation") and the Design validation dialog.
 */
test.describe("J · Architecture validation", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("standalone ArchitectureValidationPanel is not mounted (documented gap)", async ({ qa, page }) => {
    await drawFixtureScene(qa);
    const mounted = await isVisible(page, SEL.validationPanel);
    if (!mounted) {
      qa.gap("ArchitectureValidationPanel", "component is not mounted in App.jsx by design (see canvas-first-header.test.js); its dashboard, filters and export actions cannot be reached in the live app", { evidence: ["tests/canvas-first-header.test.js", "tests/kubernetes-deployment-review-integration.test.js"] });
    } else {
      await qa.checkpoint("validation-panel", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
    }
  });

  test("Kubernetes Studio manifest validation surface", async ({ qa, page }) => {
    if (!(await openStudio(qa, "Open Kubernetes Studio", ".k8s-studio", "Kubernetes Studio"))) return;
    await qa.checkpoint("k8s-studio", { checks: ["overflow", "clipping", "touch", "text", "layout"] });
    const validation = page.locator("[aria-label='Manifest validation']").first();
    if (await validation.isVisible().catch(() => false)) {
      const trigger = page.locator("button:has-text('Validation'), button:has-text('Diagnostics'), .k8s-studio-validation-toggle").first();
      if (await trigger.isVisible().catch(() => false)) { await trigger.click().catch(() => {}); await settle(page); }
      await qa.checkpoint("k8s-validation", { checks: ["overflow", "clipping", "touch", "text", "layout"] });
    } else qa.gap("K8s manifest validation", "validation region not visible at this viewport");
  });

  test("Docker Compose Studio validation, long diagnostics and exports", async ({ qa, page }) => {
    if (!(await openStudio(qa, "Open Docker Compose Studio", ".docker-studio", "Docker Compose Studio"))) return;
    await qa.checkpoint("compose-studio", { checks: ["overflow", "clipping", "touch", "text", "layout"] });
    const toggle = page.locator(".docker-studio-validation-toggle").first();
    if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await settle(page); }
    // Inject a deliberately broken compose file with very long names to force long diagnostics.
    const editor = page.locator("textarea[aria-label='Compose YAML editor'], [aria-label='Compose YAML editor'] textarea, textarea").first();
    if (await editor.isVisible().catch(() => false)) {
      const long = "x".repeat(120);
      await editor.fill(`services:\n  ${long}:\n    image: ${long}:latest\n    depends_on:\n      - ${long}-missing-dependency-that-does-not-exist\n    ports:\n      - "99999:99999"\n`);
      await settle(page);
    }
    await qa.checkpoint("compose-long-diagnostics", { checks: ["overflow", "clipping", "touch", "text", "layout"] });
  });

  test("Design validation dialog (when reachable)", async ({ qa, page }) => {
    await openCommand(page, "Browse Design Templates").catch(() => {});
    if (!(await isVisible(page, SEL.designScreen, 8000))) return qa.gap("Design validation dialog", "Design Studio not reachable from the command palette");
    const trigger = page.locator("button:has-text('Validate'), button:has-text('Validation'), button[aria-label*='validation' i]").first();
    if (!(await trigger.isVisible().catch(() => false))) return qa.gap("Design validation dialog", "no validation trigger on the template gallery (dialog opens only after generating a design)");
    await trigger.click();
    await expect(page.locator(SEL.designDialog).first()).toBeVisible();
    await qa.checkpoint("design-validation-dialog", { checks: ["overflow", "clipping", "touch", "text", "layout"] });
  });
});
