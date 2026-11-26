import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, openCommand, isVisible, settle } from "../helpers/suite-kit.js";
import { withKeyboard } from "../helpers/viewport.js";

/**
 * Collaboration needs the signed-in host token (mocked) and a collaboration
 * server. The suite does not fake the WebSocket protocol: it starts a room,
 * then lays out WHATEVER collaboration surface the app shows (share panel,
 * header controls, participants, chat, failure status). Surfaces that cannot
 * be reached without a live server are reported as coverage gaps, never as
 * silent passes.
 */
test.use({ authMode: "signed-in" });

const SURFACES = [
  ["Share panel", SEL.collabShare],
  ["Collaboration controls", SEL.collabControls],
  ["Participants", SEL.collabParticipants],
  ["Chat", SEL.collabChat],
  ["Status", SEL.collabStatus],
];

async function startRoom(qa) {
  await openCommand(qa.page, "Start Collaboration").catch(() => {});
  await qa.page.waitForTimeout(2500);
  await settle(qa.page);
}

test.describe("N · Collaboration", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("start a room: header actions and share controls fit the viewport", async ({ qa, page }) => {
    await startRoom(qa);
    let seen = 0;
    for (const [name, sel] of SURFACES) {
      if (await isVisible(page, sel)) seen += 1; else qa.gap(`Collaboration ${name}`, `not visible after "Start Collaboration" (mocked host token; no collaboration server)`);
    }
    await qa.checkpoint(`room-started-${seen}-surfaces`, { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
  });

  test("sharing modal / link controls", async ({ qa, page }) => {
    await startRoom(qa);
    const share = page.locator(SEL.collabShare).first();
    if (!(await share.isVisible().catch(() => false))) {
      const btn = page.locator("button[aria-label*='Share' i], button:has-text('Share')").first();
      if (await btn.isVisible().catch(() => false)) { await btn.click(); await settle(page); }
    }
    if (!(await isVisible(page, SEL.collabShare))) return qa.gap("Collaboration sharing", "share surface unreachable");
    await qa.checkpoint("share-open", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
  });

  test("chat layout and composer with the soft keyboard", async ({ qa, page }) => {
    await startRoom(qa);
    const open = page.locator("button[aria-label*='chat' i]").first();
    if (!(await isVisible(page, SEL.collabChat)) && (await open.isVisible().catch(() => false))) { await open.click(); await settle(page); }
    if (!(await isVisible(page, SEL.collabChat))) return qa.gap("Collaboration chat", "chat panel unreachable without a live collaboration server");
    await qa.checkpoint("chat-open", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
    if (qa.viewport.hasTouch || qa.viewport.isMobile) {
      const input = page.locator(`${SEL.collabChat} textarea, ${SEL.collabChat} input`).first();
      if (await input.isVisible().catch(() => false)) {
        await withKeyboard(page, async (size) => {
          await input.focus();
          await settle(page);
          const b = await input.boundingBox();
          expect.soft(b && b.y + b.height, "chat input hidden behind the (simulated) keyboard").toBeLessThanOrEqual(size.height + 1);
          await qa.checkpoint("chat-keyboard", { checks: ["overflow", "clipping", "overlap"], baseline: false });
        });
      }
    }
  });

  test("recovery panel / recovered drafts", async ({ qa, page }) => {
    const recovery = page.locator(SEL.collabRecovery).first();
    if (!(await recovery.isVisible().catch(() => false))) return qa.gap("Collaboration recovery panel", "recovery UI appears only after an interrupted session; not reachable in a fresh profile");
    await qa.checkpoint("recovery-panel", { checks: ["overflow", "clipping", "overlap", "touch", "text", "layout"] });
  });
});
