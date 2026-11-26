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

const dismissStartupChooser = async (page) => {
  const title = page.getByRole("heading", { name: "Start with" });
  await title.waitFor({ timeout: 15000 });
  const chooser = page.getByRole("dialog").filter({ has: title });
  await chooser.getByRole("button", { name: "Infinity" }).click();
  await chooser.waitFor({ state: "detached" });
};

const ensureHeaderVisible = async (page) => {
  // The old reveal-handle selector now belongs to Canvas Settings. The
  // application-header visibility control is the pin button: clicking it
  // both reveals the auto-hidden header and pins it open for this journey.
  const pin = page.locator(".desktop-app-header-pin-button");
  await pin.waitFor({ state: "attached", timeout: 15000 });
  if (await pin.getAttribute("aria-pressed") !== "true" ||
      await page.locator(".desktop-app-header").getAttribute("aria-hidden") !== "false") {
    // It can be visually hidden with the header, so invoke its real handler
    // without relying on pointer hit-testing.
    await pin.click({ force: true });
  }
  await page.waitForFunction(() =>
    document.querySelector(".desktop-app-header")?.getAttribute("aria-hidden") === "false",
  );
  await page.waitForFunction(() =>
    document.querySelector(".desktop-app-header-pin-button")?.getAttribute("aria-pressed") === "true",
  );
};

const openDevOpsMenu = async (page) => {
  await page.getByRole("button", { name: "DevOps" }).click();
  await page.getByRole("menu", { name: "DevOps tools" }).waitFor();
};

const openDesignStudio = async (page) => {
  await ensureHeaderVisible(page);
  await page.getByRole("button", { name: "Canvas style" }).click();
  await page.getByRole("button", { name: "Browse templates" }).click();
  await page.getByRole("heading", { name: "What are you designing?" }).waitFor();
};

// The Smart Studio pill (and its "Studio quick launch" menu) was retired. The
// lazy engineering studios are now launched from the Ctrl/Cmd+K command
// palette, which is available in every scene. Control+K is recognised on all
// platforms. Labels here are pinned to the source by
// tests/browser-smoke-workflow.test.js so this script cannot drift silently.
const openStudioFromCommandPalette = async (page, commandLabel) => {
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Sketchizi command palette" });
  await palette.waitFor({ state: "visible", timeout: 15000 });
  await palette.getByRole("searchbox", { name: "Search commands" }).fill(commandLabel);
  await palette.getByRole("option", { name: new RegExp(`Open ${commandLabel}`) }).click();
  // The palette closes itself on execute; wait so the next call starts clean.
  await palette.waitFor({ state: "detached", timeout: 15000 });
};

try {
  // Template journey at desktop width, then verify the creation screen at narrow widths.
  const desktop = await makePage({ width: 1440, height: 1000 });
  const page = desktop.page;
  await page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await dismissStartupChooser(page);
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

  // Optional engineering studios launch from the Ctrl/Cmd+K command palette.
  await openStudioFromCommandPalette(page, "Docker Compose Studio");
  await page.getByRole("dialog", { name: "Docker Compose Studio" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Close Docker Compose Studio" }).click();
  await page.getByRole("dialog", { name: "Docker Compose Studio" }).waitFor({ state: "detached" });
  console.log("PASS: lazy Docker Compose Studio opens and closes from the command palette.");

  await openStudioFromCommandPalette(page, "Kubernetes Studio");
  await page.getByRole("dialog", { name: "K8s Studio" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Close K8s Studio" }).click();
  await page.getByRole("dialog", { name: "K8s Studio" }).waitFor({ state: "detached" });
  console.log("PASS: lazy Kubernetes Studio opens and closes from the command palette.");

  // A populated canvas stays intact while the plus action opens a new canvas tab.
  await page.getByRole("button", { name: "Create new tab" }).click();
  await page.locator(".excalidraw").waitFor({ timeout: 30000 });
  console.log("PASS: Create new tab opens a separate editable canvas.");

  // A fresh browser context validates the blank-canvas startup flow.
  const blank = await makePage({ width: 1280, height: 800 });
  await blank.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await dismissStartupChooser(blank.page);
  await blank.page.getByRole("button", { name: "Create new tab" }).click();
  await blank.page.locator(".excalidraw").waitFor({ timeout: 30000 });
  console.log("PASS: the canvas-tab add action opens an editable canvas.");

  // System Design connector UX: drag from a generous port hit area to any
  // point on a target card, then verify click-port-to-click-card and C-to-card.
  await openStudioFromCommandPalette(blank.page, "System Design Studio");
  await blank.page.locator('[data-testid="system-design-studio"]').waitFor({ state: "visible" });
  // The floating primitive dock was removed: create nodes through the shared Icon Library.
  await blank.page.getByRole("button", { name: "Add Component" }).click();
  const systemLibrary = blank.page.getByRole("dialog", { name: "Icon Library" });
  await systemLibrary.waitFor({ state: "visible" });
  await systemLibrary.getByRole("button", { name: "System Design (22)", exact: true }).click();
  for (const label of ["Web/Mobile Client", "Microservice", "SQL Database", "Redis Cache"]) {
    await systemLibrary.getByRole("button", { name: `Add ${label} to canvas` }).click();
  }
  await systemLibrary.getByRole("button", { name: "Close icon library" }).click();
  await systemLibrary.waitFor({ state: "hidden" });
  // Auto-Layout is intentionally not exposed in the compact top command bar.
  if (await blank.page.locator(".sd-dock").count()) throw new Error("The removed floating primitive dock is still mounted.");
  const cards = blank.page.locator(".sd-node[data-node-id]");
  await blank.page.waitForFunction(() => document.querySelectorAll(".sd-node[data-node-id]").length === 4);
  const initialCards = await cards.evaluateAll((items) => items.map((item) => ({
    id: item.dataset.nodeId, width: item.style.width, height: item.style.height,
  })));
  if (initialCards.some((item) => item.width !== "204px" || item.height !== "88px")) {
    throw new Error(`System Design cards do not use the 204x88 minimum: ${JSON.stringify(initialCards)}`);
  }
  const dragSource = cards.nth(0);
  const dragTarget = cards.nth(1);
  const sourceBox = await dragSource.boundingBox();
  if (!sourceBox) throw new Error("Connector source card has no hit area.");
  await blank.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  const dragPort = dragSource.locator(".sd-port.is-right.is-visible");
  await dragPort.waitFor({ state: "visible" });
  const [portBox, targetBox] = await Promise.all([dragPort.boundingBox(), dragTarget.boundingBox()]);
  if (!portBox || !targetBox) throw new Error("Connector source port or target card has no hit area.");
  await blank.page.mouse.move(portBox.x + portBox.width / 2, portBox.y + portBox.height / 2);
  await blank.page.mouse.down();
  await blank.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await blank.page.locator(".sd-edge-preview.is-snapped").waitFor({ state: "attached" });
  const dragTargetId = await dragTarget.getAttribute("data-node-id");
  await blank.page.waitForFunction((id) =>
    document.querySelector(`.sd-node[data-node-id="${id}"]`)?.classList.contains("is-drop-target"),
  dragTargetId);
  await blank.page.mouse.up();
  await blank.page.waitForFunction(() => document.querySelectorAll(".sd-edge").length === 1);
  const [sourceAfter, targetAfter] = await Promise.all([dragSource.boundingBox(), dragTarget.boundingBox()]);
  if (Math.abs(sourceAfter.width - sourceBox.width) > 0.5 ||
      Math.abs(sourceAfter.height - sourceBox.height) > 0.5 ||
      Math.abs(targetAfter.width - targetBox.width) > 0.5 ||
      Math.abs(targetAfter.height - targetBox.height) > 0.5) {
    throw new Error("Dragging a connector resized a node card.");
  }

  const clickSource = cards.nth(1);
  const clickTarget = cards.nth(2);
  const clickSourceBox = await clickSource.boundingBox();
  await blank.page.mouse.move(clickSourceBox.x + clickSourceBox.width / 2, clickSourceBox.y + clickSourceBox.height / 2);
  const clickPort = clickSource.locator(".sd-port.is-right.is-visible");
  await clickPort.waitFor({ state: "visible" });
  await clickPort.click();
  await clickSource.locator(".sd-port.is-armed").waitFor({ state: "visible" });
  const clickTargetBox = await clickTarget.boundingBox();
  await blank.page.mouse.click(clickTargetBox.x + clickTargetBox.width / 2, clickTargetBox.y + clickTargetBox.height / 2);
  await blank.page.waitForFunction(() => document.querySelectorAll(".sd-edge").length === 2);
  console.log("PASS: port drag-to-card and click-port-to-card create single orthogonal connectors without resizing nodes.");

  // Port-to-port: hover the destination after arming the source; this exposes
  // its port without requiring a precise initial drop on the dot.
  await blank.page.keyboard.press("Escape");
  const portPoolSource = cards.nth(2);
  const portPoolTarget = cards.nth(3);
  const portPoolTargetBox = await portPoolTarget.boundingBox();
  const portPoolSourceBox = await portPoolSource.boundingBox();
  await blank.page.mouse.move(portPoolSourceBox.x + portPoolSourceBox.width / 2, portPoolSourceBox.y + portPoolSourceBox.height / 2);
  const portPoolFrom = portPoolSource.locator(".sd-port.is-right.is-visible");
  await portPoolFrom.waitFor({ state: "visible" });
  await portPoolFrom.click();
  await portPoolSource.locator(".sd-port.is-armed").waitFor({ state: "visible" });
  await blank.page.mouse.move(portPoolTargetBox.x + portPoolTargetBox.width / 2, portPoolTargetBox.y + portPoolTargetBox.height / 2);
  const portPoolTo = portPoolTarget.locator(".sd-port.is-left.is-visible");
  await portPoolTo.waitFor({ state: "visible" });
  await portPoolTo.click();
  await blank.page.waitForFunction(() => document.querySelectorAll(".sd-edge").length === 3);
  console.log("PASS: click-port-to-click-port creates a single orthogonal connector.");

  // Return the pointer to the card body so its hover target is unambiguous
  // after leaving the port button, then exercise the keyboard connect mode.
  await blank.page.mouse.move(portPoolTargetBox.x + portPoolTargetBox.width / 2, portPoolTargetBox.y + portPoolTargetBox.height / 2);
  await portPoolTarget.locator(".sd-port.is-visible").first().waitFor({ state: "visible" });
  // C uses the hovered destination node (or a selected node) as the source
  // and connects it to the next card without requiring a visible port click.
  await blank.page.keyboard.press("c");
  const portPoolTargetId = await portPoolTarget.getAttribute("data-node-id");
  await blank.page.waitForFunction((id) =>
    document.querySelector(`.sd-node[data-node-id="${id}"]`)?.classList.contains("is-connect-armed"),
  portPoolTargetId);
  await blank.page.mouse.click(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await blank.page.waitForFunction(() => document.querySelectorAll(".sd-edge").length === 4);
  console.log("PASS: C arms the hovered/selected node and connects it to the next clicked card.");


  // The floating header may collapse after canvas interaction; reveal it with
  // the same keyboard shortcut users have before opening header-only actions.
  await ensureHeaderVisible(blank.page);

  const aiToggle = blank.page.getByRole("button", { name: "AI Ask", exact: true });
  const railToggle = blank.page.locator(".desktop-app-header-reveal-handle");
  const aiDrawer = blank.page.locator(".ai-ask-panel");
  const rail = blank.page.locator(".desktop-app-header-right-rail");
  await aiToggle.click();
  await aiDrawer.waitFor();
  await blank.page.waitForFunction(() => {
    const sliders = document.querySelector(".desktop-app-header-reveal-handle")?.getBoundingClientRect();
    const tools = document.querySelector(".desktop-app-header-right-rail")?.getBoundingClientRect();
    return sliders && tools && tools.top >= sliders.bottom - 1;
  });
  const [ai, sliders, tools, drawer] = await Promise.all(
    [aiToggle, railToggle, rail, aiDrawer].map((control) => control.boundingBox()),
  );
  if (!ai || !sliders || !tools || !drawer ||
      Math.abs(ai.y + ai.height / 2 - sliders.y - sliders.height / 2) > 2 ||
      sliders.y + sliders.height > tools.y + 1 ||
      // The 34px settings toggle and 40px rail have a small intentional center offset.
      Math.abs(sliders.x + sliders.width / 2 - tools.x - tools.width / 2) > 6 ||
      tools.x + tools.width > drawer.x || sliders.x + sliders.width > drawer.x ||
      ai.x + ai.width > drawer.x) {
    throw new Error(`AI and sliders must share the top control row, with the tool rail below and all controls beside the drawer: ${JSON.stringify({ ai, sliders, tools, drawer })}`);
  }
  // The utility-rail reveal handle toggles the legacy header rail. Verify
  // both states directly instead of looking for the retired Canvas settings
  // popover that no longer exists in the current header implementation.
  await railToggle.click();
  await blank.page.waitForFunction(() =>
    document.querySelector(".desktop-app-header-reveal-handle")?.getAttribute("aria-expanded") === "false" &&
    document.querySelector(".desktop-app-header")?.getAttribute("aria-hidden") === "true",
  );
  await railToggle.click();
  await blank.page.waitForFunction(() =>
    document.querySelector(".desktop-app-header-reveal-handle")?.getAttribute("aria-expanded") === "true" &&
    document.querySelector(".desktop-app-header")?.getAttribute("aria-hidden") === "false",
  );
  await rail.waitFor({ state: "visible" });
  await aiToggle.click();
  await aiDrawer.waitFor({ state: "detached" });
  console.log("PASS: AI and header controls remain independently clickable beside the open drawer.");

  // Unified selector replaces the old category menu and AWS/K8s shortcuts.
  await blank.page.getByRole("button", { name: "Open icon library" }).click();
  await blank.page.locator(".ai-ask-panel").waitFor({ state: "detached" });
  const library = blank.page.getByRole("dialog", { name: "Icon Library" });
  await library.waitFor();
  const compactLayout = await library.evaluate((panel) => {
    const selector = panel.querySelector(".sk-unified-category-select");
    const rect = panel.getBoundingClientRect();
    return {
      width: rect.width, height: rect.height,
      selectorVisible: !!selector && getComputedStyle(selector).display !== "none",
      selectorHeight: selector?.getBoundingClientRect().height ?? 0,
      redundantChips: panel.querySelectorAll(".sk-catalog-tabs .sk-catalog-tab").length,
    };
  });
  if (compactLayout.width > 322 || compactLayout.height > 462 ||
    compactLayout.width < 270 || compactLayout.height < 260 ||
    !compactLayout.selectorVisible || compactLayout.selectorHeight > 42 ||
    compactLayout.redundantChips !== 0) {
    throw new Error(`Icon Library is not compact: ${JSON.stringify(compactLayout)}`);
  }
  const category = library.getByRole("combobox", { name: "Icon category" });
  for (const value of ["aws", "kubernetes", "networking", "uml", "eraser", "all"]) {
    await category.selectOption(value);
    if (await category.inputValue() !== value) {
      throw new Error(`Category selection failed: ${value}`);
    }
  }
  await category.selectOption("aws");
  const awsCategory = await category.locator('option[value^="aws:"]').first().getAttribute("value");
  if (!awsCategory) throw new Error("AWS subcategories missing");
  await category.selectOption(awsCategory);
  if (await category.inputValue() !== awsCategory) throw new Error("AWS subcategory selection failed");
  await category.selectOption("all");
  console.log("PASS: unified icon category selector switches catalogs and subcategories.");

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
    const control = panel.querySelector('select[aria-label="Icon category"]');
    const describe = (element) => element && ({
      tag: element.tagName,
      id: element.id || null,
      className: typeof element.className === "string" ? element.className : null,
      pointerEvents: getComputedStyle(element).pointerEvents,
      zIndex: getComputedStyle(element).zIndex,
    });
    if (!control) return { clickable: false, reason: "Category selector missing" };
    const rect = control.getBoundingClientRect();
    const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      clickable: atPoint === control || control.contains(atPoint),
      coveredBy: describe(atPoint),
      control: describe(control),
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      viewport: [window.innerWidth, window.innerHeight],
    };
  });
  if (!mobileHitTest.clickable) throw new Error(`Icon category selector is covered at phone width: ${JSON.stringify(mobileHitTest)}`);
  await category.selectOption("networking");
  await category.selectOption("all");
  await blank.page.setViewportSize({ width: 1280, height: 800 });
  await library.getByRole("button", { name: "Close icon library" }).click();
  console.log("PASS: 320×460 library, unified category dropdown, compact text, list/grid, and phone containment.");

  // Coarse square grid spans the entire editor. Fine squares form a
  // content-bound RECTANGLE that stays put on hover, zoom and pan.
  // Isolate drawing interactions from unrelated smoke checks.
  const gridSession = await makePage({ width: 1280, height: 800 });
  await gridSession.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await dismissStartupChooser(gridSession.page);
  await gridSession.page.getByRole("button", { name: "Create new tab" }).click();
  await gridSession.page.locator(".excalidraw").waitFor({ timeout: 30000 });
  const drawingTools = gridSession.page.getByRole("navigation", { name: "Drawing tools" });
  // The dock has grouped parent slots and nested child rails. Open Shapes by
  // hovering its parent, then select Bucket Fill from the Shapes tools rail.
  await drawingTools.locator(".sketchizi-tool-sidebar-active").hover();
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".sketchizi-tool-sidebar")?.classList.contains("is-expanded"),
  );
  await drawingTools.locator('.tool-slot[data-slot="shapes"] > .sketchizi-tool-sidebar-button').hover();
  const shapesRail = drawingTools.getByRole("toolbar", { name: "Shapes tools" });
  await shapesRail.waitFor({ state: "visible", timeout: 10000 });
  await shapesRail.getByRole("button", { name: "Bucket Fill", exact: true }).click();
  await drawingTools.getByRole("button", { name: /Bucket Fill/, exact: false, pressed: true }).waitFor();
  await gridSession.page.waitForFunction(() =>
    !document.querySelector(".sketchizi-tool-sidebar")?.classList.contains("is-expanded"),
  );

  // Re-open the dock and use the Selection child rail to return to Select.
  await drawingTools.locator(".sketchizi-tool-sidebar-active").hover();
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".sketchizi-tool-sidebar")?.classList.contains("is-expanded"),
  );
  await drawingTools.locator('.tool-slot[data-slot="selection"] > .sketchizi-tool-sidebar-button').hover();
  const selectionRail = drawingTools.getByRole("toolbar", { name: "Select tools" });
  await selectionRail.waitFor({ state: "visible", timeout: 10000 });
  await selectionRail.getByRole("button", { name: "Select", exact: true }).click();
  await drawingTools.getByRole("button", { name: /Select/, exact: false, pressed: true }).waitFor();
  await gridSession.page.waitForFunction(() =>
    !document.querySelector(".sketchizi-tool-sidebar")?.classList.contains("is-expanded"),
  );
  console.log("PASS: nested dock rails open and Bucket Fill/Select tools activate.");
  const focusGrid = gridSession.page.locator(".desktop-canvas-region .sketchizi-grid-spotlight");
  await focusGrid.waitFor({ state: "attached", timeout: 12000 });
  // Normalize the UI state so the OFF assertion tests the toggle, not a saved default.
  await ensureHeaderVisible(gridSession.page);
  await gridSession.page.getByRole("button", { name: "Canvas style" }).click();
  const initialPatternSwitch = gridSession.page.getByRole("dialog", { name: "Canvas style" })
    .getByRole("switch", { name: "Show pattern" });
  if (await initialPatternSwitch.getAttribute("aria-checked") === "true") {
    await initialPatternSwitch.click();
  }
  await gridSession.page.getByRole("button", { name: "Canvas style" }).click();
  const canvasLocator = gridSession.page.locator(".desktop-canvas-region .desktop-canvas-view .canvas");
  const sceneBounds = await canvasLocator.boundingBox();
  if (!sceneBounds?.width || !sceneBounds?.height) throw new Error("Editor canvas has no viewport");
  const readGrid = () => focusGrid.evaluate((node) => {
    const base = getComputedStyle(node, "::before");
    const detail = getComputedStyle(node, "::after");
    const style = getComputedStyle(node);
    const root = document.querySelector(".desktop-canvas-region .desktop-canvas-view .canvas");
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
  // Grid visibility is controlled from the header, not the View menu.
  await ensureHeaderVisible(gridSession.page);
  await gridSession.page.getByRole("button", { name: "Canvas style" }).click();
  const gridToggle = gridSession.page.getByRole("dialog", { name: "Canvas style" })
    .getByRole("switch", { name: "Show pattern" });
  if (await gridToggle.getAttribute("aria-checked") !== "true") {
    await gridToggle.click();
  }
  await gridSession.page.getByRole("button", { name: "Canvas style" }).click();
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".desktop-canvas-region .sketchizi-grid-spotlight")?.classList.contains("is-grid-enabled"),
  );
  // Legacy content-bound assertions require Focus (Local), not the new default.
  await gridSession.page.getByRole("button", { name: "Canvas style" }).click();
  const gridSettings = gridSession.page.getByRole("dialog", { name: "Canvas style" });
  await gridSettings.getByRole("button", { name: /Local Focus/ }).click();
  await gridSession.page.getByRole("button", { name: "Canvas style" }).click();
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".desktop-canvas-region .sketchizi-grid-spotlight")?.classList.contains("is-local-style"),
  );
  const empty = await readGrid();
  const gridWidthMatchesCanvas = Math.abs(parseFloat(empty.baseWidth) - empty.canvasWidth) <= 2;
  const gridHeightMatchesCanvas = Math.abs(parseFloat(empty.baseHeight) - empty.canvasHeight) <= 2;
  if (!empty.enabled || empty.display === "none" || empty.active || empty.detailOpacity > 0.01 ||
      empty.pointerEvents !== "none" || empty.canvasBackground !== "none" ||
      !twoLines(empty.baseImage) || !gridWidthMatchesCanvas || !gridHeightMatchesCanvas ||
      !empty.coarseSize || empty.coarseSize <= 0) {
    throw new Error(`Coarse grid must fill an idle canvas without fine detail: ${JSON.stringify(empty)}`);
  }
  // Select Excalidraw's actual rectangle tool; a keyboard shortcut can
  // be ignored if another UI control still owns focus.
  await gridSession.page.mouse.click(x, y);
  await gridSession.page.keyboard.press("r");
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
  await gridSession.page.keyboard.press("v");
  await gridSession.page.mouse.click(x - 120, y - 100);
  await gridSession.page.keyboard.press("g");
  await focusGrid.waitFor({ state: "hidden" });
  const disabledWithContent = await readGrid();
  if (disabledWithContent.active || disabledWithContent.display !== "none") {
    throw new Error(`G must hide both pattern layers with drawing content: ${JSON.stringify(disabledWithContent)}`);
  }
  await gridSession.page.keyboard.press("g");
  await focusGrid.waitFor({ state: "visible" });
  await gridSession.page.waitForFunction(() =>
    document.querySelector(".desktop-canvas-region .sketchizi-grid-spotlight")?.classList.contains("has-focus"),
  );
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
      left: rect.left,
      right: rect.right,
      dockTop: dockRect.top,
      dockBottom: dockRect.bottom,
      dockLeft: dockRect.left,
      dockRight: dockRect.right,
      overlapsDock: rect.left < dockRect.right && rect.right > dockRect.left &&
        rect.top < dockRect.bottom && rect.bottom > dockRect.top,
      viewportWidth: window.innerWidth,
    };
    toast.remove();
    return layout;
  });
  if (!toastLayout || toastLayout.position !== "fixed" ||
    toastLayout.overlapsDock ||
    toastLayout.left < 0 || toastLayout.right > toastLayout.viewportWidth) {
    throw new Error(`Clipboard notification overlaps the drawing toolbar: ${JSON.stringify(toastLayout)}`);
  }
  console.log("PASS: native Excalidraw clipboard notification clears the drawing toolbar.");

  // Advanced work remains accessible without crowding the main drawing UI.
  await blank.page.getByRole("button", { name: "Canvas options" }).click();
  await blank.page.getByRole("button", { name: /Export studio/ }).click();
  await blank.page.getByRole("dialog", { name: "Export Studio" }).waitFor({ timeout: 10000 });
  await blank.page.getByRole("button", { name: "Close export studio" }).click();
  console.log("PASS: Export Studio remains reachable from the save menu.");



  // Exercise the creation screen in a narrow desktop / mobile-sized viewport.
  const responsive = await makePage({ width: 390, height: 844 });
  await responsive.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await dismissStartupChooser(responsive.page);
  await openDesignStudio(responsive.page);
  await responsive.page.getByRole("button", { name: "Start blank" }).waitFor();
  const overflow = await responsive.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("Creation screen has horizontal overflow at 390px viewport width.");
  console.log("PASS: creation screen remains usable at 390px without horizontal overflow.");

  // Sign-in is a centered modal, not a popup clipped by the header.
  // Stub only the current-user endpoint to keep the layout smoke independent
  // from optional authentication backend availability.
  const authLayout = await makePage({ width: 1280, height: 800 });
  await authLayout.page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: false, user: null }),
  }));
  await authLayout.page.goto(`${baseURL}/?editor=1`, { waitUntil: "networkidle", timeout: 60000 });
  await dismissStartupChooser(authLayout.page);
  await ensureHeaderVisible(authLayout.page);
  const aiAskToggle = authLayout.page.getByRole("button", { name: "AI Ask", exact: true });
  if (await aiAskToggle.getAttribute("aria-expanded") === "true") await aiAskToggle.click({ force: true });
  await authLayout.page.waitForFunction(() => !document.querySelector(".app")?.classList.contains("ai-ask-open"));
  await authLayout.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await authLayout.page.getByRole("dialog", { name: "Sign in to Sketchizi" }).waitFor();

  const verifyAuthDialogCentered = async (page) => {
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector(".auth-dialog");
      const backdrop = document.querySelector(".auth-dialog-backdrop");
      if (!dialog || !backdrop) return null;
      const rect = dialog.getBoundingClientRect();
      return {
        portalled: backdrop.parentElement === document.body,
        dx: Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2),
        dy: Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2),
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
  await authLayout.page.getByRole("button", { name: "Close sign-in dialog" }).click();
  await authLayout.page.getByRole("dialog", { name: "Sign in to Sketchizi" }).waitFor({ state: "detached" });

  const cloudTabs = await makePage({ width: 1280, height: 800 });
  const diagrams = ["First cloud drawing", "Second cloud drawing"].map((name, index) => ({
    id: `cloud-${index + 1}`,
    name,
    projectId: "test-project",
    revision: 1,
    format: "excalidraw",
    document: { elements: [], appState: {}, files: {} },
  }));
  await cloudTabs.page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const diagram = diagrams.find(({ id }) => pathname === `/api/workspace/diagrams/${id}`);
    if (diagram) return route.fulfill({ json: diagram });
    const responses = {
      "/api/auth/me": { authenticated: true, user: { name: "Workspace smoke" } },
      "/api/auth/csrf": { token: "test-token", headerName: "X-CSRF-Token" },
      "/api/workspace/limits": { diagramCount: 2, diagramLimit: 3 },
      "/api/workspace/projects": [{ id: "test-project", name: "Smoke project" }],
      "/api/workspace/projects/test-project/diagrams": diagrams,
    };
    await route.fulfill({ json: responses[pathname] ?? {} });
  });
  await cloudTabs.page.goto(`${baseURL}/?editor=1&cloudDiagramId=cloud-1&cloudProjectId=test-project`);
  const firstCloudTab = cloudTabs.page.getByRole("tab").and(cloudTabs.page.getByTitle(diagrams[0].name, { exact: true }));
  const secondCloudTab = cloudTabs.page.getByRole("tab").and(cloudTabs.page.getByTitle(diagrams[1].name, { exact: true }));
  await firstCloudTab.waitFor();
  await cloudTabs.page.getByRole("button", { name: "Open application menu" }).click();
  await cloudTabs.page.getByRole("button", { name: "Cloud Files", exact: true }).click();
  await cloudTabs.page.locator(`[data-chapter-id="${diagrams[1].id}"]`)
    .getByRole("button", { name: "Open", exact: true }).click();
  await secondCloudTab.waitFor();
  await firstCloudTab.click();
  // These are clean, already-loaded cloud documents. No save is expected until
  // the user edits them, so waiting for a "Saved" status here is a false
  // persistence assertion and times out on both main and feature branches.
  if (await firstCloudTab.getAttribute("aria-selected") !== "true" ||
      await cloudTabs.page.getByRole("tab").count() !== 2) {
    throw new Error("Opening a second Workspace drawing must keep both cloud tabs without an empty local canvas.");
  }
  await secondCloudTab.click();
  if (await secondCloudTab.getAttribute("aria-selected") !== "true") {
    throw new Error("The second drawing must remain selectable as a cloud tab.");
  }
  await cloudTabs.context.close();
  console.log("PASS: opening a second Workspace drawing preserves both cloud tabs.");

  if (errors.length) throw new Error(`Browser console exceptions: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
