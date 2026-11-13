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

const openCreateMenu = async (page) => {
  await page.getByRole("button", { name: "Create drawing" }).click();
  await page.getByRole("menu", { name: "Create a drawing" }).waitFor();
};

const openDesignStudio = async (page) => {
  await openCreateMenu(page);
  await page.getByRole("menuitem", { name: /^Templates/ }).click();
  await page.getByRole("heading", { name: "What are you designing?" }).waitFor();
};

try {
  // Template journey at desktop width, then verify the creation screen at narrow widths.
  const desktop = await makePage({ width: 1440, height: 1000 });
  const page = desktop.page;
  await page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await openDesignStudio(page);
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

  // Replacing a populated drawing must be explicitly confirmed. Cancel first
  // to verify that Create does not bypass the existing unsaved-work safeguard.
  await openCreateMenu(page);
  let cancelledConfirmation = null;
  page.once("dialog", async (dialog) => {
    cancelledConfirmation = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
  });
  await page.getByRole("menuitem", { name: /^Blank drawing/ }).click();
  if (cancelledConfirmation?.type !== "confirm" || !cancelledConfirmation.message.includes("create a new drawing")) {
    throw new Error("Create > Blank drawing did not request confirmation for existing work.");
  }
  console.log("PASS: replacing an existing drawing requires confirmation.");

  // Confirming replacement returns the user to an empty, editable canvas.
  await openCreateMenu(page);
  let confirmedReplacement = false;
  page.once("dialog", async (dialog) => {
    confirmedReplacement = dialog.type() === "confirm";
    await dialog.accept();
  });
  await page.getByRole("menuitem", { name: /^Blank drawing/ }).click();
  if (!confirmedReplacement) throw new Error("Confirmation was not shown when replacing the drawing.");
  await page.getByText("New drawing", { exact: true }).waitFor({ timeout: 10000 });
  await page.locator(".excalidraw").waitFor();
  console.log("PASS: confirmed replacement creates a blank drawing.");


  // A fresh browser context validates the primary blank drawing action.
  const blank = await makePage({ width: 1280, height: 800 });
  await blank.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await openCreateMenu(blank.page);
  await blank.page.getByRole("menuitem", { name: /^Blank drawing/ }).click();
  await blank.page.locator(".excalidraw").waitFor({ timeout: 30000 });
  await blank.page.getByRole("button", { name: "Create drawing" }).waitFor();
  console.log("PASS: Create > Blank drawing opens the editor.");

  // Exercise the creation screen in a narrow desktop / mobile-sized viewport.
  const responsive = await makePage({ width: 390, height: 844 });
  await responsive.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await openCreateMenu(responsive.page);
  await responsive.page.getByRole("menuitem", { name: /^Templates/ }).waitFor();
  await responsive.page.keyboard.press("Escape");
  await responsive.page.getByRole("menu", { name: "Create a drawing" }).waitFor({ state: "detached" });
  await openDesignStudio(responsive.page);
  await responsive.page.getByRole("button", { name: "Start blank" }).waitFor();
  const overflow = await responsive.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Creation screen has horizontal overflow at 390px viewport width.");
  console.log("PASS: creation screen remains usable at 390px without horizontal overflow.");

  if (errors.length) throw new Error(`Browser console exceptions: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
