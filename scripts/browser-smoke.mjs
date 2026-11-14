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

  // Coarse square grid spans the entire editor. Fine squares form a
  // content-bound RECTANGLE that stays put on hover, zoom and pan.
  // Isolate drawing interactions from unrelated smoke checks.
  const gridSession = await makePage({ width: 1280, height: 800 });
  await gridSession.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  const focusGrid = gridSession.page.locator(".desktop-canvas-region .sketchizi-grid-spotlight");
  await focusGrid.waitFor({ state: "attached", timeout: 12000 });
  const canvasLocator = gridSession.page.locator(".desktop-canvas-region > .canvas");
  const sceneBounds = await canvasLocator.boundingBox();
  if (!sceneBounds?.width || !sceneBounds?.height) throw new Error("Editor canvas has no viewport");
  const readGrid = () => focusGrid.evaluate((node) => {
    const base = getComputedStyle(node, "::before");
    const detail = getComputedStyle(node, "::after");
    const style = getComputedStyle(node);
    const root = document.querySelector(".desktop-canvas-region > .canvas");
    const canvas = root?.getBoundingClientRect();
    return {
      active: node.classList.contains("has-focus"),
      enabled: node.classList.contains("is-grid-enabled"),
      display: style.display,
      pointerEvents: style.pointerEvents,
      baseImage: base.backgroundImage,
      baseWidth: base.width,
      baseHeight: base.height,
      detailImage: detail.backgroundImage,
      detailOpacity: Number(detail.opacity),
      detailMask: detail.maskImage,
      detailMaskComposite: detail.maskComposite,
      coarseSize: parseFloat(node.style.getPropertyValue("--sk-grid-coarse-size")),
      fineSize: parseFloat(node.style.getPropertyValue("--sk-grid-size")),
      focusLeft: parseFloat(node.style.getPropertyValue("--sk-grid-focus-left")),
      focusTop: parseFloat(node.style.getPropertyValue("--sk-grid-focus-top")),
      focusWidth: parseFloat(node.style.getPropertyValue("--sk-grid-focus-width")),
      focusHeight: parseFloat(node.style.getPropertyValue("--sk-grid-focus-height")),
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      canvasBackground: getComputedStyle(document.querySelector(".desktop-canvas-region")).backgroundImage,
    };
  });
  const twoLines = (image) => (image.match(/linear-gradient\(/g) || []).length === 2;
  const x = sceneBounds.x + sceneBounds.width * 0.53;
  const y = sceneBounds.y + sceneBounds.height * 0.51;
  await gridSession.page.mouse.move(x, y);
  await gridSession.page.waitForTimeout(90);
  const off = await readGrid();
  if (off.enabled || off.display !== "none" || off.active) {
    throw new Error(`Show Grid OFF must hide all layers: ${JSON.stringify(off)}`);
  }
  const toggleShowGrid = async (label) => {
    await gridSession.page.getByRole("button", { name: "View", exact: true }).click();
    await gridSession.page.getByRole("menuitem", { name: new RegExp(label) }).click();
  };
  await toggleShowGrid("Show Grid");
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".desktop-canvas-region .sketchizi-grid-spotlight")?.classList.contains("is-grid-enabled"),
  );
  // Legacy content-bound assertions require Focus (Local), not the new default.
  await gridSession.page.getByRole("button", { name: "Grid settings" }).click();
  const gridSettings = gridSession.page.getByRole("dialog", { name: "Grid settings" });
  await gridSettings.getByRole("button", { name: /Focus \(Local\)/ }).click();
  await gridSession.page.getByRole("button", { name: "Grid settings" }).click();
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".desktop-canvas-region .sketchizi-grid-spotlight")?.classList.contains("is-local-style"),
  );
  const empty = await readGrid();
  if (!empty.enabled || empty.display === "none" || empty.active || empty.detailOpacity > 0.01 ||
      empty.pointerEvents !== "none" || empty.canvasBackground !== "none" ||
      !twoLines(empty.baseImage) || empty.baseWidth !== `${empty.canvasWidth}px` ||
      empty.baseHeight !== `${empty.canvasHeight}px` ||
      !empty.coarseSize || empty.coarseSize <= 0) {
    throw new Error(`Coarse grid must fill an idle canvas without fine detail: ${JSON.stringify(empty)}`);
  }
  // Select Excalidraw's actual rectangle tool; a keyboard shortcut can
  // be ignored if another UI control still owns focus.
  await gridSession.page.locator('[data-testid="toolbar-rectangle"]').click();
  await gridSession.page.mouse.move(x, y);
  await gridSession.page.mouse.down();
  await gridSession.page.mouse.move(x + 160, y + 95, { steps: 6 });
  await gridSession.page.mouse.up();
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".desktop-canvas-region .sketchizi-grid-spotlight")?.classList.contains("has-focus"),
    { timeout: 5000 },
  );
  await gridSession.page.waitForTimeout(260);
  const contentGrid = await readGrid();
  if (!contentGrid.active || !twoLines(contentGrid.detailImage) ||
      !contentGrid.detailMask.includes("linear-gradient") ||
      !contentGrid.detailMaskComposite.split(",").every((value) => value.trim() === "intersect") ||
      contentGrid.focusWidth < 130 || contentGrid.focusHeight < 75 ||
      contentGrid.focusWidth > contentGrid.canvasWidth * 0.95 ||
      contentGrid.focusHeight > contentGrid.canvasHeight * 0.91 ||
      !contentGrid.fineSize || contentGrid.fineSize >= contentGrid.coarseSize / 8) {
    throw new Error(`Fine rectangular grid must remain around drawing content: ${JSON.stringify(contentGrid)}`);
  }
  // Grid ON/OFF behavior is covered by the state-contract regression suite.
  // The browser smoke test validates the drawing and focused grid without
  // depending on whether the toolbar stays expanded after drawing.
  await gridSession.page.mouse.move(x - 120, y - 100);
  await gridSession.page.waitForTimeout(100);
  const afterHover = await readGrid();
  if (afterHover.focusLeft !== contentGrid.focusLeft ||
      afterHover.focusTop !== contentGrid.focusTop || !afterHover.active) {
    throw new Error(`Fine grid unexpectedly followed mouse hover: ${JSON.stringify({contentGrid,afterHover})}`);
  }
  await gridSession.page.waitForTimeout(3400);
  const afterIdle = await readGrid();
  if (!afterIdle.active || !twoLines(afterIdle.baseImage)) {
    throw new Error(`Grid disappeared even though the drawing has content: ${JSON.stringify(afterIdle)}`);
  }
  await gridSession.page.setViewportSize({ width: 390, height: 740 });
  await gridSession.page.waitForTimeout(100);
  const phoneGrid = await readGrid();
  if (!phoneGrid.active || phoneGrid.focusLeft < 0 || phoneGrid.focusTop < 0 ||
      phoneGrid.focusLeft + phoneGrid.focusWidth > phoneGrid.canvasWidth + 1 ||
      phoneGrid.focusTop + phoneGrid.focusHeight > phoneGrid.canvasHeight + 1 ||
      !twoLines(phoneGrid.baseImage)) {
    throw new Error(`Responsive rectangular grid overflows phone canvas: ${JSON.stringify(phoneGrid)}`);
  }
  await gridSession.context.close();
  console.log("PASS: always-on coarse square grid with persistent, content-bound rectangular fine detail.");

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
