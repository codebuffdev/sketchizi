import { useEffect } from "react";

export function useNativeSketchiziMenu({
  apiRef,
  fileActionsRef,
  currentFolder,
  currentFolderFiles,
  recentFiles,
  recentFolders,
  refreshCurrentFolderFiles,
  handleFileError,
  useThemeDefaultBackground = () => {},
  markCanvasBackgroundCustom = () => {},
}) {
  useEffect(() => {
    // Canvas color swatches are intentionally disabled: the global Day/Night
    // switch controls both application chrome and Excalidraw's canvas.
    const applyCanvasSwatch = () => {};
    const onClick = (event) => {
      applyCanvasSwatch(event);
      const target = event.target?.closest?.('button, [role="button"], [role="menuitem"], a, [data-testid]');
      if (!target) return;
      const testId = target.getAttribute?.("data-testid");
      const text = target.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      const inMenu = Boolean(target.closest?.(".dropdown-menu, [class*='dropdown-menu']"));
      let action = null;
      if (target.matches?.("[data-sketchizi-open-folder]")) action = "openFolderFromDisk";
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
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [apiRef, fileActionsRef, markCanvasBackgroundCustom, useThemeDefaultBackground]);

  useEffect(() => {
    const githubUrl = "https://github.com/codebuffdev";
    let frame = 0;
    const escapeHtml = (value) => String(value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const constrainCanvasBackgroundMenu = () => {
      // The dropdown is anchored to the toolbar, so a viewport-wide max-height
      // calculation that subtracts a guessed header height can still leave the
      // scroll area taller than the space below its actual on-screen position.
      // Measure the real scroll container after Excalidraw positions it.
      const label = [...document.querySelectorAll("body *")].find(
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
      // The app now offers exactly two coordinated themes. Remove Excalidraw's
      // independent canvas-background palette so the canvas cannot diverge.
      const canvasBackgroundLabel = [...document.querySelectorAll("body *")].find(
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
          (node) => node.textContent?.replace(/\s+/g, " ").trim() === "Open"
        );
        if (openLabel) {
          const item = openLabel.closest(
            "li, [role='menuitem'], .dropdown-menu-item, .context-menu-item, .menu-item, button, a"
          ) || openLabel.parentElement;
          if (item && item !== menu) {
            replaceExactTextNode(item, "Open", "Open file");
            item.classList.add("sketchizi-native-open-file-item");
            if (!item.querySelector(".sketchizi-native-open-file-icon")) {
              const icon = document.createElement("span");
              icon.className = "sketchizi-native-open-file-icon";
              icon.setAttribute("aria-hidden", "true");
              icon.textContent = "▤";
              item.prepend(icon);
            }
          }
        }
      });
      document.querySelectorAll("body *").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text === "Excalidraw links" && node.children.length === 0) node.remove();
        if ((node.tagName === "BUTTON" || node.getAttribute?.("role") === "button") && text === "Install") node.remove();
      });

      // Keep only file/folder management in the hamburger. Collaboration,
      // architecture validation, and theme selection already live in the app
      // header, so duplicating them here wastes space and creates ambiguity.
      if (!document.querySelector("[data-sketchizi-custom-menu-block]")) {
        const menuAnchor = [...document.querySelectorAll(".dropdown-menu-container")]
          .find((node) => [...node.querySelectorAll("*")].some(
            (child) => child.children.length === 0 && child.textContent?.replace(/\s+/g, " ").trim() === "Canvas background"
          ));
        const menuParent = menuAnchor || [...document.querySelectorAll(".dropdown-menu-container")]
          .find((node) => node.querySelector('[data-testid="load-button"], [data-testid="json-export-button"]'));
        if (menuParent) {
          const customBlock = document.createElement("div");
          customBlock.dataset.sketchiziCustomMenuBlock = "true";
          const recentSection = document.createElement("div");
          recentSection.dataset.sketchiziRecentFilesMenu = "true";
          recentSection.className = "sketchizi-native-settings-section sketchizi-recent-files-section";
          recentSection.innerHTML = `<div class="sketchizi-native-settings-title">Current folder</div><div class="sketchizi-current-folder" data-current-folder></div><div class="sketchizi-folder-files-heading"><span class="sketchizi-folder-files-title">Files in folder</span><button type="button" class="sketchizi-folder-refresh" data-refresh-current-folder title="Refresh current folder" aria-label="Refresh current folder">↻</button></div><div class="sketchizi-folder-file-list" data-current-folder-files></div><button type="button" class="sketchizi-folder-action" data-sketchizi-open-folder><span aria-hidden="true">▱</span> Open folder</button><button type="button" class="sketchizi-recent-save" data-sketchizi-new-file><span aria-hidden="true">▤</span> New file</button><details class="sketchizi-recent-dropdown"><summary><span>Recent files</span><span class="sketchizi-recent-count" data-recent-files-count></span><span aria-hidden="true">⌄</span></summary><div class="sketchizi-recent-list" data-recent-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-files>Clear recent files</button></details><details class="sketchizi-recent-dropdown"><summary><span>Recent folders</span><span class="sketchizi-recent-count" data-recent-folders-count></span><span aria-hidden="true">⌄</span></summary><div class="sketchizi-recent-folder-list" data-recent-folder-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-folders>Clear recent folders</button></details>`;
          customBlock.append(recentSection);
          // Community links live in the expanded navigation panel, not in a separate popup.
          // Remove the native GitHub row; the redesigned panel owns this destination.
          [...menuParent.querySelectorAll("a")].filter((link) => /^(github|connect with coder)$/i.test(link.textContent?.replace(/\s+/g, " ").trim() || "")).forEach((link) => link.remove());
          const communitySection = document.createElement("section");
          communitySection.className = "sketchizi-native-settings-section sketchizi-community-section";
          communitySection.innerHTML = `<a class="sketchizi-sidebar-community-link" href="/reviews" data-sketchizi-review-link><span aria-hidden="true">♧</span><span>Drop a Review</span><span aria-hidden="true">›</span></a><a class="sketchizi-sidebar-community-link" href="${githubUrl}" target="_blank" rel="noreferrer noopener" data-sketchizi-coder-link><span aria-hidden="true">▤</span><span>Connect with Coder</span><span aria-hidden="true">↗</span></a>`;
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
          (node) => node.children.length === 0 && node.textContent?.replace(/\s+/g, " ").trim().toLowerCase() === "reset the canvas"
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
      const currentFolderNode = recentMenu?.querySelector("[data-current-folder]");
      if (currentFolderNode) {
        currentFolderNode.textContent = currentFolder?.name ? `Folder: ${currentFolder.name}` : "No folder selected";
        currentFolderNode.title = currentFolder?.name || "No folder selected";
      }
      const closeFolderButton = recentMenu?.querySelector("[data-sketchizi-close-folder]");
      if (closeFolderButton) closeFolderButton.style.display = currentFolder ? "block" : "none";
      bind(recentMenu?.querySelector("[data-refresh-current-folder]"), "bound", () => refreshCurrentFolderFiles().catch((error) => handleFileError(error, "Unable to read the selected folder")));

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
          if (match) fileActionsRef.current.openDrawingFromCurrentFolder?.(match);
        });
      }

      const recentFilesCount = recentMenu?.querySelector("[data-recent-files-count]");
      if (recentFilesCount) recentFilesCount.textContent = `${recentFiles.length} ${recentFiles.length === 1 ? "file" : "files"}`;
      const recentFoldersCount = recentMenu?.querySelector("[data-recent-folders-count]");
      if (recentFoldersCount) recentFoldersCount.textContent = `${recentFolders.length} ${recentFolders.length === 1 ? "folder" : "folders"}`;
      const recentList = recentMenu?.querySelector("[data-recent-list]");
      if (recentList) {
        const signature = JSON.stringify(recentFiles.map((item) => [item.id, item.name, item.savedAt, item.kind]));
        if (recentList.dataset.signature !== signature) {
          recentList.dataset.signature = signature;
          recentList.innerHTML = recentFiles.length
            ? recentFiles.map((item) => `<div class="sketchizi-recent-row"><button type="button" class="sketchizi-recent-item" data-recent-id="${escapeHtml(item.id)}" title="${escapeHtml(new Date(item.savedAt).toLocaleString())}"><span>${escapeHtml(item.name)}</span><small>${new Date(item.savedAt).toLocaleDateString()}</small></button><button type="button" class="sketchizi-recent-remove" data-remove-recent-file="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from Recent files" title="Remove from Recent files">×</button></div>`).join("")
            : `<div class="sketchizi-recent-empty">No recent files</div>`;
        }
        bind(recentList, "bound", (event) => {
          const remove = event.target.closest?.("[data-remove-recent-file]");
          if (remove) { fileActionsRef.current.removeRecentFile?.(remove.dataset.removeRecentFile); return; }
          const button = event.target.closest?.("[data-recent-id]");
          if (button) fileActionsRef.current.openRecentFile?.(button.dataset.recentId);
        });
      }
      bind(recentMenu?.querySelector("[data-clear-recent-files]"), "bound", () => fileActionsRef.current.clearRecentFiles?.());

      const folderList = recentMenu?.querySelector("[data-recent-folder-list]");
      if (folderList) {
        const signature = JSON.stringify(recentFolders.map((item) => [item.id, item.name, item.openedAt]));
        if (folderList.dataset.signature !== signature) {
          folderList.dataset.signature = signature;
          folderList.innerHTML = recentFolders.length
            ? recentFolders.map((item) => `<div class="sketchizi-recent-row"><button type="button" class="sketchizi-recent-item" data-recent-folder-id="${escapeHtml(item.id)}" title="${escapeHtml(new Date(item.openedAt).toLocaleString())}"><span>📁 ${escapeHtml(item.name)}</span></button><button type="button" class="sketchizi-recent-remove" data-remove-recent-folder="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from Recent folders" title="Remove from Recent folders">×</button></div>`).join("")
            : `<div class="sketchizi-recent-empty">No recent folders</div>`;
        }
        bind(folderList, "bound", (event) => {
          const remove = event.target.closest?.("[data-remove-recent-folder]");
          if (remove) { fileActionsRef.current.removeRecentFolder?.(remove.dataset.removeRecentFolder); return; }
          const button = event.target.closest?.("[data-recent-folder-id]");
          if (button) fileActionsRef.current.openRecentFolder?.(button.dataset.recentFolderId);
        });
      }
      bind(recentMenu?.querySelector("[data-clear-recent-folders]"), "bound", () => fileActionsRef.current.clearRecentFolders?.());

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
  }, [currentFolder, currentFolderFiles, fileActionsRef, handleFileError, markCanvasBackgroundCustom, recentFiles, recentFolders, refreshCurrentFolderFiles, useThemeDefaultBackground]);
}
