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

  // All opens every category; the drawer remains compact and list/grid stays intact.
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
      allVisible: !!panel.querySelector('button[aria-label="All categories"]'),
      awsVisible: [...collections.querySelectorAll("button")].some((b) => b.textContent.trim() === "AWS"),
      kubernetesVisible: [...collections.querySelectorAll("button")].some((b) => b.textContent.trim() === "K8s"),
    };
  });
  if (compactLayout.width > 322 || compactLayout.height > 462 ||
    compactLayout.width < 270 || compactLayout.height < 260 ||
    compactLayout.collectionDisplay !== "flex" ||
    !compactLayout.allVisible || !compactLayout.awsVisible || !compactLayout.kubernetesVisible) {
    throw new Error(`Icon Library is not compact: ${JSON.stringify(compactLayout)}`);
  }
  await library.getByRole("button", { name: "All categories" }).click();
  const categories = library.getByRole("menu", { name: "All icon categories" });
  for (const name of ["All icons", "AWS", "Kubernetes", "Networking", "Mind Maps", "UML", "Essentials"]) {
    await categories.getByRole("menuitemradio", { name, exact: true }).waitFor();
  }
  await categories.getByRole("menuitemradio", { name: "Networking" }).click();
  await categories.waitFor({ state: "detached" });
  await library.getByRole("button", { name: "All categories" }).click();
  await categories.getByRole("menuitemradio", { name: "UML" }).click();
  await library.getByRole("button", { name: "All categories" }).click();
  await categories.getByRole("menuitemradio", { name: "All icons" }).click();

  // Screenshot regression: results and instructions must not become
  // default-size body paragraphs in a 320px-wide toolbox.
  await library.getByRole("textbox", { name: "Search icons, tags, or categories" }).fill("ec2");
  const typography = await library.evaluate((panel) => {
    const meta = panel.querySelector(".sk-icon-compact-results-meta");
    const hint = panel.querySelector(".sk-icon-compact-hint");
    return {
      metaSize: meta ? parseFloat(getComputedStyle(meta).fontSize) : null,
      hintSize: hint ? parseFloat(getComputedStyle(hint).fontSize) : null,
      metaText: meta?.textContent?.trim(),
      hintText: hint?.textContent?.trim(),
    };
  });
  if (typography.metaSize === null || typography.metaSize > 12 ||
    typography.hintSize === null || typography.hintSize > 11 ||
    !typography.metaText.includes("results") || !typography.hintText.includes("Drag to place")) {
    throw new Error(`Compact library text is oversized: ${JSON.stringify(typography)}`);
  }
  await library.getByRole("textbox", { name: "Search icons, tags, or categories" }).fill("");
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
  const mobileHitTest = await library.evaluate((panel) => {
    const button = panel.querySelector('button[aria-label="All categories"]');
    const header = document.querySelector("#desktop-app-header");
    const resources = panel.closest(".desktop-resources-region");
    const workspace = panel.closest(".desktop-workspace");
    const rect = button.getBoundingClientRect();
    const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const summarize = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { tag: element.tagName, className: typeof element.className === "string" ? element.className.slice(0, 100) : "", top: r.top, bottom: r.bottom, left: r.left, right: r.right, zIndex: getComputedStyle(element).zIndex, position: getComputedStyle(element).position };
    };
    return {
      clickable: atPoint === button || button.contains(atPoint),
      button: summarize(button),
      topElement: summarize(atPoint),
      header: summarize(header),
      panel: summarize(panel),
      resources: summarize(resources),
      workspace: summarize(workspace),
      viewport: [window.innerWidth, window.innerHeight],
    };
  });
  if (!mobileHitTest.clickable) throw new Error(`Icon category control is covered at phone width: ${JSON.stringify(mobileHitTest)}`);
  await library.getByRole("button", { name: "All categories" }).click();
  const menuBounds = await categories.evaluate((menu) => {
    const rect = menu.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, vw: window.innerWidth, vh: window.innerHeight };
  });
  if (menuBounds.left < 0 || menuBounds.right > menuBounds.vw + 1 ||
      menuBounds.top < 0 || menuBounds.bottom > menuBounds.vh + 1) {
    throw new Error(`All category menu overflows mobile viewport: ${JSON.stringify(menuBounds)}`);
  }
  await blank.page.keyboard.press("Escape");
  await categories.waitFor({ state: "detached" });
  await library.waitFor();
  await blank.page.setViewportSize({ width: 1280, height: 800 });
  await library.getByRole("button", { name: "Close icon library" }).click();
  console.log("PASS: 320×460 library, All category dropdown, compact text, list/grid, and phone containment.");

  // Circular focus grid must sit above the scene without covering tool hit
  // targets, follow editing pointer position, and shrink on narrow screens.
  const focusGrid = blank.page.locator(".desktop-canvas-region .sketchizi-grid-spotlight");
  await focusGrid.waitFor({ timeout: 12000 });
  const sceneBounds = await blank.page.locator(".desktop-canvas-region > .canvas").boundingBox();
  if (!sceneBounds?.width || !sceneBounds?.height) throw new Error("Editor canvas has no viewport");
  const firstFocus = {
    x: sceneBounds.x + sceneBounds.width * 0.52,
    y: sceneBounds.y + sceneBounds.height * 0.54,
  };
  await blank.page.mouse.move(firstFocus.x, firstFocus.y);
  await blank.page.waitForTimeout(100);
  const readFocus = () => focusGrid.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      parent: node.parentElement?.className,
      pointerEvents: style.pointerEvents,
      clipPath: style.clipPath,
      maskImage: style.maskImage,
      backgroundImage: style.backgroundImage,
      backgroundSize: style.backgroundSize,
      backgroundPosition: style.backgroundPosition,
      x: parseFloat(node.style.getPropertyValue("--sk-grid-focus-x")),
      y: parseFloat(node.style.getPropertyValue("--sk-grid-focus-y")),
      radius: parseFloat(node.style.getPropertyValue("--sk-grid-focus-radius")),
      spacing: parseFloat(node.style.getPropertyValue("--sk-grid-size")),
      canvasBackground: getComputedStyle(document.querySelector(".desktop-canvas-region")).backgroundImage,
    };
  });
  const desktopFocus = await readFocus();
  if (!desktopFocus.parent?.includes("excalidraw__canvas-wrapper") ||
    desktopFocus.pointerEvents !== "none" ||
    !desktopFocus.clipPath.startsWith("circle(") ||
    !desktopFocus.maskImage.includes("radial-gradient") ||
    // CSS must paint continuous horizontal and vertical rules (square cells),
    // not the former circular dot stamps. Both layers share the same tiling.
    (desktopFocus.backgroundImage.match(/linear-gradient\(/g) || []).length !== 2 ||
    desktopFocus.backgroundImage.includes("radial-gradient") ||
    !/to right/.test(desktopFocus.backgroundImage) ||
    !/to bottom/.test(desktopFocus.backgroundImage) ||
    desktopFocus.backgroundSize.split(",").length !== 2 ||
    desktopFocus.backgroundSize.split(",").map((value) => value.trim())[0] !== desktopFocus.backgroundSize.split(",").map((value) => value.trim())[1] ||
    desktopFocus.backgroundPosition.split(",").length !== 2 ||
    desktopFocus.backgroundPosition.split(",").map((value) => value.trim())[0] !== desktopFocus.backgroundPosition.split(",").map((value) => value.trim())[1] ||
    desktopFocus.canvasBackground !== "none" ||
    Math.abs(desktopFocus.x - (firstFocus.x - sceneBounds.x)) > 10 ||
    Math.abs(desktopFocus.y - (firstFocus.y - sceneBounds.y)) > 10 ||
    desktopFocus.radius < 200 || desktopFocus.radius > 495 ||
    desktopFocus.spacing < 8) {
    throw new Error(`Circular focus grid incorrect at desktop: ${JSON.stringify(desktopFocus)}`);
  }
  await blank.page.mouse.move(sceneBounds.x + sceneBounds.width * 0.7, sceneBounds.y + sceneBounds.height * 0.65);
  await blank.page.waitForTimeout(80);
  const movedFocus = await readFocus();
  if (Math.abs(movedFocus.x - desktopFocus.x) < 40 || Math.abs(movedFocus.y - desktopFocus.y) < 30) {
    throw new Error(`Circular grid does not follow the edit position: ${JSON.stringify({desktopFocus,movedFocus})}`);
  }
  await blank.page.setViewportSize({ width: 390, height: 740 });
  await blank.page.waitForTimeout(100);
  const phoneFocus = await readFocus();
  if (phoneFocus.radius > 166 || phoneFocus.radius < 110 ||
    phoneFocus.pointerEvents !== "none" || !phoneFocus.clipPath.startsWith("circle(")) {
    throw new Error(`Circular focus does not fit a phone viewport: ${JSON.stringify(phoneFocus)}`);
  }
  await blank.page.setViewportSize({ width: 1280, height: 800 });
  console.log("PASS: circular square-line grid stays clipped, pointer-transparent, responsive, and follows editing position.");

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
