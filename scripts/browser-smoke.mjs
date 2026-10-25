import { chromium } from "playwright";

const baseURL = process.env.SKETCHIZI_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const errors = [];
const makePage = async (viewport) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page };
};

try {
  // Template journey at desktop width, then verify the creation screen at narrow widths.
  const desktop = await makePage({ width: 1440, height: 1000 });
  const page = desktop.page;
  await page.goto(baseURL, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: /create a new design/i }).click();
  await page.getByRole("heading", { name: "What are you designing?" }).waitFor();
  await page.getByRole("tab", { name: "AWS architecture" }).click();
  await page.getByRole("button", { name: /Three-Tier AWS Web Application/i }).waitFor();
  await page.getByRole("button", { name: /Three-Tier AWS Web Application/i }).click();
  await page.getByRole("checkbox", { name: /Configure first/i }).check();
  await page.getByLabel("Design name").fill("Browser Smoke Test Architecture");
  await page.getByLabel("AWS region").selectOption("ap-south-1");
  await page.getByLabel("Environment").selectOption("staging");
  await page.getByRole("button", { name: /Use template/i }).click();
  await page.getByRole("heading", { name: "What are you designing?" }).waitFor({ state: "detached", timeout: 30000 });
  await page.locator(".excalidraw").waitFor({ timeout: 30000 });
  console.log("PASS: configured AWS template opens the editor.");

  // A fresh browser context validates the independent blank-canvas path.
  const blank = await makePage({ width: 1280, height: 800 });
  await blank.page.goto(baseURL, { waitUntil: "networkidle", timeout: 60000 });
  await blank.page.getByRole("button", { name: /create a new design/i }).click();
  await blank.page.getByRole("heading", { name: "What are you designing?" }).waitFor();
  await blank.page.getByRole("button", { name: "Start blank" }).click();
  await blank.page.getByRole("heading", { name: "What are you designing?" }).waitFor({ state: "detached", timeout: 30000 });
  await blank.page.locator(".excalidraw").waitFor({ timeout: 30000 });
  console.log("PASS: blank-canvas path opens the editor.");

  // Open the creation screen at desktop width, then resize it to a narrow viewport.
  // Starting at desktop width ensures the creation action is available before testing responsiveness.
  const responsive = await makePage({ width: 1280, height: 844 });
  await responsive.page.goto(baseURL, { waitUntil: "networkidle", timeout: 60000 });
  await responsive.page.getByRole("button", { name: /create a new design/i }).click();
  await responsive.page.getByRole("heading", { name: "What are you designing?" }).waitFor();
  await responsive.page.setViewportSize({ width: 390, height: 844 });
  await responsive.page.getByRole("button", { name: "Start blank" }).waitFor();
  const overflow = await responsive.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Creation screen has horizontal overflow at 390px viewport width.");
  console.log("PASS: creation screen remains usable at 390px without horizontal overflow.");

  // Return to desktop width to enter the editor, then resize through the acceptance matrix.
  await responsive.page.setViewportSize({ width: 1280, height: 844 });
  await responsive.page.getByRole("button", { name: "Start blank" }).click();
  await responsive.page.getByRole("heading", { name: "What are you designing?" }).waitFor({ state: "detached", timeout: 30000 });
  await responsive.page.locator(".excalidraw").waitFor({ state: "visible", timeout: 30000 });

  // Phone widths are intentionally out of scope; validate the supported desktop/tablet workspace.
  for (const width of [1440, 1280, 1120, 1024, 900, 768]) {
    await responsive.page.setViewportSize({ width, height: 844 });
    await responsive.page.waitForTimeout(100);
    const layout = await responsive.page.evaluate(() => {
      const header = document.querySelector(".desktop-app-header");
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const rectOf = (element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
          label: element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent.trim().slice(0, 50) || element.className };
      };
      const controls = header
        ? [...header.querySelectorAll("button, [role='button']")].filter(visible).map(rectOf)
        : [];
      const overlaps = [];
      for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i], b = controls[j];
          const area = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
          if (area > 4) overlaps.push({ first: a.label, second: b.label, area: Math.round(area) });
        }
      }
      const headerRect = header?.getBoundingClientRect();
      const toolbar = document.querySelector(".desktop-canvas-region .excalidraw .App-toolbar-container");
      const toolbarRect = toolbar && visible(toolbar) ? toolbar.getBoundingClientRect() : null;
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        headerWidth: headerRect?.width ?? null,
        headerRight: headerRect?.right ?? null,
        headerBottom: headerRect?.bottom ?? null,
        toolbarTop: toolbarRect?.top ?? null,
        overlaps,
      };
    });
    if (layout.documentWidth > layout.viewportWidth + 1) {
      throw new Error(`Editor has horizontal overflow at ${width}px: document ${layout.documentWidth}px / viewport ${layout.viewportWidth}px.`);
    }
    if (layout.headerRight !== null && layout.headerRight > layout.viewportWidth + 1) {
      throw new Error(`Editor header exceeds viewport at ${width}px: right edge ${layout.headerRight}px / viewport ${layout.viewportWidth}px.`);
    }
    if (layout.overlaps.length) {
      throw new Error(`Editor header controls overlap at ${width}px: ${JSON.stringify(layout.overlaps)}`);
    }
    if (layout.toolbarTop !== null && layout.headerBottom !== null && layout.toolbarTop < layout.headerBottom - 2) {
      throw new Error(`Drawing toolbar overlaps the application header at ${width}px: toolbar top ${layout.toolbarTop}px / header bottom ${layout.headerBottom}px.`);
    }
    console.log(`PASS: editor header geometry at ${width}px (${layout.headerWidth}px header, toolbar clear of header, no overlapping controls or horizontal overflow).`);
  }

  if (errors.length) throw new Error(`Browser console exceptions: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
