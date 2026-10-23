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

  // Exercise the creation screen in a narrow desktop / mobile-sized viewport.
  const responsive = await makePage({ width: 390, height: 844 });
  await responsive.page.goto(baseURL, { waitUntil: "networkidle", timeout: 60000 });
  await responsive.page.getByRole("button", { name: /create a new design/i }).click();
  await responsive.page.getByRole("heading", { name: "What are you designing?" }).waitFor();
  await responsive.page.getByRole("button", { name: "Start blank" }).waitFor();
  const overflow = await responsive.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Creation screen has horizontal overflow at 390px viewport width.");
  console.log("PASS: creation screen remains usable at 390px without horizontal overflow.");

  if (errors.length) throw new Error(`Browser console exceptions: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
