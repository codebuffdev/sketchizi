import { chromium } from "playwright";

const baseURL = process.env.SKETCHIZI_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
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
  if (errors.length) throw new Error(`Browser console exceptions: ${errors.join(" | ")}`);
  console.log("PASS: create screen opens, AWS template can be selected/configured, and generated scene opens in Excalidraw.");
} finally {
  await browser.close();
}
