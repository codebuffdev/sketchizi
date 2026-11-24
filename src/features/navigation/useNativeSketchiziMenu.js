import { useEffect, useRef } from "react";
import { countLiveElements, describeClosedAt } from "../workspace/closedTabs.js";
import { getRecentFileActivityLabel, getRecentFileAvailability, getRecentFileOriginLabel, getRecentFileTypeLabel } from "../files/recentFilePresentation.js";
import { getRecentFolderActivityLabel, getRecentFolderAvailability, getRecentFolderTypeLabel } from "../files/recentFolderPresentation.js";
import { getWorkspaceModeIconMarkup } from "../workspace/WorkspaceModeIcon.jsx";

export function useNativeSketchiziMenu({
  apiRef,
  fileActionsRef,
  openCloudWorkspace,
  currentFolder,
  currentFolderFiles,
  recentFiles,
  recentFolders,
  canvasMode = "infinite",
  closedTabs = [],
  reopenClosedTab = () => {},
  deleteClosedTab = () => {},
  clearClosedTabs = () => {},
  refreshCurrentFolderFiles,
  handleFileError,
  useThemeDefaultBackground = () => {},
  markCanvasBackgroundCustom = () => {},
}) {
  // The menu is rendered imperatively and its click handlers are bound once, so
  // they read the latest closed-tab actions through a ref instead of a closure.
  const closedTabActionsRef = useRef(null);
  closedTabActionsRef.current = { reopenClosedTab, deleteClosedTab, clearClosedTabs };
  // Handlers are bound once per injected node; keep the lists they report on fresh.
  const menuDataRef = useRef({ recentFiles: [], closedTabs: [] });
  menuDataRef.current = { recentFiles, closedTabs };
  useEffect(() => {
    // Canvas color swatches are intentionally disabled: the global Day/Night
    // switch controls both application chrome and Excalidraw's canvas.
    const applyCanvasSwatch = () => {};
    const onClick = (event) => {
      // The hamburger trigger owns its own menu toggle. Do not let this
      // document-level menu-action delegate interpret that interaction.
      if (event.target?.closest?.("[data-hamburger-trigger]")) return;
      applyCanvasSwatch(event);
      const target = event.target?.closest?.('button, [role="button"], [role="menuitem"], a, [data-testid]');
      if (!target) return;
      const testId = target.getAttribute?.("data-testid");
      const text = target.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      const inMenu = Boolean(target.closest?.(".dropdown-menu, [class*='dropdown-menu']"));
      let action = null;
      const canvasModeButton = target.closest?.('[data-sketchizi-canvas-mode]');
      if (canvasModeButton) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
        const mode = canvasModeButton.dataset.sketchiziCanvasMode;
        window.dispatchEvent(new CustomEvent('sketchizi:workspace-canvas-choice', { detail: { mode } }));
        if (mode === 'infinite') fileActionsRef.current.createNewFile?.();
        return;
      }
      if (target.matches?.("[data-sketchizi-open-file]")) action = "openDrawingFromDisk";
      else if (target.matches?.("[data-sketchizi-open-folder]")) action = "openFolderFromDisk";
      else if (target.matches?.("[data-sketchizi-close-folder]")) action = "closeCurrentFolder";
      else if (target.matches?.("[data-sketchizi-new-file]")) action = "createNewFile";
      else if (testId === "load-button" || (inMenu && /^open(\s|$)/.test(text) && text.length < 32)) action = "openDrawingFromDisk";
      else if (testId === "json-export-button" || (inMenu && /^save to\.\.\./.test(text))) action = "saveDrawingAs";
      if (!action) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      fileActionsRef.current[action]?.();
    };
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      // Disable Excalidraw Find globally. Ctrl/Cmd+Shift+E is routed to the custom Export Studio handler.
      if (key === "f") {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
        return;
      }
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing && !event.target.closest?.(".excalidraw")) return;
      if (key === "o" && !event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); fileActionsRef.current.openDrawingFromDisk?.();
      } else if (key === "s") {
        event.preventDefault(); event.stopPropagation();
        if (event.shiftKey) fileActionsRef.current.saveDrawingAs?.();
        else fileActionsRef.current.saveCurrentDrawing?.();
      }
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [apiRef, fileActionsRef, markCanvasBackgroundCustom, useThemeDefaultBackground]);

  useEffect(() => {
    const githubUrl = "https://github.com/codebuffdev";
    let frame = 0;
    const escapeHtml = (value) => String(value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const svgIcon = (inner, size = 15) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
    const fileIcon = svgIcon('<path d="M7 3.5h6.5L18 8v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M13.5 3.5V8H18"/>', 14);
    const clockIcon = svgIcon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 14);
    // Guarded writers: the MutationObserver re-runs this routine on every DOM change,
    // so only touch nodes whose value actually changed or the drawer would loop.
    const setText = (node, value) => { const next = String(value); if (node && node.textContent !== next) node.textContent = next; };
    const setAttr = (node, name, value) => { if (node && node.getAttribute(name) !== value) node.setAttribute(name, value); };
    const setHidden = (node, hidden) => { if (node && node.hidden !== hidden) node.hidden = hidden; };
    const shortActivity = (label) => String(label || "").replace(/^(Opened|Added)\s+/, "");
    const constrainCanvasBackgroundMenu = () => {
      // The dropdown is anchored to the toolbar, so a viewport-wide max-height
      // calculation that subtracts a guessed header height can still leave the
      // scroll area taller than the space below its actual on-screen position.
      // Measure the real scroll container after Excalidraw positions it.
      const label = [...document.querySelectorAll(".dropdown-menu-container *, .dropdown-menu *")].find(
        (node) => node.children.length === 0 && node.textContent?.replace(/\s+/g, " ").trim() === "Canvas background"
      );
      const scrollContainer = label?.closest?.(".dropdown-menu-container");
      if (!scrollContainer) return;

      const dropdown = scrollContainer.closest?.(".dropdown-menu");
      const top = Math.max(0, scrollContainer.getBoundingClientRect().top);
      const bottomGap = 12;
      const availableHeight = Math.max(1, Math.floor(window.innerHeight - top - bottomGap));

      // Keep exactly one vertical scroll owner. The wrapper must not impose a
      // second viewport-relative cap that clips the bottom of the scroll area.
      if (dropdown) {
        dropdown.style.setProperty("max-height", "none", "important");
        dropdown.style.setProperty("overflow", "visible", "important");
      }
      scrollContainer.style.setProperty("box-sizing", "border-box", "important");
      scrollContainer.style.setProperty("height", "auto", "important");
      scrollContainer.style.setProperty("min-height", "0", "important");
      scrollContainer.style.setProperty("max-height", `${availableHeight}px`, "important");
      scrollContainer.style.setProperty("overflow-x", "hidden", "important");
      scrollContainer.style.setProperty("overflow-y", "auto", "important");
      scrollContainer.style.setProperty("overscroll-behavior-y", "contain", "important");
      scrollContainer.style.setProperty("-webkit-overflow-scrolling", "touch", "important");
    };

    const cleanNativeMenu = () => {
      frame = 0;
      // Remove Excalidraw's duplicate independent canvas-background palette;
      // the header appearance picker owns these settings. Scope to native menus.
      const canvasBackgroundLabel = [...document.querySelectorAll(".dropdown-menu-container *, .dropdown-menu *")].find(
        (node) => node.children.length === 0 && node.textContent?.replace(/\s+/g, " ").trim() === "Canvas background"
      );
      if (canvasBackgroundLabel) {
        const item = canvasBackgroundLabel.closest("button, [role='button'], [role='menuitem'], li, .dropdown-menu-item, .context-menu-item, .menu-item") || canvasBackgroundLabel.parentElement;
        if (item && item !== document.body) item.remove();
      }
      const replaceExactTextNode = (root, from, to) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let current;
        while ((current = walker.nextNode())) {
          if (current.nodeValue?.trim() === from) {
            current.nodeValue = current.nodeValue.replace(from, to);
            return true;
          }
        }
        return false;
      };
      document.querySelectorAll("body a").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text === "GitHub" || text === "Connect with Coder") {
          node.href = githubUrl; node.target = "_blank"; node.rel = "noreferrer noopener";
          if (text === "GitHub") replaceExactTextNode(node, "GitHub", "Connect with Coder");
        } else if (text === "Follow us" || text === "Discord chat") {
          (node.closest("li, .dropdown-menu-item, .context-menu-item, .menu-item") || node).remove();
        }
      });

      // Clean up the hamburger's native menu items without touching the
      // application header or the separate keyboard-help overlay.
      document.querySelectorAll(".dropdown-menu-container").forEach((menu) => {
        const exactLeaves = [...menu.querySelectorAll("*")].filter(
          (node) => node.children.length === 0
        );
        const helpLabel = exactLeaves.find(
          (node) => node.textContent?.replace(/\s+/g, " ").trim().toLowerCase() === "help"
        );
        if (helpLabel) {
          const item = helpLabel.closest(
            "li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item, button, a"
          ) || helpLabel.parentElement;
          if (item && item !== menu) item.remove();
        }

        const openLabel = exactLeaves.find(
          (node) => node.textContent?.replace(/\\s+/g, " ").trim() === "Open"
        );
        if (openLabel) {
          const item = openLabel.closest(
            "li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item, button, a"
          ) || openLabel.parentElement;
          // The custom Workspace section already provides Open file. Remove
          // Excalidraw's duplicate native Open entry, including its Ctrl+O hint.
          if (item && item !== menu) item.remove();
        }

        const saveToLabel = exactLeaves.find(
          (node) => /^save to\.\.\.$/i.test(node.textContent?.replace(/\s+/g, " ").trim() || "")
        );
        if (saveToLabel) {
          // Resolve the actual actionable control, not a broad menu wrapper:
          // some Excalidraw versions place several menu sections inside a
          // shared .dropdown-menu-item ancestor.
          const item = saveToLabel.closest("button, a, [role='menuitem']") || saveToLabel.parentElement;
          const itemLabel = item?.textContent?.replace(/\s+/g, " ").trim().toLowerCase();
          // Remove only the exact Save to… row. Never remove a containing group.
          if (item && item !== menu && itemLabel === "save to...") item.remove();
        }
      });
      document.querySelectorAll("body *").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text === "Excalidraw links" && node.children.length === 0) node.remove();
        if ((node.tagName === "BUTTON" || node.getAttribute?.("role") === "button") && text === "Install") node.remove();
      });

      // Remove image export and canvas-find actions from menus and context menus.
      const blockedMenuLabels = new Set(["export image", "export image...", "export image…", "find on canvas"]);
      document.querySelectorAll("body *").forEach((node) => {
        if (node.children.length) return;
        const label = node.textContent?.replace(/\\s+/g, " ").trim().toLowerCase() || "";
        if (!blockedMenuLabels.has(label)) return;
        const item = node.closest("button, a, [role='menuitem'], li, .dropdown-menu-item, .context-menu-item, .menu-item") || node.parentElement;
        if (item && item !== document.body) item.remove();
      });
      document.querySelectorAll('[data-testid="image-export-button"], [data-testid="search-menu-button"]').forEach((node) => {
        const item = node.closest("button, a, [role='menuitem'], li, .dropdown-menu-item, .context-menu-item, .menu-item") || node;
        if (item && item !== document.body) item.remove();
      });

      // Keep only Reset Canvas among Excalidraw's bottom utility actions.
      const utilLabels = [
        { key: "reset", match: /^reset (the )?canvas$/i, label: "Reset Canvas", testId: "clear-canvas-button" },
      ];
      document.querySelectorAll(".dropdown-menu:has([data-sketchizi-custom-menu-block]) .dropdown-menu-item, .dropdown-menu:has([data-sketchizi-custom-menu-block]) button[data-testid]").forEach((row) => {
        const textNode = row.querySelector(".dropdown-menu-item__text") || row;
        const raw = textNode.textContent?.replace(/\s+/g, " ").trim() || "";
        const shortcutNode = row.querySelector(".dropdown-menu-item__shortcut");
        const labelOnly = shortcutNode ? raw.replace(shortcutNode.textContent?.replace(/\s+/g, " ").trim() || "", "").trim() : raw;
        const util = utilLabels.find((entry) => entry.match.test(labelOnly) || row.getAttribute("data-testid") === entry.testId);
        if (!util) return;
        setAttr(row, "data-sketchizi-util", util.key);
        const labelNode = row.querySelector(".dropdown-menu-item__text");
        if (labelNode && labelNode.children.length === 0 && labelNode.textContent.trim() !== util.label) labelNode.textContent = util.label;
        if (shortcutNode && !shortcutNode.querySelector("kbd")) {
          const text = shortcutNode.textContent?.replace(/\s+/g, " ").trim();
          if (text) { const kbd = document.createElement("kbd"); kbd.textContent = text; shortcutNode.textContent = ""; shortcutNode.append(kbd); }
        }
      });

      // Keep only file/folder management in the hamburger. Collaboration,
      // architecture validation, and theme selection already live in the app
      // header, so duplicating them here wastes space and creates ambiguity.
      if (!document.querySelector("[data-sketchizi-custom-menu-block]")) {
        // Canvas background is removed above, so it cannot be used as an
        // insertion anchor here. Anchor to stable, visible native menu actions
        // instead; Excalidraw versions differ in their data-testid attributes.
        const hasNativeMenuAction = (container) => [...container.querySelectorAll("*")].some((node) => {
          if (node.children.length !== 0) return false;
          const label = node.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
          return label === "reset the canvas" || label === "reset canvas";
        });
        const menuParent = [...document.querySelectorAll(".dropdown-menu-container")]
          .find(hasNativeMenuAction);
        if (menuParent) {
          const customBlock = document.createElement("div");
          customBlock.dataset.sketchiziCustomMenuBlock = "true";
          const recentSection = document.createElement("div");
          recentSection.dataset.sketchiziRecentFilesMenu = "true";
          recentSection.className = "sketchizi-native-settings-section sketchizi-recent-files-section";
          recentSection.innerHTML = `<div class="sketchizi-drawer-head"><div class="sketchizi-native-settings-title">Workspace</div><span class="sketchizi-drawer-tag">Sketchizi</span></div>
<div class="sketchizi-ws-tiles" role="group" aria-label="Workspace actions">
<button type="button" class="sketchizi-ws-tile" data-sketchizi-canvas-mode="infinite" aria-pressed="false"><span class="sketchizi-ws-tile-icon is-canvas" aria-hidden="true">${getWorkspaceModeIconMarkup("canvas")}</span><span class="sketchizi-ws-tile-label">Canvas</span></button>
<button type="button" class="sketchizi-ws-tile" data-sketchizi-canvas-mode="pages" aria-pressed="false"><span class="sketchizi-ws-tile-icon is-pages" aria-hidden="true">${getWorkspaceModeIconMarkup("pages")}</span><span class="sketchizi-ws-tile-label">Pages</span></button>
<button type="button" class="sketchizi-ws-tile" data-sketchizi-open-workspace><span class="sketchizi-ws-tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 16.5a3.5 3.5 0 0 0-3.7-3.5 5.5 5.5 0 0 0-10.6-1.3A3.8 3.8 0 0 0 6.5 19H19a3 3 0 0 0 1-2.5Z"/></svg></span><span class="sketchizi-ws-tile-label">Cloud Files</span></button>
<button type="button" class="sketchizi-ws-tile" data-sketchizi-open-file><span class="sketchizi-ws-tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z"/></svg></span><span class="sketchizi-ws-tile-label">Open File</span></button>
</div>
<div class="sketchizi-file-menu-announcement" data-file-menu-announcement role="status" aria-live="polite" aria-atomic="true"></div>
<hr class="sketchizi-drawer-divider">
<section class="sketchizi-file-menu-group sketchizi-file-menu-recents" aria-label="Recent items"><div class="sketchizi-sec" data-sec="recent"><div class="sketchizi-sec-head"><button type="button" class="sketchizi-sec-toggle" aria-expanded="true" aria-controls="sketchizi-recent-files-panel" data-sec-toggle><span class="sketchizi-sec-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span><span class="sketchizi-sec-title">Recent files</span><span class="sketchizi-sec-count" data-recent-files-count data-has-items="false">0</span></button><button type="button" class="sketchizi-sec-action" data-clear-recent-files hidden>Clear</button></div><div id="sketchizi-recent-files-panel" class="sketchizi-recent-list sketchizi-sec-panel" data-recent-list></div></div><div class="sketchizi-recent-dropdown sketchizi-sec" data-sec="drafts" data-closed-tabs-menu><div class="sketchizi-sec-head"><button type="button" class="sketchizi-sec-toggle" aria-expanded="true" aria-controls="sketchizi-closed-tabs-panel" data-sec-toggle><span class="sketchizi-sec-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span><span class="sketchizi-sec-title">Local drafts</span><span class="sketchizi-sec-count" data-closed-tabs-count data-has-items="false">0</span></button><button type="button" class="sketchizi-sec-action" data-clear-closed-tabs hidden>Delete all</button></div><div id="sketchizi-closed-tabs-panel" class="sketchizi-recent-list sketchizi-sec-panel" data-closed-tabs-list></div></div></section>`;
          // Remove only the horizontal rules called out in the menu mockup;
          // retain the existing rows, content, and spacing.
          recentSection.style.setProperty("border-top", "0", "important");
          recentSection.style.setProperty("border-bottom", "0", "important");
          const fileActions = recentSection.querySelector(".sketchizi-file-menu-actions");
          fileActions?.style.setProperty("border-bottom", "0", "important");
          const recentsGroup = recentSection.querySelector(".sketchizi-file-menu-recents");
          recentsGroup?.style.setProperty("border-top", "0", "important");
          recentsGroup?.style.setProperty("border-bottom", "0", "important");
          customBlock.append(recentSection);
          // Community links live in the expanded navigation panel, not in a separate popup.
          // Remove the native GitHub row; the redesigned panel owns this destination.
          [...menuParent.querySelectorAll("a")].filter((link) => /^(github|connect with coder)$/i.test(link.textContent?.replace(/\s+/g, " ").trim() || "")).forEach((link) => link.remove());
          const communitySection = document.createElement("section");
          communitySection.className = "sketchizi-native-settings-section sketchizi-community-section";
          communitySection.innerHTML = `<hr class="sketchizi-drawer-divider"><div class="sketchizi-community-cards"><a class="sketchizi-sidebar-community-link sketchizi-community-card" href="/reviews" data-sketchizi-review-link><span class="sketchizi-card-badge sketchizi-review-icon" data-tone="amber" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 14.6 8.6l5.6.8-4.1 4 1 5.6L12 16.3 6.9 19l1-5.6-4.1-4 5.6-.8L12 3.5Z"/></svg></span><span class="sketchizi-card-label">Drop a Review</span><span class="sketchizi-card-trail" aria-hidden="true">›</span></a><a class="sketchizi-sidebar-community-link sketchizi-community-card" href="${githubUrl}" target="_blank" rel="noreferrer noopener" data-sketchizi-coder-link><span class="sketchizi-card-badge sketchizi-git-icon" data-tone="indigo" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M18 17v-2a4 4 0 0 0-4-4H10a4 4 0 0 1-4-4"/></svg></span><span class="sketchizi-card-label">Connect with Coder</span><span class="sketchizi-card-trail" aria-hidden="true">↗</span></a></div><hr class="sketchizi-drawer-divider">`;
          communitySection.style.setProperty("border-top", "0", "important");
          communitySection.style.setProperty("border-bottom", "0", "important");
          customBlock.append(communitySection);
          // The design uses a compact single navigation surface with a dedicated
          // Canvas background row that opens its own adjacent settings panel.
          // Do not inject a second icon rail into Excalidraw's dropdown.
          // Place the remaining file/folder actions first in the expanded panel.
          menuParent.insertBefore(customBlock, menuParent.firstChild);
        }
      }

      // Theme-default canvas behavior is automatic. Do not inject a separate
      // "Use theme default" control into Excalidraw's native menu.

      // Excalidraw leaves trailing separators/spacer wrappers behind when its
      // Canvas background item is removed. Trim only empty/decorative siblings
      // after the final visible action, "Reset the canvas", so the panel ends
      // immediately after its last action without the extra blank ruled rows.
      const trimTrailingMenuArtifacts = () => {
        const menuRoot = [...document.querySelectorAll(".dropdown-menu-container")].find(
          (node) => node.querySelector("[data-sketchizi-custom-menu-block]")
        );
        if (!menuRoot) return;

        const resetLabel = [...menuRoot.querySelectorAll("*")].find(
          (node) => node.children.length === 0 && /^reset (the )?canvas$/.test(node.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "")
        );
        if (!resetLabel) return;

        const resetAction = resetLabel.closest(
          "button, a[href], [role='menuitem'], li, .dropdown-menu-item, .context-menu-item, .menu-item"
        ) || resetLabel.parentElement;
        if (!resetAction) return;

        const hasMeaningfulMenuContent = (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.matches("button, a[href], [role='menuitem'], input, select, textarea")) return true;
          if (node.querySelector("button, a[href], [role='menuitem'], input, select, textarea")) return true;
          return Boolean(node.textContent?.replace(/\s+/g, " ").trim());
        };

        let cursor = resetAction;
        while (cursor && cursor !== menuRoot) {
          let sibling = cursor.nextElementSibling;
          while (sibling && !hasMeaningfulMenuContent(sibling)) {
            const nextSibling = sibling.nextElementSibling;
            sibling.remove();
            sibling = nextSibling;
          }
          cursor = cursor.parentElement;
        }

        // The wrapper containing the final native action should not contribute
        // its own trailing separator or excess spacing to the panel height.
        const actionGroup = resetAction.parentElement;
        if (actionGroup && actionGroup !== menuRoot) {
          actionGroup.style.setProperty("border-bottom", "0", "important");
          actionGroup.style.setProperty("padding-bottom", "0", "important");
          actionGroup.style.setProperty("margin-bottom", "0", "important");
        }
      };
      trimTrailingMenuArtifacts();

      // The menu is intentionally not pinnable: the hamburger is a true
      // toggle, so clicking it always closes an open menu.

      const recentMenu = document.querySelector("[data-sketchizi-recent-files-menu]");
      const bind = (node, key, handler) => {
        if (!node || node.dataset[key] === "true") return;
        node.dataset[key] = "true"; node.addEventListener("click", handler);
      };
      bind(recentMenu?.querySelector("[data-sketchizi-open-folder]"), "bound", () => fileActionsRef.current.openFolderFromDisk?.());
      bind(recentMenu?.querySelector("[data-sketchizi-open-workspace]"), "bound", openCloudWorkspace);
      recentMenu?.querySelectorAll("[data-sketchizi-canvas-mode]").forEach((tile) => {
        const active = tile.dataset.sketchiziCanvasMode === canvasMode;
        setAttr(tile, "data-active", String(active));
        setAttr(tile, "aria-pressed", String(active));
      });
      recentMenu?.querySelectorAll("[data-sec-toggle]").forEach((toggle) => bind(toggle, "bound", () => {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        const panel = document.getElementById(toggle.getAttribute("aria-controls") || "");
        if (panel) panel.hidden = !open;
        toggle.closest("[data-sec]")?.setAttribute("data-open", String(open));
      }));
      const currentFolderNode = recentMenu?.querySelector("[data-current-folder]");
      if (currentFolderNode) {
        currentFolderNode.textContent = currentFolder?.name ? `Folder: ${currentFolder.name}` : "No folder selected";
        currentFolderNode.title = currentFolder?.name || "No folder selected";
        currentFolderNode.dataset.access = currentFolder?.handle ? "linked" : currentFolder?.fallback ? "read-only" : "none";
      }
      const closeFolderButton = recentMenu?.querySelector("[data-sketchizi-close-folder]");
      if (closeFolderButton) closeFolderButton.style.display = currentFolder ? "block" : "none";
      const refreshButton = recentMenu?.querySelector("[data-refresh-current-folder]");
      const refreshStatus = recentMenu?.querySelector("[data-folder-refresh-status]");
      if (refreshButton) {
        refreshButton.disabled = !currentFolder?.handle || refreshButton.dataset.refreshing === "true";
        refreshButton.setAttribute("aria-disabled", String(!currentFolder?.handle));
        refreshButton.title = currentFolder?.handle ? "Refresh current folder" : "Select a linked folder to refresh";
      }
      if (refreshStatus) {
        const folderKey = currentFolder?.id || "none";
        if (refreshStatus.dataset.folderKey !== folderKey) {
          refreshStatus.dataset.folderKey = folderKey;
          refreshStatus.dataset.state = "neutral";
          refreshStatus.textContent = !currentFolder
            ? "Select a folder to browse its drawings."
            : currentFolder.handle
              ? "Ready to refresh this folder."
              : "This folder selection is read-only; refresh is unavailable.";
        }
      }
      bind(refreshButton, "bound", async () => {
        const button = recentMenu?.querySelector("[data-refresh-current-folder]");
        const status = recentMenu?.querySelector("[data-folder-refresh-status]");
        const activeFolder = fileActionsRef.current.getCurrentFolder?.();
        if (!button || button.disabled || button.dataset.refreshing === "true" || !activeFolder?.handle) return;
        button.dataset.refreshing = "true";
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        if (status) { status.dataset.state = "loading"; status.textContent = "Refreshing folder…"; }
        try {
          const files = await fileActionsRef.current.refreshCurrentFolderFiles?.();
          const count = Array.isArray(files) ? files.length : 0;
          const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
          if (status) {
            status.dataset.state = "success";
            status.textContent = count ? `Updated ${count} ${count === 1 ? "drawing" : "drawings"} · ${time}` : `Refreshed · no supported drawings · ${time}`;
          }
          fileActionsRef.current.updateRecentFolderStatus?.(activeFolder.id, "available");
        } catch (error) {
          const permissionError = error?.kind === "permission" || error?.name === "NotAllowedError" || error?.name === "SecurityError" || /permission|denied/i.test(error?.message || "");
          const missingError = error?.kind === "not-found" || error?.name === "NotFoundError";
          if (status) {
            status.dataset.state = "error";
            status.textContent = permissionError
              ? "Permission needed — reopen the folder to allow access."
              : missingError
                ? "Folder unavailable — reopen the folder to reconnect."
                : "Refresh failed. Check access and try again.";
          }
          if (activeFolder?.id && permissionError) fileActionsRef.current.updateRecentFolderStatus?.(activeFolder.id, "permission");
          else if (activeFolder?.id && missingError) fileActionsRef.current.updateRecentFolderStatus?.(activeFolder.id, "missing");
          handleFileError(error, "Unable to read the selected folder");
        } finally {
          button.dataset.refreshing = "false";
          button.removeAttribute("aria-busy");
          button.disabled = !fileActionsRef.current.getCurrentFolder?.()?.handle || button.dataset.refreshing === "true";
          button.setAttribute("aria-disabled", String(button.disabled));
        }
      });

      const announceFileMenuStatus = (message) => {
        const status = recentMenu?.querySelector("[data-file-menu-announcement]");
        if (status) status.textContent = message;
      };
      // Centralize the transient busy state so every file-opening surface gets
      // identical cleanup, including unexpected rejected promises.
      const runFileMenuOperation = (button, operation, label) => {
        if (!button || button.disabled || button.dataset.opening === "true") return;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.dataset.opening = "true";
        announceFileMenuStatus(`Opening ${label}…`);
        Promise.resolve().then(operation).catch((error) => {
          // Native file and folder pickers reject with AbortError when the user
          // dismisses them. Treat that as a normal cancellation, not a failure.
          const cancelled = error?.name === "AbortError" || error?.kind === "cancelled";
          announceFileMenuStatus(cancelled
            ? `Opening ${label} was cancelled.`
            : `Could not finish opening ${label}. Check the error message and try again.`);
        }).finally(() => {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          delete button.dataset.opening;
          // Do not overwrite useful error/cancellation feedback with a success
          // claim: file actions own their detailed toast and may handle errors internally.
          const announcement = recentMenu?.querySelector("[data-file-menu-announcement]")?.textContent || "";
          if (recentMenu?.isConnected && !announcement.startsWith("Could not finish") && !announcement.startsWith(`Opening ${label} was cancelled.`)) {
            announceFileMenuStatus(`Open request ended for ${label}.`);
          }
        });
      };
      const folderFilesList = recentMenu?.querySelector("[data-current-folder-files]");
      if (folderFilesList) {
        const signature = JSON.stringify(currentFolderFiles.map((item) => item.name));
        if (folderFilesList.dataset.signature !== signature) {
          folderFilesList.dataset.signature = signature;
          folderFilesList.innerHTML = currentFolderFiles.length
            ? currentFolderFiles.map((item) => `<button type="button" class="sketchizi-folder-file" data-current-folder-file="${escapeHtml(item.name)}" title="Open ${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`).join("")
            : `<div class="sketchizi-recent-empty">${currentFolder ? "No .sketchizi or .excalidraw drawings" : "No folder selected"}</div>`;
        }
        bind(folderFilesList, "bound", (event) => {
          const button = event.target.closest?.("[data-current-folder-file]");
          if (!button) return;
          const match = currentFolderFiles.find((item) => item.name === button.dataset.currentFolderFile);
          if (match) runFileMenuOperation(button, () => fileActionsRef.current.openDrawingFromCurrentFolder?.(match), match.name);
        });
      }

      const recentFilesCount = recentMenu?.querySelector("[data-recent-files-count]");
      if (recentFilesCount) { setText(recentFilesCount, recentFiles.length); setAttr(recentFilesCount, "data-has-items", String(recentFiles.length > 0)); }
      setHidden(recentMenu?.querySelector("[data-clear-recent-files]"), recentFiles.length === 0);
      const closedCount = recentMenu?.querySelector("[data-closed-tabs-count]");
      if (closedCount) { setText(closedCount, closedTabs.length); setAttr(closedCount, "data-has-items", String(closedTabs.length > 0)); }
      setHidden(recentMenu?.querySelector("[data-clear-closed-tabs]"), closedTabs.length === 0);
      const closedList = recentMenu?.querySelector("[data-closed-tabs-list]");
      if (closedList) {
        const signature = JSON.stringify(closedTabs.map((item) => [item.closedId, item.name, item.closedAt]));
        if (closedList.dataset.signature !== signature) {
          closedList.dataset.signature = signature;
          closedList.innerHTML = closedTabs.length
            ? closedTabs.map((item) => {
                const name = escapeHtml(item.name);
                const shapes = countLiveElements(item);
                const meta = `${shapes} ${shapes === 1 ? "shape" : "shapes"} · ${describeClosedAt(item)}`;
                return `<div class="sketchizi-recent-row sketchizi-draft-row"><div class="sketchizi-draft-info" title="${name}"><span class="sketchizi-recent-name">${name}</span><span class="sketchizi-draft-meta">${escapeHtml(meta)}</span></div><button type="button" class="sketchizi-reopen-pill" data-closed-tab-id="${escapeHtml(item.closedId)}" title="Reopen ${name} as a browser draft" aria-label="Reopen ${name} as a browser draft">Reopen</button><button type="button" class="sketchizi-recent-remove" data-remove-closed-tab="${escapeHtml(item.closedId)}" aria-label="Delete draft ${name}" title="Delete this draft permanently">×</button></div>`;
              }).join("")
            : `<div class="sketchizi-recent-empty sketchizi-empty-hint"><span aria-hidden="true">${clockIcon}</span><span>Closed canvas tabs are kept here as drafts</span></div>`;
        }
        bind(closedList, "bound", (event) => {
          const remove = event.target.closest?.("[data-remove-closed-tab]");
          if (remove) { closedTabActionsRef.current.deleteClosedTab(remove.dataset.removeClosedTab); return; }
          const open = event.target.closest?.("[data-closed-tab-id]");
          if (open) {
            apiRef.current?.updateScene?.({ appState: { openMenu: null }, captureUpdate: "NEVER" });
            closedTabActionsRef.current.reopenClosedTab(open.dataset.closedTabId);
          }
        });
      }
      bind(recentMenu?.querySelector("[data-clear-closed-tabs]"), "bound", () => {
        const count = menuDataRef.current.closedTabs.length;
        closedTabActionsRef.current.clearClosedTabs();
        announceFileMenuStatus(count ? `Deleted ${count} local ${count === 1 ? "draft" : "drafts"}.` : "Local drafts is already empty.");
      });
      const recentFoldersCount = recentMenu?.querySelector("[data-recent-folders-count]");
      if (recentFoldersCount) recentFoldersCount.textContent = `${recentFolders.length} ${recentFolders.length === 1 ? "folder" : "folders"}`;
      const recentList = recentMenu?.querySelector("[data-recent-list]");
      if (recentList) {
        const signature = JSON.stringify(recentFiles.map((item) => [item.id, item.name, item.savedAt, item.lastOpenedAt, item.kind, item.availability]));
        if (recentList.dataset.signature !== signature) {
          recentList.dataset.signature = signature;
          recentList.innerHTML = recentFiles.length
            ? recentFiles.map((item) => {
                const typeLabel = getRecentFileTypeLabel(item);
                const originLabel = getRecentFileOriginLabel(item);
                const activityLabel = getRecentFileActivityLabel(item);
                const status = getRecentFileAvailability(item);
                const title = [item.name, typeLabel, originLabel, activityLabel, status?.message].filter(Boolean).join(" · ");
                const rowStatus = item.availability || "available";
                return `<div class="sketchizi-recent-row" data-recent-availability="${escapeHtml(rowStatus)}"><button type="button" class="sketchizi-recent-item sketchizi-row-main" data-recent-id="${escapeHtml(item.id)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${item.name}, ${typeLabel}, ${originLabel}, ${activityLabel}${status ? `, ${status.label}` : ""}`)}"><span class="sketchizi-row-icon" aria-hidden="true">${fileIcon}</span><span class="sketchizi-recent-name">${escapeHtml(item.name)}</span>${status ? `<small class="sketchizi-recent-status" role="status">${escapeHtml(status.label)}</small>` : ""}<small class="sketchizi-recent-activity">${escapeHtml(shortActivity(activityLabel))}</small></button><button type="button" class="sketchizi-recent-remove" data-remove-recent-file="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from Recent files" title="Remove from Recent files">×</button></div>`;
              }).join("")
            : `<div class="sketchizi-recent-empty sketchizi-empty-hint"><span aria-hidden="true">${clockIcon}</span><span>No recent files yet</span></div>`;
        }
        bind(recentList, "bound", (event) => {
          const remove = event.target.closest?.("[data-remove-recent-file]");
          if (remove) {
            const item = menuDataRef.current.recentFiles.find((entry) => entry.id === remove.dataset.removeRecentFile);
            fileActionsRef.current.removeRecentFile?.(remove.dataset.removeRecentFile);
            announceFileMenuStatus(item ? `Removed ${item.name} from Recent files.` : "Removed item from Recent files.");
            recentMenu?.querySelector("[data-clear-recent-files]")?.focus();
            return;
          }
          const button = event.target.closest?.("[data-recent-id]");
          if (button && !button.disabled) {
            const item = menuDataRef.current.recentFiles.find((entry) => entry.id === button.dataset.recentId);
            runFileMenuOperation(button, () => fileActionsRef.current.openRecentFile?.(button.dataset.recentId), item?.name || "recent drawing");
          }
        });
      }
      bind(recentMenu?.querySelector("[data-clear-recent-files]"), "bound", () => {
        const count = menuDataRef.current.recentFiles.length;
        fileActionsRef.current.clearRecentFiles?.();
        announceFileMenuStatus(count ? `Cleared ${count} ${count === 1 ? "file" : "files"} from Recent files.` : "Recent files is already empty.");
      });

      const folderList = recentMenu?.querySelector("[data-recent-folder-list]");
      if (folderList) {
        const signature = JSON.stringify(recentFolders.map((item) => [item.id, item.name, item.openedAt, item.lastCheckedAt, item.availability, item.kind, item.fallback]));
        if (folderList.dataset.signature !== signature) {
          folderList.dataset.signature = signature;
          folderList.innerHTML = recentFolders.length
            ? recentFolders.map((item) => {
                const typeLabel = getRecentFolderTypeLabel(item);
                const activityLabel = getRecentFolderActivityLabel(item);
                const availability = getRecentFolderAvailability(item);
                const rowStatus = item.availability || (item.fallback ? "read-only" : "available");
                const title = [typeLabel, activityLabel, availability?.message].filter(Boolean).join(" · ");
                return `<div class="sketchizi-recent-row" data-recent-folder-availability="${escapeHtml(rowStatus)}"><button type="button" class="sketchizi-recent-item" data-recent-folder-id="${escapeHtml(item.id)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${item.name}, ${typeLabel}, ${activityLabel}${availability ? `, ${availability.label}` : ""}`)}"><span class="sketchizi-recent-folder-name">📁 ${escapeHtml(item.name)}</span><span class="sketchizi-recent-folder-meta"><small class="sketchizi-recent-folder-type">${escapeHtml(typeLabel)}</small><small class="sketchizi-recent-folder-activity">${escapeHtml(activityLabel)}</small>${availability ? `<small class="sketchizi-recent-folder-status" role="status">${escapeHtml(availability.label)}</small>` : ""}</span></button><button type="button" class="sketchizi-recent-remove" data-remove-recent-folder="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from Recent folders" title="Remove from Recent folders">×</button></div>`;
              }).join("")
            : `<div class="sketchizi-recent-empty">No recent folders yet. Open a folder to keep it here for quick access.</div>`;
        }
        bind(folderList, "bound", (event) => {
          const remove = event.target.closest?.("[data-remove-recent-folder]");
          if (remove) {
            const item = recentFolders.find((entry) => entry.id === remove.dataset.removeRecentFolder);
            fileActionsRef.current.removeRecentFolder?.(remove.dataset.removeRecentFolder);
            announceFileMenuStatus(item ? `Removed ${item.name} from Recent folders.` : "Removed folder from Recent folders.");
            recentMenu?.querySelector("[data-clear-recent-folders]")?.focus();
            return;
          }
          const button = event.target.closest?.("[data-recent-folder-id]");
          if (button && !button.disabled) {
            const item = recentFolders.find((entry) => entry.id === button.dataset.recentFolderId);
            runFileMenuOperation(button, () => fileActionsRef.current.openRecentFolder?.(button.dataset.recentFolderId), item?.name || "recent folder");
          }
        });
      }
      bind(recentMenu?.querySelector("[data-clear-recent-folders]"), "bound", () => {
        const count = recentFolders.length;
        fileActionsRef.current.clearRecentFolders?.();
        announceFileMenuStatus(count ? `Cleared ${count} ${count === 1 ? "folder" : "folders"} from Recent folders.` : "Recent folders is already empty.");
      });

      constrainCanvasBackgroundMenu();

    };
    const scheduleCleanup = () => { if (!frame) frame = requestAnimationFrame(cleanNativeMenu); };
    scheduleCleanup();
    const observer = new MutationObserver(() => {
      scheduleCleanup();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleCleanup);
    window.visualViewport?.addEventListener("resize", scheduleCleanup);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleCleanup);
      window.visualViewport?.removeEventListener("resize", scheduleCleanup);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [canvasMode, currentFolder, currentFolderFiles, fileActionsRef, handleFileError, markCanvasBackgroundCustom, openCloudWorkspace, recentFiles, recentFolders, closedTabs, refreshCurrentFolderFiles, useThemeDefaultBackground]);
}
