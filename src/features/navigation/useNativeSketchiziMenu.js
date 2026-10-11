import { useEffect } from "react";
import {
  CANVAS_BACKGROUND_COLORS,
  CANVAS_BACKGROUND_PATTERNS,
  normalizeHexColor,
} from "./canvasBackgroundOptions.js";

const REVIEW_URL = "https://github.com/codebuffdev";
const BACKGROUND_POPOVER_ID = "sketchizi-canvas-background-popover";

const gitBranchIcon = `<svg data-sketchizi-git-icon="true" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 6v12M8 18c6 0 10-4 10-9"/></svg>`;
const icon = (name) => {
  const paths = {
    folder: `<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>`,
    file: `<path d="M6 3.5h8l4 4V20H6z"/><path d="M14 3.5v5h4"/>`,
    newFile: `<path d="M6 3.5h8l4 4V12M14 3.5v5h4M6 3.5V20h7M17.5 16v6M14.5 19h6"/>`,
    clock: `<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>`,
    palette: `<path d="M12 3a9 9 0 1 0 0 18h1.1a2 2 0 0 0 1.4-3.4c-.8-.8-.2-2.1.9-2.1h1.1A4.5 4.5 0 0 0 21 11C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>`,
    chevron: `<path d="m6 9 6 6 6-6"/>`,
    refresh: `<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/>`,
    trash: `<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7"/>`,
    save: `<path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/>`,
    image: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 3-4 5 6"/>`,
    search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>`,
    reset: `<path d="M4 8V3m0 5h5M4.5 8A8 8 0 1 1 4 15"/>`,
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
};

function escapeHtml(value) {
  return String(value).replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
  }[character]));
}

function exactLeafText(root, text) {
  return [...root.querySelectorAll("*")].find((node) =>
    node.children.length === 0
      && node.textContent?.replace(/\s+/g, " ").trim() === text
      && !node.closest(`[data-sketchizi-custom-menu-block], #${BACKGROUND_POPOVER_ID}`)
  );
}

function renderBackgroundPopover() {
  const colors = CANVAS_BACKGROUND_COLORS.map(({ name, value }) =>
    `<button type="button" class="sketchizi-bg-swatch" data-bg-color="${value}" title="${name}" aria-label="${name}" style="--swatch-color:${value}" aria-pressed="false"><span></span></button>`
  ).join("");
  const patterns = CANVAS_BACKGROUND_PATTERNS.map(({ id, name }) =>
    `<button type="button" class="sketchizi-bg-pattern" data-bg-pattern="${id}" aria-pressed="${id === "solid"}" title="${name}"><span class="sketchizi-bg-pattern-preview pattern-${id}"></span><span>${name}</span></button>`
  ).join("");
  return `<section id="${BACKGROUND_POPOVER_ID}" class="sketchizi-bg-popover" role="dialog" aria-label="Canvas background settings" hidden>
    <header class="sketchizi-bg-popover-header"><span>${icon("palette")}<strong>Canvas background</strong></span><button type="button" class="sketchizi-bg-close" data-bg-action="close" aria-label="Close background settings">×</button></header>
    <div class="sketchizi-bg-tabs" role="tablist" aria-label="Background options">
      <button type="button" role="tab" data-bg-tab="colors" aria-selected="true">Color</button>
      <button type="button" role="tab" data-bg-tab="patterns" aria-selected="false">Patterns</button>
      <button type="button" role="tab" data-bg-tab="custom" aria-selected="false">Custom</button>
    </div>
    <section class="sketchizi-bg-panel" data-bg-panel="colors"><div class="sketchizi-bg-section-title">Solid colors</div><div class="sketchizi-bg-swatches">${colors}</div></section>
    <section class="sketchizi-bg-panel" data-bg-panel="patterns" hidden><div class="sketchizi-bg-section-title">Canvas patterns</div><div class="sketchizi-bg-patterns">${patterns}</div><p class="sketchizi-bg-note">Patterns are visual workspace guides and are not included in exports.</p></section>
    <section class="sketchizi-bg-panel" data-bg-panel="custom" hidden><div class="sketchizi-bg-section-title">Custom color</div><div class="sketchizi-bg-custom-row"><input type="color" data-bg-color-picker value="#7c3aed" aria-label="Choose custom canvas color"><input type="text" data-bg-hex value="#7c3aed" inputmode="text" maxlength="7" aria-label="Custom canvas hex color" spellcheck="false"><button type="button" data-bg-apply-hex>Apply</button></div><p class="sketchizi-bg-note">Enter a 3- or 6-digit hex color.</p></section>
    <section class="sketchizi-bg-theme"><div class="sketchizi-bg-section-title">Theme options</div>
      <button type="button" data-bg-mode="theme" aria-pressed="true"><span class="sketchizi-bg-radio"></span><span><strong>Use theme default</strong><small>Follow application theme</small></span></button>
      <button type="button" data-bg-mode="light" aria-pressed="false"><span class="sketchizi-bg-radio"></span><span><strong>Light canvas</strong><small>Always light</small></span></button>
      <button type="button" data-bg-mode="dark" aria-pressed="false"><span class="sketchizi-bg-radio"></span><span><strong>Dark canvas</strong><small>Always dark</small></span></button>
    </section>
  </section>`;
}

export function useNativeSketchiziMenu({
  fileActionsRef,
  apiRef,
  currentFolder,
  currentFolderFiles,
  recentFiles,
  recentFolders,
  refreshCurrentFolderFiles,
  handleFileError,
  useThemeDefaultBackground = () => {},
  setCanvasBackgroundModePreference = () => {},
  applyCanvasBackgroundColor = () => {},
  canvasBackgroundPattern = "solid",
  setCanvasBackgroundPattern = () => {},
  markCanvasBackgroundCustom = () => {},
}) {
  useEffect(() => {
    const closePopover = () => {
      const popover = document.getElementById(BACKGROUND_POPOVER_ID);
      if (popover) popover.hidden = true;
      document.querySelectorAll("[data-sketchizi-background-trigger]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
    };
    const syncPopover = () => {
      const popover = document.getElementById(BACKGROUND_POPOVER_ID);
      if (!popover || popover.hidden) return;
      const state = apiRef?.current?.getAppState?.();
      const currentColor = normalizeHexColor(String(state?.viewBackgroundColor || "#ffffff")) || "#ffffff";
      popover.querySelectorAll("[data-bg-color]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.bgColor === currentColor)));
      popover.querySelectorAll("[data-bg-pattern]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.bgPattern === canvasBackgroundPattern)));
      const mode = localStorageSafeGet("sketchizi-canvas-background-mode") || "theme";
      popover.querySelectorAll("[data-bg-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.bgMode === mode)));
      const colorPicker = popover.querySelector("[data-bg-color-picker]");
      const hexField = popover.querySelector("[data-bg-hex]");
      if (colorPicker) colorPicker.value = currentColor;
      if (hexField) hexField.value = currentColor;
    };
    const positionPopover = (trigger) => {
      const popover = document.getElementById(BACKGROUND_POPOVER_ID);
      if (!popover) return;
      popover.hidden = false;
      popover.style.position = "fixed";
      popover.style.zIndex = "10050";
      popover.style.width = "min(380px, calc(100vw - 20px))";
      popover.style.maxHeight = "calc(100dvh - 20px)";
      popover.style.overflowY = "auto";
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 20);
      const estimatedHeight = Math.min(popover.scrollHeight || 570, window.innerHeight - 20);
      let left = rect.right + 10;
      if (left + width > window.innerWidth - 8) left = rect.left - width - 10;
      if (left < 8) left = Math.max(8, window.innerWidth - width - 8);
      const top = Math.min(Math.max(10, rect.top), Math.max(10, window.innerHeight - estimatedHeight - 10));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      trigger.setAttribute("aria-expanded", "true");
      syncPopover();
    };
    const applyHexField = () => {
      const popover = document.getElementById(BACKGROUND_POPOVER_ID);
      const field = popover?.querySelector("[data-bg-hex]");
      const normalized = normalizeHexColor(field?.value);
      if (!normalized) {
        field?.setAttribute("aria-invalid", "true");
        return;
      }
      field?.removeAttribute("aria-invalid");
      const colorPicker = popover.querySelector("[data-bg-color-picker]");
      if (colorPicker) colorPicker.value = normalized;
      applyCanvasBackgroundColor(normalized);
      syncPopover();
    };

    const onClick = (event) => {
      const rawTarget = event.target;
      if (!(rawTarget instanceof Element)) return;
      const target = rawTarget.closest('button, [role="button"], [role="menuitem"], a, [data-testid]');
      const popover = document.getElementById(BACKGROUND_POPOVER_ID);
      const trigger = rawTarget.closest("[data-sketchizi-background-trigger]");
      const clickedInsidePopover = Boolean(rawTarget.closest(`#${BACKGROUND_POPOVER_ID}`));
      if (!trigger && popover && !popover.hidden && !clickedInsidePopover) closePopover();
      if (!target) {
        if (clickedInsidePopover) event.stopPropagation();
        return;
      }

      if (target.matches("[data-sketchizi-background-trigger]")) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
        const panel = document.getElementById(BACKGROUND_POPOVER_ID);
        if (panel && !panel.hidden) closePopover();
        else positionPopover(target);
        return;
      }

      if (target.closest(`#${BACKGROUND_POPOVER_ID}`)) {
        const tab = target.closest("[data-bg-tab]");
        if (tab) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
          const panel = document.getElementById(BACKGROUND_POPOVER_ID);
          panel.querySelectorAll("[data-bg-tab]").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
          panel.querySelectorAll("[data-bg-panel]").forEach((section) => { section.hidden = section.dataset.bgPanel !== tab.dataset.bgTab; });
          return;
        }
        if (target.matches("[data-bg-action='close']")) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); closePopover(); return;
        }
        const color = target.closest("[data-bg-color]");
        if (color) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
          applyCanvasBackgroundColor(color.dataset.bgColor); syncPopover(); return;
        }
        const pattern = target.closest("[data-bg-pattern]");
        if (pattern) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
          setCanvasBackgroundPattern(pattern.dataset.bgPattern); syncPopover(); return;
        }
        const mode = target.closest("[data-bg-mode]");
        if (mode) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
          if (mode.dataset.bgMode === "theme") useThemeDefaultBackground();
          else setCanvasBackgroundModePreference(mode.dataset.bgMode);
          syncPopover(); return;
        }
        if (target.matches("[data-bg-apply-hex]")) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); applyHexField(); return;
        }
        // Keep controls in this floating popover from dismissing Excalidraw's menu.
        event.stopPropagation();
        return;
      }

      const menu = target.closest?.(".dropdown-menu-container");
      const buttonStyle = target.tagName === "BUTTON" ? target.style : null;
      const classText = typeof target.className === "string" ? target.className : "";
      const swatchLike = /color-picker|color-swatch|background-swatch/i.test(classText)
        || Boolean(buttonStyle?.backgroundColor)
        || /color/i.test(`${target.getAttribute?.("aria-label") || ""} ${target.getAttribute?.("data-testid") || ""}`);
      if (menu && swatchLike && [...menu.querySelectorAll("*")].some((node) => node.children.length === 0 && node.textContent?.replace(/\s+/g, " ").trim() === "Canvas background")) {
        markCanvasBackgroundCustom();
      }
      if (target.matches("summary") && target.closest("[data-sketchizi-custom-menu-block]")) {
        event.stopPropagation();
        return;
      }
      const testId = target.getAttribute?.("data-testid");
      const text = target.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      const inMenu = Boolean(target.closest?.(".dropdown-menu, [class*='dropdown-menu']"));
      let action = null;
      if (target.matches("[data-sketchizi-open-folder]")) action = "openFolderFromDisk";
      else if (target.matches("[data-sketchizi-open-file]")) action = "openDrawingFromDisk";
      else if (target.matches("[data-sketchizi-close-folder]")) action = "closeCurrentFolder";
      else if (target.matches("[data-sketchizi-new-file]")) action = "createNewFile";
      else if (testId === "load-button" || (inMenu && /^open(\s|$)/.test(text) && text.length < 32)) action = "openDrawingFromDisk";
      else if (testId === "json-export-button" || (inMenu && /^save to\.\.\./.test(text))) action = "saveDrawingAs";
      if (!action) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      fileActionsRef.current[action]?.();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        const popover = document.getElementById(BACKGROUND_POPOVER_ID);
        if (popover && !popover.hidden) { event.preventDefault(); closePopover(); return; }
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable;
      if (typing && (!event.target.closest?.(".excalidraw") || key === "n")) return;
      if (key === "o" && !event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); fileActionsRef.current.openDrawingFromDisk?.();
      } else if (key === "s") {
        event.preventDefault(); event.stopPropagation();
        if (event.shiftKey) fileActionsRef.current.saveDrawingAs?.();
        else fileActionsRef.current.saveCurrentDrawing?.();
      } else if (key === "n" && !event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); fileActionsRef.current.createNewFile?.();
      }
    };
    const onPopoverInput = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.closest(`#${BACKGROUND_POPOVER_ID}`)) return;
      if (target.matches("[data-bg-color-picker]")) {
        const value = normalizeHexColor(target.value);
        const field = document.querySelector(`#${BACKGROUND_POPOVER_ID} [data-bg-hex]`);
        if (field) field.value = value || target.value;
        applyCanvasBackgroundColor(value || target.value);
        field?.removeAttribute("aria-invalid");
      } else if (target.matches("[data-bg-hex]")) {
        const normalized = normalizeHexColor(target.value);
        if (normalized) {
          target.removeAttribute("aria-invalid");
          const picker = document.querySelector(`#${BACKGROUND_POPOVER_ID} [data-bg-color-picker]`);
          if (picker) picker.value = normalized;
          applyCanvasBackgroundColor(normalized);
        } else if (target.value.length >= 4 && target.value.length !== 5) {
          target.setAttribute("aria-invalid", "true");
        }
      }
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onPopoverInput, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", closePopover);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onPopoverInput, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", closePopover);
    };
  }, [apiRef, applyCanvasBackgroundColor, canvasBackgroundPattern, fileActionsRef, markCanvasBackgroundCustom, setCanvasBackgroundModePreference, setCanvasBackgroundPattern, useThemeDefaultBackground]);

  useEffect(() => {
    let frame = 0;
    const replaceExactTextNode = (root, from, to) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current;
      while ((current = walker.nextNode())) {
        if (current.nodeValue?.trim() === from) {
          current.nodeValue = to;
          return true;
        }
      }
      return false;
    };
    const bind = (node, key, handler) => {
      if (!node || node.dataset[key] === "true") return;
      node.dataset[key] = "true";
      node.addEventListener("click", handler);
    };
    const constrainMenu = (container) => {
      if (!container) return;
      const dropdown = container.closest?.(".dropdown-menu");
      const top = Math.max(0, container.getBoundingClientRect().top);
      const availableHeight = Math.max(1, Math.floor(window.innerHeight - top - 12));
      if (dropdown) {
        dropdown.style.setProperty("max-height", "none", "important");
        dropdown.style.setProperty("overflow", "visible", "important");
      }
      container.style.setProperty("box-sizing", "border-box", "important");
      container.style.setProperty("height", "auto", "important");
      container.style.setProperty("min-height", "0", "important");
      container.style.setProperty("max-height", `${availableHeight}px`, "important");
      container.style.setProperty("overflow-x", "hidden", "important");
      container.style.setProperty("overflow-y", "auto", "important");
      container.style.setProperty("overscroll-behavior-y", "contain", "important");
      container.style.setProperty("-webkit-overflow-scrolling", "touch", "important");
    };
    const findNativeBackgroundLabel = () => {
      return [...document.querySelectorAll("body *")].find((node) =>
        node.children.length === 0
          && node.textContent?.replace(/\s+/g, " ").trim() === "Canvas background"
          && !node.closest(`[data-sketchizi-custom-menu-block], #${BACKGROUND_POPOVER_ID}`)
      );
    };

    const cleanNativeMenu = () => {
      frame = 0;
      document.querySelectorAll("body a").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (["GitHub", "Connect with Coder", "Drop a Review"].includes(text)) {
          node.href = REVIEW_URL;
          node.target = "_blank";
          node.rel = "noreferrer noopener";
          node.classList.add("sketchizi-drop-review-link");
          if (text !== "Drop a Review") replaceExactTextNode(node, text, "Drop a Review");
          if (!node.querySelector("[data-sketchizi-git-icon]")) node.insertAdjacentHTML("afterbegin", gitBranchIcon);
        } else if (text === "Follow us" || text === "Discord chat") {
          (node.closest("li, .dropdown-menu-item, .context-menu-item, .menu-item") || node).remove();
        }
      });

      document.querySelectorAll(".dropdown-menu-container").forEach((menu) => {
        const leaves = [...menu.querySelectorAll("*")].filter((node) => node.children.length === 0);
        const helpLabel = leaves.find((node) => node.textContent?.replace(/\s+/g, " ").trim().toLowerCase() === "help");
        if (helpLabel) {
          const item = helpLabel.closest("li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item, button, a") || helpLabel.parentElement;
          if (item && item !== menu) item.remove();
        }
        const openLabel = leaves.find((node) => node.textContent?.replace(/\s+/g, " ").trim() === "Open");
        if (openLabel) {
          const item = openLabel.closest("li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item, button, a") || openLabel.parentElement;
          if (item && item !== menu) replaceExactTextNode(item, "Open", "Open file");
        }
      });
      document.querySelectorAll("body *").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text === "Excalidraw links" && node.children.length === 0) node.remove();
        if ((node.tagName === "BUTTON" || node.getAttribute?.("role") === "button") && text === "Install") node.remove();
      });

      const menuParent = [...document.querySelectorAll(".dropdown-menu-container")].find((node) =>
        node.querySelector('[data-testid="load-button"], [data-testid="json-export-button"]')
        && node.querySelectorAll("[data-testid='load-button']").length
      );
      if (!menuParent) return;

      const nativeOpen = menuParent.querySelector('[data-testid="load-button"]');
      if (nativeOpen) {
        const nativeOpenItem = nativeOpen.closest("li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item") || nativeOpen;
        if (nativeOpenItem !== menuParent) nativeOpenItem.dataset.sketchiziHiddenNativeOpenFile = "true";
      }

      let customBlock = menuParent.querySelector(":scope > [data-sketchizi-custom-menu-block]");
      if (!customBlock) {
        customBlock = document.createElement("div");
        customBlock.dataset.sketchiziCustomMenuBlock = "true";
        customBlock.innerHTML = `<div class="sketchizi-file-open-actions" aria-label="Open or create files">
            <button type="button" class="sketchizi-file-action" data-sketchizi-open-folder>${icon("folder")}<span>Open folder…</span></button>
            <button type="button" class="sketchizi-file-action" data-sketchizi-open-file>${icon("file")}<span>Open file…</span><kbd>Ctrl+O</kbd></button>
            <button type="button" class="sketchizi-file-action" data-sketchizi-new-file>${icon("newFile")}<span>New file</span><kbd>Ctrl+N</kbd></button>
          </div>
          <details class="sketchizi-menu-disclosure" data-current-folder-disclosure>
            <summary>${icon("folder")}<span class="sketchizi-disclosure-copy"><strong>Current folder</strong><small data-current-folder-count>0 files</small></span>${icon("chevron")}</summary>
            <div class="sketchizi-disclosure-content"><div class="sketchizi-current-folder" data-current-folder>No folder selected</div><div class="sketchizi-folder-files-heading"><span class="sketchizi-folder-files-title">Files in folder</span><button type="button" class="sketchizi-folder-refresh" data-refresh-current-folder title="Refresh folder contents" aria-label="Refresh folder contents">${icon("refresh")}</button></div><div class="sketchizi-folder-file-list" data-current-folder-files></div><button type="button" class="sketchizi-folder-action" data-sketchizi-close-folder>Close folder</button></div>
          </details>
          <details class="sketchizi-menu-disclosure" data-recent-files-disclosure><summary>${icon("clock")}<span class="sketchizi-disclosure-copy"><strong>Recent files</strong><small data-recent-files-count>0 files</small></span>${icon("chevron")}</summary><div class="sketchizi-disclosure-content"><div class="sketchizi-recent-list" data-recent-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-files>Clear recent files</button></div></details>
          <details class="sketchizi-menu-disclosure" data-recent-folders-disclosure><summary>${icon("folder")}<span class="sketchizi-disclosure-copy"><strong>Recent folders</strong><small data-recent-folders-count>0 folders</small></span>${icon("chevron")}</summary><div class="sketchizi-disclosure-content"><div class="sketchizi-recent-folder-list" data-recent-folder-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-folders>Clear recent folders</button></div></details>`;
        menuParent.insertBefore(customBlock, menuParent.firstChild);
      }

      const backgroundLabel = findNativeBackgroundLabel();
      if (backgroundLabel) {
        const nativeSwatches = [...menuParent.querySelectorAll("button")].filter((button) => {
          if (button.closest(`[data-sketchizi-custom-menu-block], #${BACKGROUND_POPOVER_ID}`)) return false;
          const classes = typeof button.className === "string" ? button.className : "";
          return /color-picker|color-swatch|background-swatch/i.test(classes)
            || Boolean(button.style?.backgroundColor)
            || /color/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-testid") || ""}`);
        });
        const firstSwatch = nativeSwatches[0];
        const palette = firstSwatch?.closest?.(".color-picker, [class*='color-picker'], [data-testid*='color-picker']") || firstSwatch?.parentElement;
        let nativeBackgroundSection = backgroundLabel.parentElement;
        while (nativeBackgroundSection && nativeBackgroundSection !== menuParent && palette && !nativeBackgroundSection.contains(palette)) {
          nativeBackgroundSection = nativeBackgroundSection.parentElement;
        }
        if (nativeBackgroundSection && nativeBackgroundSection !== menuParent && palette && nativeBackgroundSection.contains(palette)) {
          // Hide the smallest section that contains both the native label and
          // palette; don't hide the enclosing Excalidraw menu container.
          nativeBackgroundSection.dataset.sketchiziNativeBackgroundHidden = "true";
        } else {
          // Some Excalidraw menu variants render the heading and palette as
          // separate siblings. Hide just those two native pieces in that case.
          const labelItem = backgroundLabel.closest("li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item, button") || backgroundLabel.parentElement;
          if (labelItem && labelItem !== menuParent && !labelItem.contains(customBlock)) {
            labelItem.dataset.sketchiziNativeBackgroundHidden = "true";
          }
          const paletteSection = palette?.closest?.(".color-picker, [class*='color-picker'], [data-testid*='color-picker']") || palette;
          if (paletteSection && paletteSection !== menuParent && !paletteSection.contains(customBlock)) {
            paletteSection.dataset.sketchiziNativeBackgroundHidden = "true";
          } else {
            nativeSwatches.forEach((swatch) => { swatch.dataset.sketchiziHiddenNativeBackgroundSwatch = "true"; });
          }
        }
      }

      let backgroundTrigger = menuParent.querySelector("[data-sketchizi-background-trigger]");
      if (!backgroundTrigger) {
        backgroundTrigger = document.createElement("button");
        backgroundTrigger.type = "button";
        backgroundTrigger.className = "sketchizi-background-trigger";
        backgroundTrigger.dataset.sketchiziBackgroundTrigger = "true";
        backgroundTrigger.setAttribute("aria-haspopup", "dialog");
        backgroundTrigger.setAttribute("aria-expanded", "false");
        backgroundTrigger.innerHTML = `<span class="sketchizi-background-trigger-icon">${icon("palette")}</span><span class="sketchizi-background-trigger-copy"><strong>Canvas background</strong><small>Choose a color or pattern</small></span><span class="sketchizi-background-trigger-chevron">›</span>`;
        const reviewLink = [...menuParent.querySelectorAll("a")].find((node) => node.textContent?.replace(/\s+/g, " ").trim() === "Drop a Review");
        const reviewItem = reviewLink?.closest("li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item") || reviewLink;
        if (reviewItem?.parentElement === menuParent) menuParent.insertBefore(backgroundTrigger, reviewItem.nextSibling);
        else menuParent.appendChild(backgroundTrigger);
      }

      if (!document.getElementById(BACKGROUND_POPOVER_ID)) {
        document.body.insertAdjacentHTML("beforeend", renderBackgroundPopover());
      }
      const popover = document.getElementById(BACKGROUND_POPOVER_ID);
      if (popover && !popover.dataset.initialized) {
        popover.dataset.initialized = "true";
        popover.querySelectorAll("[data-bg-tab]").forEach((tab) => bind(tab, "sketchiziBound", () => {}));
      }

      const currentFolderNode = customBlock.querySelector("[data-current-folder]");
      if (currentFolderNode) {
        currentFolderNode.textContent = currentFolder?.name ? currentFolder.name : "No folder selected";
        currentFolderNode.title = currentFolder?.name || "No folder selected";
      }
      customBlock.querySelector("[data-current-folder-count]").textContent = `${currentFolderFiles.length} ${currentFolderFiles.length === 1 ? "file" : "files"}`;
      customBlock.querySelector("[data-recent-files-count]").textContent = `${recentFiles.length} ${recentFiles.length === 1 ? "file" : "files"}`;
      customBlock.querySelector("[data-recent-folders-count]").textContent = `${recentFolders.length} ${recentFolders.length === 1 ? "folder" : "folders"}`;
      const closeFolderButton = customBlock.querySelector("[data-sketchizi-close-folder]");
      if (closeFolderButton) closeFolderButton.hidden = !currentFolder;
      bind(customBlock, "sketchiziDisclosureBound", (event) => {
        if (event.target.closest?.("summary")) event.stopPropagation();
      });
      bind(customBlock.querySelector("[data-sketchizi-open-folder]"), "sketchiziBound", () => fileActionsRef.current.openFolderFromDisk?.());
      bind(customBlock.querySelector("[data-sketchizi-open-file]"), "sketchiziBound", () => fileActionsRef.current.openDrawingFromDisk?.());
      bind(customBlock.querySelector("[data-sketchizi-new-file]"), "sketchiziBound", () => fileActionsRef.current.createNewFile?.());
      bind(closeFolderButton, "sketchiziBound", () => fileActionsRef.current.closeCurrentFolder?.());
      bind(customBlock.querySelector("[data-refresh-current-folder]"), "sketchiziBound", () => refreshCurrentFolderFiles().catch((error) => handleFileError(error, "Unable to read the selected folder")));

      const folderFilesList = customBlock.querySelector("[data-current-folder-files]");
      if (folderFilesList) {
        const signature = JSON.stringify(currentFolderFiles.map((item) => item.name));
        if (folderFilesList.dataset.signature !== signature) {
          folderFilesList.dataset.signature = signature;
          folderFilesList.innerHTML = currentFolderFiles.length
            ? currentFolderFiles.map((item) => `<button type="button" class="sketchizi-folder-file" data-current-folder-file="${escapeHtml(item.name)}" title="Open ${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`).join("")
            : `<div class="sketchizi-recent-empty">${currentFolder ? "No .excalidraw drawings" : "No folder selected"}</div>`;
        }
        bind(folderFilesList, "sketchiziBound", (event) => {
          const button = event.target.closest?.("[data-current-folder-file]");
          if (!button) return;
          const match = currentFolderFiles.find((item) => item.name === button.dataset.currentFolderFile);
          if (match) fileActionsRef.current.openDrawingFromCurrentFolder?.(match);
        });
      }
      const recentList = customBlock.querySelector("[data-recent-list]");
      if (recentList) {
        const signature = JSON.stringify(recentFiles.map((item) => [item.id, item.name, item.savedAt, item.kind]));
        if (recentList.dataset.signature !== signature) {
          recentList.dataset.signature = signature;
          recentList.innerHTML = recentFiles.length
            ? recentFiles.map((item) => `<div class="sketchizi-recent-row"><button type="button" class="sketchizi-recent-item" data-recent-id="${escapeHtml(item.id)}" title="${escapeHtml(new Date(item.savedAt).toLocaleString())}"><span>${escapeHtml(item.name)}</span><small>${new Date(item.savedAt).toLocaleDateString()}</small></button><button type="button" class="sketchizi-recent-remove" data-remove-recent-file="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from Recent files" title="Remove from Recent files">×</button></div>`).join("")
            : `<div class="sketchizi-recent-empty">No recent files</div>`;
        }
        bind(recentList, "sketchiziBound", (event) => {
          const remove = event.target.closest?.("[data-remove-recent-file]");
          if (remove) { fileActionsRef.current.removeRecentFile?.(remove.dataset.removeRecentFile); return; }
          const button = event.target.closest?.("[data-recent-id]");
          if (button) fileActionsRef.current.openRecentFile?.(button.dataset.recentId);
        });
      }
      bind(customBlock.querySelector("[data-clear-recent-files]"), "sketchiziBound", () => fileActionsRef.current.clearRecentFiles?.());
      const recentFolderList = customBlock.querySelector("[data-recent-folder-list]");
      if (recentFolderList) {
        const signature = JSON.stringify(recentFolders.map((item) => [item.id, item.name, item.openedAt]));
        if (recentFolderList.dataset.signature !== signature) {
          recentFolderList.dataset.signature = signature;
          recentFolderList.innerHTML = recentFolders.length
            ? recentFolders.map((item) => `<div class="sketchizi-recent-row"><button type="button" class="sketchizi-recent-item" data-recent-folder-id="${escapeHtml(item.id)}" title="${escapeHtml(new Date(item.openedAt).toLocaleString())}"><span>${icon("folder")}${escapeHtml(item.name)}</span></button><button type="button" class="sketchizi-recent-remove" data-remove-recent-folder="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from Recent folders" title="Remove from Recent folders">×</button></div>`).join("")
            : `<div class="sketchizi-recent-empty">No recent folders</div>`;
        }
        bind(recentFolderList, "sketchiziBound", (event) => {
          const remove = event.target.closest?.("[data-remove-recent-folder]");
          if (remove) { fileActionsRef.current.removeRecentFolder?.(remove.dataset.removeRecentFolder); return; }
          const button = event.target.closest?.("[data-recent-folder-id]");
          if (button) fileActionsRef.current.openRecentFolder?.(button.dataset.recentFolderId);
        });
      }
      bind(customBlock.querySelector("[data-clear-recent-folders]"), "sketchiziBound", () => fileActionsRef.current.clearRecentFolders?.());
      constrainMenu(menuParent);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(cleanNativeMenu); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [apiRef, canvasBackgroundPattern, currentFolder, currentFolderFiles, fileActionsRef, handleFileError, recentFiles, recentFolders, refreshCurrentFolderFiles]);
}

function localStorageSafeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
