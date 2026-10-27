import { useEffect } from "react";
import { getRecentFileActivityLabel, getRecentFileAvailability, getRecentFileOriginLabel, getRecentFileTypeLabel } from "../files/recentFilePresentation.js";
import { getRecentFolderActivityLabel, getRecentFolderAvailability, getRecentFolderTypeLabel } from "../files/recentFolderPresentation.js";

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
          recentSection.innerHTML = `<div class="sketchizi-native-settings-title">Workspace</div><section class="sketchizi-file-menu-group" aria-label="Current folder"><div class="sketchizi-file-menu-group-title">Current folder</div><div class="sketchizi-current-folder" data-current-folder></div><div class="sketchizi-folder-files-heading"><span class="sketchizi-folder-files-title">Files in folder</span><button type="button" class="sketchizi-folder-refresh" data-refresh-current-folder title="Refresh current folder" aria-label="Refresh current folder">↻</button></div><div class="sketchizi-folder-refresh-status" data-folder-refresh-status role="status" aria-live="polite"></div><button type="button" class="sketchizi-folder-reconnect" data-reconnect-current-folder hidden>Reconnect folder with edit access</button><div class="sketchizi-folder-file-list" data-current-folder-files></div></section><div class="sketchizi-file-menu-actions" role="group" aria-label="File actions"><button type="button" class="sketchizi-folder-action" data-sketchizi-open-folder><span aria-hidden="true">▱</span> Open folder</button><button type="button" class="sketchizi-recent-save" data-sketchizi-new-file><span aria-hidden="true">▤</span> New file</button></div><div class="sketchizi-file-menu-announcement" data-file-menu-announcement role="status" aria-live="polite" aria-atomic="true"></div><section class="sketchizi-file-menu-group sketchizi-file-menu-recents" aria-label="Recent items"><div class="sketchizi-file-menu-group-title">Quick access</div><details class="sketchizi-recent-dropdown"><summary aria-controls="sketchizi-recent-files-panel"><span>Recent files</span><span class="sketchizi-recent-count" data-recent-files-count></span><span class="sketchizi-recent-chevron" aria-hidden="true">⌄</span></summary><div id="sketchizi-recent-files-panel" class="sketchizi-recent-list" data-recent-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-files>Clear recent files</button></details><details class="sketchizi-recent-dropdown"><summary aria-controls="sketchizi-recent-folders-panel"><span>Recent folders</span><span class="sketchizi-recent-count" data-recent-folders-count></span><span class="sketchizi-recent-chevron" aria-hidden="true">⌄</span></summary><div id="sketchizi-recent-folders-panel" class="sketchizi-recent-folder-list" data-recent-folder-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-folders>Clear recent folders</button></details></section>`;
          customBlock.append(recentSection);
          const gitSection = document.createElement("section");
          gitSection.className = "sketchizi-native-settings-section sketchizi-git-repository-section";
          gitSection.innerHTML = `<div class="sketchizi-native-settings-title">GitHub repositories</div><div class="sketchizi-repository-status" data-sketchizi-repo-status>Checking GitHub connection…</div><button type="button" class="sketchizi-folder-action" data-sketchizi-repo-action="open" disabled>Open repository</button><button type="button" class="sketchizi-recent-save" data-sketchizi-repo-action="clone" disabled>Clone repository</button>`;
          customBlock.append(gitSection);
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
      const reconnectFolderButton = recentMenu?.querySelector("[data-reconnect-current-folder]");
      if (reconnectFolderButton) {
        reconnectFolderButton.hidden = !(currentFolder?.fallback && typeof window.showDirectoryPicker === "function");
        bind(reconnectFolderButton, "bound", () => fileActionsRef.current.openFolderFromDisk?.());
      }
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
      if (recentFilesCount) recentFilesCount.textContent = `${recentFiles.length} ${recentFiles.length === 1 ? "file" : "files"}`;
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
                const title = [typeLabel, originLabel, activityLabel, status?.message].filter(Boolean).join(" · ");
                const rowStatus = item.availability || "available";
                return `<div class="sketchizi-recent-row" data-recent-availability="${escapeHtml(rowStatus)}"><button type="button" class="sketchizi-recent-item" data-recent-id="${escapeHtml(item.id)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${item.name}, ${typeLabel}, ${originLabel}, ${activityLabel}${status ? `, ${status.label}` : ""}`)}"><span class="sketchizi-recent-name">${escapeHtml(item.name)}</span><span class="sketchizi-recent-meta"><small class="sketchizi-recent-type">${escapeHtml(typeLabel)}</small><small class="sketchizi-recent-origin">${escapeHtml(originLabel)}</small><small class="sketchizi-recent-activity">${escapeHtml(activityLabel)}</small>${status ? `<small class="sketchizi-recent-status" role="status">${escapeHtml(status.label)}</small>` : ""}</span></button><button type="button" class="sketchizi-recent-remove" data-remove-recent-file="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from Recent files" title="Remove from Recent files">×</button></div>`;
              }).join("")
            : `<div class="sketchizi-recent-empty">No recent files yet. Open or save a drawing to see it here.</div>`;
        }
        bind(recentList, "bound", (event) => {
          const remove = event.target.closest?.("[data-remove-recent-file]");
          if (remove) {
            const item = recentFiles.find((entry) => entry.id === remove.dataset.removeRecentFile);
            fileActionsRef.current.removeRecentFile?.(remove.dataset.removeRecentFile);
            announceFileMenuStatus(item ? `Removed ${item.name} from Recent files.` : "Removed item from Recent files.");
            recentMenu?.querySelector("[data-clear-recent-files]")?.focus();
            return;
          }
          const button = event.target.closest?.("[data-recent-id]");
          if (button && !button.disabled) {
            const item = recentFiles.find((entry) => entry.id === button.dataset.recentId);
            runFileMenuOperation(button, () => fileActionsRef.current.openRecentFile?.(button.dataset.recentId), item?.name || "recent drawing");
          }
        });
      }
      bind(recentMenu?.querySelector("[data-clear-recent-files]"), "bound", () => {
        const count = recentFiles.length;
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

      const repoSection = document.querySelector("[data-sketchizi-custom-menu-block] .sketchizi-git-repository-section");
      const repoStatus = repoSection?.querySelector("[data-sketchizi-repo-status]");
      const repoButtons = [...(repoSection?.querySelectorAll("[data-sketchizi-repo-action]") || [])];
      const updateRepositoryStatus = async () => {
        if (!repoStatus || repoStatus.dataset.checked === "true") return;
        repoStatus.dataset.checked = "true";
        try {
          const response = await fetch("/api/github/connection", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
          const connection = response.ok ? await response.json() : null;
          if (connection?.connected) {
            repoStatus.textContent = `Connected as @${connection.githubLogin || "GitHub user"}`;
            repoButtons.forEach((button) => { button.disabled = false; });
          } else {
            repoStatus.textContent = connection?.authorizationAvailable ? "Connect GitHub in your account menu first." : "GitHub repository access is not configured.";
          }
        } catch {
          repoStatus.textContent = "Could not check GitHub connection. Refresh to retry.";
          repoStatus.dataset.checked = "false";
        }
      };
      updateRepositoryStatus();
      const showRepositoryPicker = async (mode) => {
        if (document.querySelector("[data-sketchizi-repository-picker]")) return;
        const overlay = document.createElement("div");
        overlay.dataset.sketchiziRepositoryPicker = "true";
        overlay.className = "sketchizi-repository-picker-backdrop";
        overlay.innerHTML = `<section class="sketchizi-repository-picker" role="dialog" aria-modal="true" aria-labelledby="sketchizi-repository-picker-title" aria-describedby="sketchizi-repository-picker-hint"><header><strong id="sketchizi-repository-picker-title">${mode === "clone" ? "Clone repository" : "Open repository"}</strong><button type="button" data-repository-picker-close aria-label="Close">×</button></header><p id="sketchizi-repository-picker-hint" class="sketchizi-repository-picker-hint">Choose a GitHub repository to continue.</p><label class="sketchizi-repository-picker-search"><span class="sketchizi-repository-picker-search-icon" aria-hidden="true">⌕</span><input type="search" data-repository-picker-search aria-label="Search repositories" placeholder="Search repositories by name…" autocomplete="off" spellcheck="false" /></label><div class="sketchizi-repository-picker-list" data-repository-picker-list role="list" aria-busy="true"><span>Loading repositories…</span></div><p class="sketchizi-repository-picker-message" data-repository-picker-message role="status" aria-live="polite" aria-atomic="true"></p></section>`;
        const opener = document.activeElement;
        document.body.append(overlay);
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          overlay.remove();
          // Return keyboard users to the control that opened the dialog. The
          // menu may have been rebuilt while the dialog was open, so restore
          // focus only when the original control is still available.
          if (opener instanceof HTMLElement && opener.isConnected && !opener.disabled) opener.focus();
        };
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay || event.target.closest("[data-repository-picker-close]")) close();
        });
        overlay.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = [...overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
            .filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true");
          if (!focusable.length) {
            event.preventDefault();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
          }
        });
        const list = overlay.querySelector("[data-repository-picker-list]");
        const message = overlay.querySelector("[data-repository-picker-message]");
        const search = overlay.querySelector("[data-repository-picker-search]");
        search?.focus();
        try {
          const response = await fetch("/api/github/repositories", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Could not load repositories.");
          const repositories = Array.isArray(payload.repositories) ? payload.repositories : [];
          list.setAttribute("aria-busy", "false");
          if (!repositories.length) { list.textContent = "No repositories found for this GitHub account."; search.disabled = true; return; }
          const repositoryItems = repositories.map((repo) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sketchizi-repository-picker-item";
            button.setAttribute("role", "listitem");
            button.innerHTML = `<span class="sketchizi-repository-picker-name"></span><span class="sketchizi-repository-picker-meta"></span>`;
            const fullName = repo.fullName || repo.name || "Repository";
            const searchableText = `${fullName} ${repo.name || ""} ${repo.owner || ""} ${repo.private ? "private" : "public"} ${repo.defaultBranch || ""}`.toLocaleLowerCase();
            button.querySelector(".sketchizi-repository-picker-name").textContent = fullName;
            button.querySelector(".sketchizi-repository-picker-meta").textContent = `${repo.private ? "Private" : "Public"} · default branch: ${repo.defaultBranch || "unknown"}`;
            button.addEventListener("click", () => {
              message.textContent = `${fullName} selected. Repository file browsing and workspace creation are the next implementation step.`;
              list.querySelectorAll("button").forEach((item) => { item.disabled = true; });
              button.disabled = false;
              button.classList.add("is-selected");
            });
            return { button, searchableText };
          });
          const renderFilteredRepositories = () => {
            const query = search.value.trim().toLocaleLowerCase();
            const matches = repositoryItems.filter(({ searchableText }) => searchableText.includes(query));
            list.replaceChildren();
            if (!matches.length) {
              const empty = document.createElement("span");
              empty.className = "sketchizi-repository-picker-empty";
              empty.textContent = "No repositories match your search.";
              list.append(empty);
              return;
            }
            matches.forEach(({ button }) => list.append(button));
          };
          search.addEventListener("input", renderFilteredRepositories);
          renderFilteredRepositories();
        } catch (error) {
          list.setAttribute("aria-busy", "false");
          list.textContent = error.message || "Could not load GitHub repositories.";
          search.disabled = true;
        }
      };
      repoButtons.forEach((button) => bind(button, "bound", () => showRepositoryPicker(button.dataset.sketchiziRepoAction)));

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
