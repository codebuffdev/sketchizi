import { useEffect } from "react";

export function useNativeSketchiziMenu({
  fileActionsRef,
  currentFolder,
  currentFolderFiles,
  recentFiles,
  recentFolders,
  refreshCurrentFolderFiles,
  handleFileError,
  themeMode,
  setThemeMode,
  propertiesAutoOpen,
  setPropertiesAutoOpen,
  toggleLayout,
  togglePanel,
  layoutOpen,
  canEdit = true,
}) {
  useEffect(() => {
    const onClick = (event) => {
      const target = event.target?.closest?.('button, [role="button"], [role="menuitem"], a, [data-testid]');
      if (!target) return;
      const testId = target.getAttribute?.("data-testid");
      const text = target.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      const inMenu = Boolean(target.closest?.(".dropdown-menu, [class*='dropdown-menu']"));
      let action = null;
      if (target.matches?.("[data-sketchizi-collaborate]")) action = "startCollaboration";
      else if (target.matches?.("[data-sketchizi-open-folder]")) action = "openFolderFromDisk";
      else if (target.matches?.("[data-sketchizi-close-folder]")) action = "closeCurrentFolder";
      else if (target.matches?.("[data-sketchizi-new-file]")) action = "createNewFile";
      else if (testId === "load-button" || (inMenu && /^open(\s|$)/.test(text) && text.length < 24)) action = "openDrawingFromDisk";
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
  }, [fileActionsRef, toggleLayout, togglePanel]);

  useEffect(() => {
    const githubUrl = "https://github.com/codebuffdev";
    let frame = 0;
    const escapeHtml = (value) => String(value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const cleanNativeMenu = () => {
      frame = 0;
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
      document.querySelectorAll("body *").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text === "Excalidraw links" && node.children.length === 0) node.remove();
        if ((node.tagName === "BUTTON" || node.getAttribute?.("role") === "button") && text === "Install") node.remove();
      });

      if (!document.querySelector("[data-diagramly-theme-menu]")) {
        const backgroundLabel = [...document.querySelectorAll("body *")].find(
          (node) => node.children.length === 0 && node.textContent?.replace(/\s+/g, " ").trim() === "Canvas background"
        );
        if (backgroundLabel) {
          const host = backgroundLabel.parentElement || backgroundLabel;
          const menuParent = host.closest?.(".dropdown-menu-container") || host.parentElement || host;
          const firstNativeMenuChild = menuParent.firstChild;
          if (!document.querySelector("[data-sketchizi-custom-menu-block]")) {
            const customBlock = document.createElement("div");
            customBlock.dataset.sketchiziCustomMenuBlock = "true";
            const propertiesSection = document.createElement("div");
            propertiesSection.dataset.sketchiziPropertiesMenu = "true";
            propertiesSection.className = "sketchizi-native-settings-section sketchizi-properties-section";
            propertiesSection.innerHTML = `<div class="sketchizi-native-settings-title" data-sketchizi-properties-title>Properties</div><div class="sketchizi-native-settings-actions"><button type="button" class="sketchizi-collab-menu-button" data-sketchizi-collaborate aria-label="Open collaboration"><span class="sketchizi-collab-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 12.5 12 9a3.5 3.5 0 0 1 5 0l.5.5a3.5 3.5 0 0 1 0 5L14 18"/><path d="M15.5 11.5 12 15a3.5 3.5 0 0 1-5 0l-.5-.5a3.5 3.5 0 0 1 0-5L10 6"/></svg></span><span>Collab</span></button><button type="button" class="sketchizi-property-setting" data-sketchizi-architecture-validation aria-label="Open Architecture Validation"><span>Architecture Validation</span></button></div>`;
            const layoutSection = document.createElement("div");
            layoutSection.dataset.sketchiziLayoutMenu = "true";
            layoutSection.className = "sketchizi-native-settings-section sketchizi-layout-bottom-section";
            layoutSection.innerHTML = `<button type="button" class="sketchizi-layout-menu-button" data-sketchizi-layout aria-label="Open layout"><span class="sketchizi-layout-menu-icon" aria-hidden="true">⌗</span><span>Layout</span><kbd>L</kbd></button>`;
            const recentSection = document.createElement("div");
            recentSection.dataset.sketchiziRecentFilesMenu = "true";
            recentSection.className = "sketchizi-native-settings-section sketchizi-recent-files-section";
            recentSection.innerHTML = `<div class="sketchizi-native-settings-title">Current folder</div><div class="sketchizi-current-folder" data-current-folder></div><button type="button" class="sketchizi-folder-action" data-sketchizi-close-folder>Close folder</button><div class="sketchizi-folder-files-heading"><span class="sketchizi-folder-files-title">Files in folder</span><button type="button" class="sketchizi-folder-refresh" data-refresh-current-folder title="Refresh folder contents" aria-label="Refresh folder contents">↻</button></div><div class="sketchizi-folder-file-list" data-current-folder-files></div><button type="button" class="sketchizi-folder-action" data-sketchizi-open-folder>Open folder</button><button type="button" class="sketchizi-recent-save" data-sketchizi-new-file>New file</button><div class="sketchizi-native-settings-title sketchizi-recent-subtitle">Recent files</div><div class="sketchizi-recent-list" data-recent-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-files>Clear recent files</button><div class="sketchizi-native-settings-title sketchizi-recent-subtitle">Recent folders</div><div class="sketchizi-recent-folder-list" data-recent-folder-list></div><button type="button" class="sketchizi-recent-clear" data-clear-recent-folders>Clear recent folders</button>`;
            const themeSection = document.createElement("div");
            themeSection.dataset.diagramlyThemeMenu = "true";
            themeSection.className = "diagramly-native-theme-section";
            themeSection.innerHTML = `<div class="diagramly-native-theme-title">Theme</div><div class="diagramly-native-theme-options" role="group" aria-label="Theme selection"><button type="button" data-theme-mode="dark">☾ Dark</button><button type="button" data-theme-mode="light">☀ Light</button><button type="button" data-theme-mode="system">▣ System</button></div>`;
            const autoOpenSection = document.createElement("div");
            autoOpenSection.dataset.sketchiziAutoOpenMenu = "true";
            autoOpenSection.className = "sketchizi-native-settings-section sketchizi-auto-open-section";
            autoOpenSection.innerHTML = `<button type="button" class="sketchizi-property-setting" data-properties-auto-open><span>Auto-open on selection</span><span class="sketchizi-switch" aria-hidden="true"><span></span></span></button>`;
            customBlock.append(propertiesSection, recentSection, themeSection, autoOpenSection);
            menuParent.insertBefore(customBlock, firstNativeMenuChild);
            menuParent.appendChild(layoutSection);

          }
        }
      }

      const propertiesMenuSection = document.querySelector("[data-sketchizi-properties-menu]");
      const propertiesTitle = propertiesMenuSection?.querySelector("[data-sketchizi-properties-title]");
      if (propertiesTitle) propertiesTitle.textContent = canEdit ? "Properties" : "Collaboration";
      const autoOpenMenuSection = document.querySelector("[data-sketchizi-auto-open-menu]");
      if (autoOpenMenuSection) autoOpenMenuSection.style.display = canEdit ? "" : "none";
      const layoutMenuSection = document.querySelector("[data-sketchizi-layout-menu]");
      if (layoutMenuSection?.parentElement) {
        const parent = layoutMenuSection.parentElement;
        if (parent.lastElementChild !== layoutMenuSection) {
          parent.appendChild(layoutMenuSection);
        }
      }

      const recentMenu = document.querySelector("[data-sketchizi-recent-files-menu]");
      const bind = (node, key, handler) => {
        if (!node || node.dataset[key] === "true") return;
        node.dataset[key] = "true"; node.addEventListener("click", handler);
      };
      const layoutButton = document.querySelector("[data-sketchizi-layout]");
      if (layoutButton) {
        if (layoutButton.dataset.layoutClickBound !== "true") {
          layoutButton.dataset.layoutClickBound = "true";
          layoutButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleLayout?.("layout");
          });
        }
        layoutButton.classList.toggle("enabled", Boolean(layoutOpen));
        layoutButton.setAttribute("aria-pressed", String(Boolean(layoutOpen)));
      }
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
            : `<div class="sketchizi-recent-empty">${currentFolder ? "No .excalidraw drawings" : "No folder selected"}</div>`;
        }
        bind(folderFilesList, "bound", (event) => {
          const button = event.target.closest?.("[data-current-folder-file]");
          if (!button) return;
          const match = currentFolderFiles.find((item) => item.name === button.dataset.currentFolderFile);
          if (match) fileActionsRef.current.openDrawingFromCurrentFolder?.(match);
        });
      }

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

      const themeMenu = document.querySelector("[data-diagramly-theme-menu]");
      themeMenu?.querySelectorAll("[data-theme-mode]").forEach((button) => {
        if (button.dataset.bound !== "true") {
          button.dataset.bound = "true";
          button.addEventListener("click", () => setThemeMode(button.dataset.themeMode));
        }
        button.classList.toggle("selected", button.dataset.themeMode === themeMode);
      });
      const architectureValidationButton = document.querySelector("[data-sketchizi-architecture-validation]");
      if (architectureValidationButton && architectureValidationButton.dataset.bound !== "true") {
        architectureValidationButton.dataset.bound = "true";
        architectureValidationButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          togglePanel?.("architecture-validation");
        });
      }
      architectureValidationButton?.classList.toggle("enabled", false);

      const propertiesMenu = document.querySelector("[data-sketchizi-properties-menu]");
      const propertiesButton = propertiesMenu?.querySelector("[data-properties-auto-open]");
      if (propertiesButton && propertiesButton.dataset.bound !== "true") {
        propertiesButton.dataset.bound = "true";
        propertiesButton.addEventListener("click", () => setPropertiesAutoOpen((value) => !value));
      }
      propertiesButton?.classList.toggle("enabled", propertiesAutoOpen);
      propertiesButton?.setAttribute("aria-pressed", String(propertiesAutoOpen));
    };
    const scheduleCleanup = () => { if (!frame) frame = requestAnimationFrame(cleanNativeMenu); };
    scheduleCleanup();
    const observer = new MutationObserver(scheduleCleanup);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [canEdit, currentFolder, currentFolderFiles, fileActionsRef, handleFileError, layoutOpen, propertiesAutoOpen, recentFiles, recentFolders, refreshCurrentFolderFiles, setPropertiesAutoOpen, setThemeMode, themeMode, togglePanel]);
}
