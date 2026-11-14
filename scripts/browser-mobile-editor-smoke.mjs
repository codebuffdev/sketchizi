import { chromium } from "playwright";

const baseURL = process.env.SKETCHIZI_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 780 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(baseURL + "/?editor=1", { waitUntil: "networkidle", timeout: 60000 });
      const editor = page.locator(".excalidraw");
      await editor.waitFor({ state: "attached", timeout: 30000 });
      const canvasVisibility = await editor.isVisible();
      if (!canvasVisibility) {
        const diagnostics = await page.evaluate(() => {
          const el = document.querySelector(".excalidraw");
          const parents = [];
          for (let node = el, depth = 0; node && depth < 7; node = node.parentElement, depth++) {
            const css = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            parents.push({ tag: node.tagName, className: String(node.className).slice(0, 160), display: css.display, visibility: css.visibility, opacity: css.opacity, width: rect.width, height: rect.height });
          }
          return { parents, bodyText: document.body.innerText.slice(0, 500) };
        });
        throw new Error("Mobile editor is hidden at " + width + "px: " + JSON.stringify(diagnostics));
      }
      await page.getByRole("button", { name: /Local document save status: (Autosave ready|Saved locally)/ }).waitFor({ timeout: 15000 });
      const geometry = await page.evaluate(() => {
        const editor = document.querySelector(".excalidraw");
        const rect = editor?.getBoundingClientRect();
        return {
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          editorWidth: rect?.width || 0,
          editorHeight: rect?.height || 0,
          editorLeft: rect?.left ?? 0,
          editorRight: rect?.right ?? 0,
        };
      });
      if (geometry.documentWidth > geometry.viewportWidth + 2) {
        throw new Error("Horizontal document overflow at " + width + "px: " + JSON.stringify(geometry));
      }
      if (geometry.editorWidth < width * 0.65 || geometry.editorHeight < 300 ||
          geometry.editorRight < width * 0.5 || geometry.editorLeft > width * 0.5) {
        throw new Error("Mobile drawing canvas is not usable at " + width + "px: " + JSON.stringify(geometry));
      }
      if (pageErrors.length) throw new Error("Mobile runtime exceptions at " + width + "px: " + pageErrors.join(" | "));
      console.log("PASS: mobile editor visible, sized and free of horizontal overflow at " + width + "px.");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
