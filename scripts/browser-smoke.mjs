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

  // The small editor toolbox must match the approved compact mockup and
  // retain every icon collection under More without enlarging the drawer.
  await blank.page.getByRole("button", { name: "Open icon library" }).click();
  const library = blank.page.getByRole("dialog", { name: "Icon Library" });
  await library.waitFor();
  const compactLayout = await library.evaluate((panel) => {
    const collections = panel.querySelector(".sk-catalog-tabs");
    const rect = panel.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      collectionDisplay: getComputedStyle(collections).display,
      allVisible: [...collections.querySelectorAll("button")].some((b) => b.textContent.trim() === "All"),
      awsVisible: [...collections.querySelectorAll("button")].some((b) => b.textContent.trim() === "AWS"),
      kubernetesVisible: [...collections.querySelectorAll("button")].some((b) => b.textContent.trim() === "Kubernetes"),
    };
  });
  if (compactLayout.width > 322 || compactLayout.height > 462 ||
    compactLayout.width < 270 || compactLayout.height < 260 ||
    compactLayout.collectionDisplay !== "flex" ||
    !compactLayout.allVisible || !compactLayout.awsVisible || !compactLayout.kubernetesVisible) {
    throw new Error(`Icon Library is not compact: ${JSON.stringify(compactLayout)}`);
  }
  await library.getByRole("button", { name: "More icon collections" }).click();
  const more = library.getByRole("menu", { name: "More icon collections" });
  await more.getByRole("menuitemradio", { name: "Networking" }).click();
  await more.waitFor({ state: "detached" });
  await library.getByRole("button", { name: "More icon collections" }).click();
  await more.getByRole("menuitemradio", { name: "UML" }).click();
  await library.getByRole("button", { name: "List view" }).click();
  await library.locator(".sk-icon-grid.is-list-view").waitFor();
  await library.getByRole("button", { name: "Grid view" }).click();
  await library.locator(".sk-icon-grid.is-grid-view").waitFor();
  await library.getByRole("button", { name: "List view" }).click();

  // Check viewport containment without requiring a separate mobile route.
  await blank.page.setViewportSize({ width: 390, height: 740 });
  const smallLayout = await library.evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, height: rect.height, vw: window.innerWidth, vh: window.innerHeight };
  });
  if (smallLayout.left < 0 || smallLayout.right > smallLayout.vw + 1 ||
    smallLayout.width > 322 || smallLayout.height > 462 || smallLayout.height > smallLayout.vh) {
    throw new Error(`Compact icon panel overflows at phone width: ${JSON.stringify(smallLayout)}`);
  }
  await blank.page.setViewportSize({ width: 1280, height: 800 });
  await library.getByRole("button", { name: "Close icon library" }).click();
  console.log("PASS: 320×460 compact library with More collections, list/grid, and phone containment.");

  // The clipboard toast is owned by Excalidraw, so exercise its native class
  // using a temporary message without needing clipboard permissions.
  const toastLayout = await blank.page.evaluate(() => {
    const editor = document.querySelector(".desktop-canvas-region .excalidraw");
    const dock = editor?.querySelector(".App-toolbar");
    if (!editor || !dock) return null;
    const toast = document.createElement("div");
    toast.className = "Toast";
    toast.textContent = "Copied selection to clipboard as PNG";
    editor.appendChild(toast);
    const rect = toast.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const position = getComputedStyle(toast).position;
    const layout = {
      position,
      top: rect.top,
      bottom: rect.bottom,
      dockTop: dockRect.top,
      viewportWidth: window.innerWidth,
      left: rect.left,
      right: rect.right,
    };
    toast.remove();
    return layout;
  });
  if (!toastLayout || toastLayout.position !== "fixed" ||
    toastLayout.bottom + 12 >= toastLayout.dockTop ||
    toastLayout.left < 0 || toastLayout.right > toastLayout.viewportWidth) {
    throw new Error(`Clipboard notification overlaps the drawing toolbar: ${JSON.stringify(toastLayout)}`);
  }
  console.log("PASS: native Excalidraw clipboard notification clears the drawing toolbar.");

  // Advanced work remains accessible without crowding the main drawing UI.
  await blank.page.getByRole("button", { name: /Local document save status/ }).click();
  await blank.page.getByRole("button", { name: /Export studio/ }).click();
  await blank.page.getByRole("dialog", { name: "Export Studio" }).waitFor({ timeout: 10000 });
  await blank.page.getByRole("button", { name: "Close export studio" }).click();
  console.log("PASS: Export Studio remains reachable from the save menu.");

  await blank.page.getByRole("button", { name: "Search commands" }).click();
  await blank.page.getByRole("dialog", { name: "Sketchizi command palette" }).waitFor();
  await blank.page.getByRole("searchbox", { name: "Search commands" }).fill("Architecture Validation");
  await blank.page.getByRole("option", { name: /Architecture Validation/ }).click();
  await blank.page.getByRole("region", { name: "Architecture Validation" }).waitFor({ timeout: 10000 });
  await blank.page.getByRole("button", { name: "Close architecture validation" }).click();
  console.log("PASS: Architecture Validation remains available in the command palette.");

  // Optional studios should download on first use, open, and return to the same editor.
  await openCreateMenu(blank.page);
  await blank.page.getByRole("menuitem", { name: /^Docker Compose Studio/ }).click();
  await blank.page.getByRole("dialog", { name: "Docker Compose Studio" }).waitFor({ timeout: 30000 });
  await blank.page.getByRole("button", { name: "Close Docker Compose Studio" }).click();
  await blank.page.getByRole("dialog", { name: "Docker Compose Studio" }).waitFor({ state: "detached" });
  console.log("PASS: lazy Docker Compose Studio opens and closes.");

  await openCreateMenu(blank.page);
  await blank.page.getByRole("menuitem", { name: /^Kubernetes Studio/ }).click();
  await blank.page.getByRole("dialog", { name: "K8s Studio" }).waitFor({ timeout: 30000 });
  await blank.page.getByRole("button", { name: "Close K8s Studio" }).click();
  await blank.page.getByRole("dialog", { name: "K8s Studio" }).waitFor({ state: "detached" });
  console.log("PASS: lazy Kubernetes Studio opens and closes.");



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

  // Sign-in is a true canvas-centered modal, not a popup clipped by the header.
  // Stub only the current-user endpoint to keep the layout smoke independent
  // from optional authentication backend availability.
  const authLayout = await makePage({ width: 1280, height: 800 });
  await authLayout.page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: false, user: null }),
  }));
  await authLayout.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await authLayout.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await authLayout.page.getByRole("dialog", { name: "Sign in to Sketchizi" }).waitFor();

  const verifyAuthDialogCentered = async (page) => {
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector(".auth-dialog");
      const backdrop = document.querySelector(".auth-dialog-backdrop");
      const canvas = document.querySelector(".desktop-canvas-region");
      if (!dialog || !backdrop || !canvas) return null;
      const rect = dialog.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        portalled: backdrop.parentElement?.classList.contains("app") === true,
        dx: Math.abs(rect.left + rect.width / 2 - (canvasRect.left + canvasRect.width / 2)),
        dy: Math.abs(rect.top + rect.height / 2 - (canvasRect.top + canvasRect.height / 2)),
        withinViewport: rect.left >= 0 && rect.top >= 0 &&
          rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      };
    });
    if (!layout?.portalled || layout.dx > 30 || layout.dy > 40 || !layout.withinViewport) {
      throw new Error(`Sign-in dialog is not centered over the canvas: ${JSON.stringify(layout)}`);
    }
  };
  await verifyAuthDialogCentered(authLayout.page);
  console.log("PASS: sign-in dialog is centered over the desktop canvas.");
  await authLayout.page.setViewportSize({ width: 390, height: 740 });
  await verifyAuthDialogCentered(authLayout.page);
  console.log("PASS: sign-in dialog remains centered and visible at phone width.");
  await authLayout.page.keyboard.press("Escape");
  await authLayout.page.getByRole("dialog", { name: "Sign in to Sketchizi" }).waitFor({ state: "detached" });

  if (errors.length) throw new Error(`Browser console exceptions: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
