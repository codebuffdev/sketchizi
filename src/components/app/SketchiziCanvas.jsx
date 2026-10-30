import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import { snapChangedSceneElements } from "../../features/canvas/gridSnap.js";
import Minimap from "../../Minimap";
import ShortcutHelp from "../../ShortcutHelp";
import ContextualFormattingToolbar from "./ContextualFormattingToolbar";
import AlignmentGuides from "./AlignmentGuides";
import { RemoteCursors, RemoteSelections } from "./CollaborationPresence";
import { getCanvasBackground } from "../../features/navigation/canvasTheme.js";
import { DEFAULT_FONT_FAMILY_ID, normalizeFontFamilyId } from "../../features/canvas/fontFamilyDefaults.js";

export default function SketchiziCanvas({
  savedSketch, isDarkTheme, handleExcalidrawAPI, handleChange, handleDrop,
  viewModeEnabled = false,
  minimapOpen, minimapScene, apiRef, minimapDragRef, centerOnMinimap,
  selectedElements = [], applyToSelected, onOpenProperties, onToolActivated, propertiesOpen = false, canEdit = true,
  closeShortcuts, shortcutHelpOpen, setMinimapOpen, collaborationParticipants = [], collaborationSelfId, updateCollaborationCursor, onViewportChange,
  gridVisible = false, gridSize = 20, gridSnappingEnabled = false,
}) {
  const canvasRootRef = useRef(null);
  const fitContentButtonRef = useRef(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const handleSceneChange = useCallback((elements, appState, files) => {
    const hasVisibleElements = (elements || []).some((element) => element && !element.isDeleted && !element.deleted);
    if (fitContentButtonRef.current) fitContentButtonRef.current.disabled = !canEdit || viewModeEnabled || !hasVisibleElements;
    setCanvasRevision((revision) => revision + 1);
    handleChange?.(elements, appState, files);
  }, [canEdit, handleChange, viewModeEnabled]);
  const handleViewportChange = useCallback((...args) => {
    setCanvasRevision((revision) => revision + 1);
    onViewportChange?.(...args);
  }, [onViewportChange]);
  const registerExcalidrawAPI = useCallback((api) => {
    handleExcalidrawAPI?.(api);
    setCanvasRevision((revision) => revision + 1);
  }, [handleExcalidrawAPI]);

  useEffect(() => {
    const element = canvasRootRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setCanvasRevision((revision) => revision + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);



  // Selecting any tool from the dock dismisses the legacy Properties panel.
  // The floating formatting toolbar remains the primary control surface.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !onToolActivated) return undefined;
    const handleDockPointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".App-toolbar button, .App-toolbar [role='button']")) return;
      onToolActivated();
    };
    root.addEventListener("pointerdown", handleDockPointerDown, true);
    return () => root.removeEventListener("pointerdown", handleDockPointerDown, true);
  }, [onToolActivated]);

  // Enhance Excalidraw's own toolbar in place. Buttons and their React handlers
  // stay native; this adds only a grip, separators, and session-only dragging.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let disposed = false;
    let observer;
    let frame = 0;
    let activeDragCleanup = null;
    let dockLocked = true;
    const publishDockLockState = (locked) => {
      dockLocked = locked;
      const container = root.querySelector(".App-toolbar-container");
      if (container) container.dataset.sketchiziDockLocked = String(locked);
      window.dispatchEvent(new CustomEvent("sketchizi:dock-lock-state", { detail: { locked } }));
    };
    const toggleDockLock = () => publishDockLockState(!dockLocked);
    window.addEventListener("sketchizi:toggle-dock-lock", toggleDockLock);
    const toolbarTooltip = document.createElement("div");
    toolbarTooltip.className = "sketchizi-toolbar-tooltip";
    toolbarTooltip.setAttribute("role", "tooltip");
    toolbarTooltip.setAttribute("aria-hidden", "true");
    toolbarTooltip.style.visibility = "hidden";
    document.body.appendChild(toolbarTooltip);
    const tooltipBindings = new Map();
    let activeTooltipButton = null;
    const hideToolbarTooltip = () => {
      activeTooltipButton = null;
      toolbarTooltip.style.visibility = "hidden";
      toolbarTooltip.style.opacity = "0";
      toolbarTooltip.setAttribute("aria-hidden", "true");
    };
    const showToolbarTooltip = (button) => {
      const label = button?.dataset?.sketchiziTooltip;
      if (!label || !button.isConnected) return;
      activeTooltipButton = button;
      toolbarTooltip.textContent = label;
      const appShell = root.closest(".app");
      toolbarTooltip.classList.toggle("theme-dark", !!appShell?.classList.contains("theme-dark"));
      toolbarTooltip.classList.toggle("theme-light", !!appShell?.classList.contains("theme-light"));
      toolbarTooltip.style.visibility = "hidden";
      toolbarTooltip.style.opacity = "0";
      const buttonRect = button.getBoundingClientRect();
      const tipRect = toolbarTooltip.getBoundingClientRect();
      const toolbar = button.closest(".App-toolbar") || root.querySelector(".App-toolbar");
      const vertical = toolbar?.dataset.sketchiziOrientation === "vertical";
      const side = toolbar?.dataset.sketchiziDockSide;
      const scrollBackTooltip = /scroll back to content/i.test(label);
      let left;
      let top;
      let keepOutsideDock = false;
      if (vertical) {
        left = side === "right" ? buttonRect.left - tipRect.width - 10 : buttonRect.right + 10;
        if (left < 8) left = buttonRect.right + 10;
        if (left + tipRect.width > window.innerWidth - 8) left = buttonRect.left - tipRect.width - 10;
        top = buttonRect.top + (buttonRect.height - tipRect.height) / 2;
      } else {
        left = buttonRect.left + (buttonRect.width - tipRect.width) / 2;
        if (scrollBackTooltip) {
          // The control itself now sits outside the dock, so keep its tooltip
          // anchored to that control rather than placing it over the toolbar.
          top = buttonRect.top - tipRect.height - 8;
          if (top < 8) top = buttonRect.bottom + 8;
        } else {
          top = buttonRect.top - tipRect.height - 8;
          if (top < 8) top = buttonRect.bottom + 8;
        }
      }
      left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left));
      if (keepOutsideDock) {
        if (top + tipRect.height > window.innerHeight - 8) {
          top = Math.max(8, toolbar.getBoundingClientRect().top - tipRect.height - 8);
        }
      } else {
        top = Math.max(8, Math.min(window.innerHeight - tipRect.height - 8, top));
      }
      toolbarTooltip.style.left = `${left}px`;
      toolbarTooltip.style.top = `${top}px`;
      toolbarTooltip.style.visibility = "visible";
      toolbarTooltip.style.opacity = "1";
      toolbarTooltip.setAttribute("aria-hidden", "false");
    };
    const onToolbarTooltipResize = () => {
      if (activeTooltipButton?.isConnected) showToolbarTooltip(activeTooltipButton);
      else hideToolbarTooltip();
    };
    const bindToolbarTooltip = (button) => {
      if (tooltipBindings.has(button)) return;
      const show = () => showToolbarTooltip(button);
      const hide = () => { if (activeTooltipButton === button) hideToolbarTooltip(); };
      button.addEventListener("pointerenter", show);
      button.addEventListener("pointerleave", hide);
      button.addEventListener("focus", show);
      button.addEventListener("blur", hide);
      tooltipBindings.set(button, { show, hide });
    };
    window.addEventListener("resize", onToolbarTooltipResize);
    const clampDockToViewport = () => {
      const container = root.querySelector(".App-toolbar-container");
      if (!container || !container.style.left || !container.style.top) return;
      const rect = container.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      const left = Math.min(maxLeft, Math.max(8, rect.left));
      const top = Math.min(maxTop, Math.max(8, rect.top));
      container.style.setProperty("left", `${left}px`, "important");
      container.style.setProperty("top", `${top}px`, "important");
    };
    const decorateToolbar = () => {
      if (disposed) return;
      const toolbar = root.querySelector(".App-toolbar");
      const container = root.querySelector(".App-toolbar-container");
      if (!toolbar || !container) return;
      toolbar.dataset.sketchiziDock = "true";
      if (!container.dataset.sketchiziDockLocked) {
        container.dataset.sketchiziDockLocked = "true";
        dockLocked = true;
        window.dispatchEvent(new CustomEvent("sketchizi:dock-lock-state", { detail: { locked: true } }));
      } else {
        dockLocked = container.dataset.sketchiziDockLocked !== "false";
      }
      if (!toolbar.querySelector(":scope > .sketchizi-dock-grip")) {
        const grip = document.createElement("button");
        grip.type = "button";
        grip.className = "sketchizi-dock-grip";
        grip.setAttribute("aria-label", "Move drawing toolbar");
        grip.title = "Drag to move toolbar";
        grip.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
        grip.addEventListener("keydown", (event) => {
          const directions = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
          const delta = directions[event.key];
          if (!delta || window.matchMedia("(max-width: 760px)").matches) return;
          const dock = root.querySelector(".App-toolbar-container");
          if (!dock || dock.dataset.sketchiziDockLocked !== "false") return;
          event.preventDefault();
          const rect = dock.getBoundingClientRect();
          dock.style.setProperty("width", "max-content", "important");
          dock.style.setProperty("max-width", "max-content", "important");
          dock.style.setProperty("overflow", "visible", "important");
          dock.style.setProperty("transform", "none", "important");
          const proposedLeft = rect.left + delta[0];
          const dockElement = root.querySelector(".App-toolbar");
          const edgeThreshold = 28;
          const side = proposedLeft <= edgeThreshold ? "left"
            : proposedLeft + rect.width >= window.innerWidth - edgeThreshold ? "right" : null;
          if (dockElement) {
            dockElement.dataset.sketchiziOrientation = side ? "vertical" : "horizontal";
            if (side) dockElement.dataset.sketchiziDockSide = side;
            else delete dockElement.dataset.sketchiziDockSide;
          }
          const width = dock.offsetWidth;
          const left = side === "left" ? 8 : side === "right"
            ? Math.max(8, window.innerWidth - width - 8)
            : Math.min(Math.max(8, window.innerWidth - width - 8), Math.max(8, proposedLeft));
          const top = Math.min(Math.max(8, window.innerHeight - dock.offsetHeight - 8), Math.max(8, rect.top + delta[1]));
          dock.style.setProperty("left", `${left}px`, "important");
          dock.style.setProperty("top", `${top}px`, "important");
          dock.style.setProperty("right", "auto", "important");
          dock.style.setProperty("bottom", "auto", "important");
        });
        grip.addEventListener("pointerdown", (event) => {
          if (container.dataset.sketchiziDockLocked !== "false" || event.button !== 0 || window.matchMedia("(max-width: 760px)").matches) return;
          event.preventDefault();
          hideToolbarTooltip();
          const rect = container.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          const initialLeft = rect.left;
          const initialTop = rect.top;
          container.style.setProperty("width", "max-content", "important");
          container.style.setProperty("max-width", "max-content", "important");
          container.style.setProperty("overflow", "visible", "important");
          container.style.setProperty("left", `${initialLeft}px`, "important");
          container.style.setProperty("top", `${initialTop}px`, "important");
          container.style.setProperty("right", "auto", "important");
          container.style.setProperty("bottom", "auto", "important");
          container.style.setProperty("transform", "none", "important");
          const move = (moveEvent) => {
            const proposedLeft = initialLeft + moveEvent.clientX - startX;
            const proposedTop = initialTop + moveEvent.clientY - startY;
            const edgeThreshold = 28;
            const dock = root.querySelector(".App-toolbar");
            const dockRight = proposedLeft + container.offsetWidth;
            const verticalSide = proposedLeft <= edgeThreshold
              ? "left"
              : dockRight >= window.innerWidth - edgeThreshold ? "right" : null;

            // Dock vertically only while the user places it against a screen edge.
            // Returning it away from the edge restores the horizontal toolbar.
            if (dock) {
              dock.dataset.sketchiziOrientation = verticalSide ? "vertical" : "horizontal";
              if (verticalSide) dock.dataset.sketchiziDockSide = verticalSide;
              else delete dock.dataset.sketchiziDockSide;
            }
            const width = container.offsetWidth;
            const height = container.offsetHeight;
            const maxLeft = Math.max(8, window.innerWidth - width - 8);
            const maxTop = Math.max(8, window.innerHeight - height - 8);
            const left = verticalSide === "left" ? 8 : verticalSide === "right"
              ? Math.max(8, window.innerWidth - width - 8)
              : Math.min(maxLeft, Math.max(8, proposedLeft));
            const top = Math.min(maxTop, Math.max(8, proposedTop));
            container.style.setProperty("left", `${left}px`, "important");
            container.style.setProperty("top", `${top}px`, "important");
          };
          const finish = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            if (activeDragCleanup === finish) activeDragCleanup = null;
          };
          activeDragCleanup?.();
          activeDragCleanup = finish;
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", finish, { once: true });
          window.addEventListener("pointercancel", finish, { once: true });
        });
        toolbar.insertBefore(grip, toolbar.firstChild);
      }
      // Excalidraw owns the active-tool state and marks its selected toolbar button.
      // Style that native state instead of inferring tools from labels, which can
      // incorrectly highlight unrelated controls or remain stale while editing text.
      // Add concise native hover labels without replacing Excalidraw's own
      // accessible names, button elements, keyboard bindings, or handlers.
      // Shortcut text is read from Excalidraw's rendered keybinding element.
      const candidates = [...toolbar.querySelectorAll("button, [role='button']")]
        .filter((node) => !node.classList.contains("sketchizi-dock-grip"));
      candidates.forEach((button) => {
        const accessibleName = (button.getAttribute("aria-label") || button.getAttribute("title") || "")
          .replace(/\s+/g, " ").trim();
        if (!accessibleName) return;
        const keybinding = button.querySelector(".ToolIcon__keybinding")?.textContent?.replace(/\s+/g, " ").trim();
        const tooltip = keybinding && !accessibleName.includes(keybinding)
          ? `${accessibleName} (${keybinding})`
          : accessibleName;
        button.dataset.sketchiziTooltip = tooltip;
        // A native title tooltip cannot be reliably placed on the canvas-facing
        // side of a vertical dock. Preserve the accessible name and render a
        // body-level tooltip so overflow clipping in the dock cannot hide it.
        if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", accessibleName);
        button.removeAttribute("title");
        bindToolbarTooltip(button);
      });

      // Insert separators before known native tool groups only when the DOM
      // exposes a direct toolbar child boundary. Never reorder or wrap tools.
      const groupStarts = [
        /^(select|selection|rectangle|rect)$/i,
        /^(arrow|line|draw|freedraw|freehand)$/i,
        /^(text|note|eraser)$/i,
      ];
      const directChildren = [...toolbar.children];
      const nativeTools = directChildren.filter((node) =>
        node.matches(".ToolIcon, .dropdown-menu-button, button, [role='button']"),
      );
      nativeTools.forEach((anchor) => {
        const button = anchor.matches("button, [role='button']") ? anchor : anchor.querySelector("button, [role='button']");
        if (!button || button.classList.contains("sketchizi-dock-grip")) return;
        const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.dataset.testid || ""}`.trim().toLowerCase();
        const normalized = label.split(/[(:\s-]/)[0];
        const groupIndex = groupStarts.findIndex((pattern) => pattern.test(normalized));
        if (groupIndex <= 0 || anchor.previousElementSibling?.classList.contains("sketchizi-dock-separator")) return;
        const separator = document.createElement("span");
        separator.className = "sketchizi-dock-separator";
        separator.dataset.group = String(groupIndex);
        separator.setAttribute("aria-hidden", "true");
        toolbar.insertBefore(separator, anchor);
      });

      // Keep Bucket Fill as the only custom quick tool in the native dock.
      // Reconcile the group on toolbar mutations because Excalidraw may rebuild
      // descendants; direct activation must not open the More Tools menu.
      let quickGroup = toolbar.querySelector(":scope > .sketchizi-dock-quick-tools");
      if (!quickGroup) {
        quickGroup = document.createElement("div");
        quickGroup.className = "sketchizi-dock-quick-tools";
        quickGroup.setAttribute("role", "group");
        quickGroup.setAttribute("aria-label", "Quick tools");
      }
      // Find the native eraser even when Excalidraw nests its tool button.
      // Keep custom tools before the trailing native menu button because
      // useMoreTools hides that native button; custom controls must stay clickable.
      const directToolbarChildren = [...toolbar.children].filter((node) =>
        !node.classList.contains("sketchizi-dock-quick-tools") &&
        !node.classList.contains("sketchizi-dock-separator") &&
        !node.classList.contains("sketchizi-dock-grip") &&
        !node.classList.contains("App-toolbar__spacer") &&
        !node.classList.contains("toolbar__spacer") &&
        node.getAttribute("data-toolbar-spacer") !== "true"
      );
      const eraserButton = [...toolbar.querySelectorAll("button, [role='button']")].find((node) =>
        !node.closest(".sketchizi-dock-quick-tools") &&
        /eraser/i.test((node.getAttribute("aria-label") || "") + " " +
          (node.getAttribute("title") || "") + " " + (node.dataset.testid || ""))
      );
      const directChildFor = (node) => {
        let current = node;
        while (current && current.parentElement !== toolbar) current = current.parentElement;
        return current && current.parentElement === toolbar ? current : null;
      };
      const eraser = directChildFor(eraserButton);
      const trailingNativeButton = directToolbarChildren.at(-1);
      const insertionPoint = eraser ? eraser.nextElementSibling : trailingNativeButton;
      if (insertionPoint && insertionPoint !== quickGroup) {
        toolbar.insertBefore(quickGroup, insertionPoint);
      } else if (!quickGroup.parentElement) {
        toolbar.appendChild(quickGroup);
      }

      const quickTools = [
        { id: "bucketfill", label: "Bucket Fill", icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z" fill="currentColor" stroke="none"/></svg>', shortcut: "B" },
        { id: "autoshape", label: "Draw to Shape", icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 15.5c1.7-4.8 3.4-7.1 5.1-5.8"/><path d="M9.5 12h3.2"/><path d="M11 10.3 12.7 12 11 13.7"/><path d="M16 7h5v10h-5z"/></svg>', shortcut: "⇧X" },
      ];
      quickTools.forEach(({ id, label, icon, shortcut }) => {
        let button = quickGroup.querySelector(`[data-sketchizi-quick-tool="${id}"]`);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "sketchizi-dock-quick-tool";
          button.dataset.sketchiziQuickTool = id;
          // Activate on pointerdown so Excalidraw's toolbar focus/selection
          // updates cannot race the browser's later click event. Keep keyboard
          // activation on click for Enter/Space.
          let pointerActivationAt = 0;
          button.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            pointerActivationAt = Date.now();
            window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: id } }));
          });
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (Date.now() - pointerActivationAt < 700) return;
            window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: id } }));
          });
        }
        button.dataset.sketchiziTooltip = `${label} (${shortcut})`;
        button.setAttribute("aria-label", label);
        button.setAttribute("title", `${label} (${shortcut})`);
        button.removeAttribute("hidden");
        button.disabled = false;
        button.style.display = "inline-flex";
        button.style.visibility = "visible";
        button.style.opacity = "1";
        button.style.flex = "0 0 42px";
        button.style.width = "42px";
        button.style.minWidth = "42px";
        button.style.height = "42px";
        button.innerHTML = `<span aria-hidden="true">${icon}</span>`;
        // appendChild also restores the intended order when Excalidraw mutates
        // the toolbar; only move nodes when they are not already in order.
        if (button.parentElement !== quickGroup) quickGroup.appendChild(button);
      });
      const activeIds = new Set(quickTools.map(({ id }) => id));
      quickGroup.querySelectorAll("[data-sketchizi-quick-tool]").forEach((button) => {
        if (!activeIds.has(button.dataset.sketchiziQuickTool)) button.remove();
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(decorateToolbar);
    };
    schedule();
    window.addEventListener("resize", clampDockToViewport);
    observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      disposed = true;
      activeDragCleanup?.();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("sketchizi:toggle-dock-lock", toggleDockLock);
      window.removeEventListener("resize", clampDockToViewport);
      window.removeEventListener("resize", onToolbarTooltipResize);
      tooltipBindings.forEach(({ show, hide }, button) => {
        button.removeEventListener("pointerenter", show);
        button.removeEventListener("pointerleave", hide);
        button.removeEventListener("focus", show);
        button.removeEventListener("blur", hide);
      });
      tooltipBindings.clear();
      toolbarTooltip.remove();
    };
  }, []);

  // Grid visibility is a separate visual overlay. Grid snapping is applied to
  // changed geometry at pointer-up because Excalidraw's native gridModeEnabled
  // couples the visible grid with snapping. Native elements/handlers stay intact.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let firstFrame = 0;
    let secondFrame = 0;
    let pointerActive = false;
    let gestureSequence = 0;

    const captureBaseline = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!canEdit || viewModeEnabled || event.button !== 0 || !target?.closest(".excalidraw")) return;
      if (target.closest("button, input, textarea, select, [role='menu'], .App-menu, .Island, .popover")) return;
      // Excalidraw may select an unselected element during this same
      // pointerdown. Read selection after its React handler has completed,
      // otherwise click-and-drag on an unselected shape is missed.
      const sequence = ++gestureSequence;
      queueMicrotask(() => {
        if (sequence !== gestureSequence) return;
        const api = apiRef?.current;
        if (!api) return;
        const elements = api.getSceneElements?.() || [];
        const selectedIds = Object.entries(api.getAppState?.().selectedElementIds || {})
          .filter(([, selected]) => selected).map(([id]) => id);
        if (!selectedIds.length) return;
        gridSnapBaselineRef.current = {
          baseline: new Map(elements.filter((element) => element && !element.isDeleted && !element.deleted).map((element) => [element.id, {
            x: element.x, y: element.y, width: element.width, height: element.height,
            angle: element.angle, type: element.type,
          }])),
          selectedIds: new Set(selectedIds),
        };
        pointerActive = true;
      });
    };

    const clearGesture = () => {
      gestureSequence += 1;
      pointerActive = false;
      gridSnapBaselineRef.current = null;
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      firstFrame = 0;
      secondFrame = 0;
    };

    const finishGesture = () => {
      if (!pointerActive) return;
      pointerActive = false;
      const gesture = gridSnapBaselineRef.current;
      gridSnapBaselineRef.current = null;
      if (!gesture || !canEdit || viewModeEnabled) return;
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const api = apiRef?.current;
          if (!api) return;
          const currentElements = api.getSceneElements?.() || [];
          const appState = api.getAppState?.() || {};
          const zoom = Math.max(0.1, Number(appState.zoom?.value ?? appState.zoom) || 1);
          const smartSnapped = snapSceneElementsToSmartGuides(
            currentElements, gesture.baseline, gesture.selectedIds, 8 / zoom,
          );
          const nextElements = smartSnapped !== currentElements
            ? smartSnapped
            : gridSnappingEnabled
              ? snapChangedSceneElements(currentElements, gesture.baseline, gridSize)
              : currentElements;
          if (nextElements !== currentElements) {
            api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.NEVER });
          }
        });
      });
    };

    root.addEventListener("pointerdown", captureBaseline, true);
    window.addEventListener("pointerup", finishGesture);
    window.addEventListener("pointercancel", clearGesture);
    return () => {
      root.removeEventListener("pointerdown", captureBaseline, true);
      window.removeEventListener("pointerup", finishGesture);
      window.removeEventListener("pointercancel", clearGesture);
      clearGesture();
    };
  }, [apiRef, canEdit, gridSize, gridSnappingEnabled, viewModeEnabled]);

  // Add one small Fit-to-content control to Excalidraw's native zoom cluster.
  // Native zoom, undo, and redo controls remain owned by Excalidraw; this
  // button simply delegates to the same viewport API used by Sketchizi's F key.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let disposed = false;
    let observer;
    let fitButton = null;
    const fitToContent = () => {
      const api = apiRef?.current;
      if (!api) return;
      const elements = (api.getSceneElements?.() || []).filter((element) => element && !element.isDeleted && !element.deleted);
      if (!elements.length) return;
      if (typeof api.setViewport === "function") api.setViewport({ target: elements, fit: "contain" });
      else api.scrollToContent?.(elements, { fitToViewport: true, animate: true });
    };
    const placeScrollBackControl = () => {
      const toolbar = root.querySelector(".App-toolbar");
      const buttons = [...root.querySelectorAll("button, [role='button']")];
      const button = buttons.find((candidate) => {
        const label = [
          candidate.getAttribute("aria-label"),
          candidate.getAttribute("title"),
          candidate.textContent,
        ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
        return /scroll back to content/i.test(label);
      });
      if (!button || !toolbar) return;
      button.classList.add("sketchizi-scroll-back-control");
      button.dataset.sketchiziTooltip = "Scroll back to content";
      if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", "Scroll back to content");
      button.removeAttribute("title");
      bindToolbarTooltip(button);

      const dock = toolbar.getBoundingClientRect();
      const buttonWidth = 148;
      const buttonHeight = 42;
      const gap = 12;
      const vertical = toolbar.dataset.sketchiziOrientation === "vertical";
      const dockSide = toolbar.dataset.sketchiziDockSide;
      let left;
      let top;
      if (vertical) {
        left = dockSide === "right" ? dock.left - buttonWidth - gap : dock.right + gap;
        top = dock.top + Math.min(Math.max(0, (dock.height - buttonHeight) / 2), Math.max(0, window.innerHeight - buttonHeight - 8));
      } else {
        const right = dock.right + gap;
        const leftOfDock = dock.left - buttonWidth - gap;
        if (right + buttonWidth <= window.innerWidth - 8) {
          left = right;
          top = dock.top + (dock.height - buttonHeight) / 2;
        } else if (leftOfDock >= 8) {
          left = leftOfDock;
          top = dock.top + (dock.height - buttonHeight) / 2;
        } else {
          left = Math.max(8, Math.min(window.innerWidth - buttonWidth - 8, dock.right - buttonWidth));
          top = dock.bottom + gap;
          if (top + buttonHeight > window.innerHeight - 8) top = Math.max(8, dock.top - buttonHeight - gap);
        }
      }
      left = Math.max(8, Math.min(window.innerWidth - buttonWidth - 8, left));
      top = Math.max(8, Math.min(window.innerHeight - buttonHeight - 8, top));
      button.style.setProperty("position", "fixed", "important");
      button.style.setProperty("left", `${left}px`, "important");
      button.style.setProperty("top", `${top}px`, "important");
      button.style.setProperty("right", "auto", "important");
      button.style.setProperty("bottom", "auto", "important");
      button.style.setProperty("z-index", "10020", "important");
    };
    const suppressNativeScrollBackTooltip = () => {
      document.querySelectorAll('[role="tooltip"]').forEach((tooltip) => {
        if (tooltip.classList.contains("sketchizi-toolbar-tooltip")) return;
        if (!/scroll back to content/i.test(tooltip.textContent || "")) return;
        tooltip.style.setProperty("display", "none", "important");
      });
    };
    const syncNavigationControls = () => {
      if (disposed) return;
      suppressNativeScrollBackTooltip();
      const zoomActions = root.querySelector(".zoom-actions");
      if (!zoomActions) {
        placeScrollBackControl();
        return;
      }
      const zoomRow = zoomActions.querySelector(":scope > .Stack_horizontal") || zoomActions;
      fitButton = zoomRow.querySelector(":scope > .sketchizi-fit-content-button");
      if (!fitButton) {
        fitButton = document.createElement("button");
        fitButton.type = "button";
        fitButton.className = "sketchizi-fit-content-button";
        fitButton.setAttribute("aria-label", "Fit diagram to viewport");
        fitButton.title = "Fit to content (F)";
        fitButton.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3H3v4M3 3l5 5M13 3h4v4M17 3l-5 5M7 17H3v-4M3 17l5-5M13 17h4v-4M17 17l-5-5"/></svg>';
        fitButton.addEventListener("click", fitToContent);
        zoomRow.appendChild(fitButton);
      }
      placeScrollBackControl();

      const visibleElements = (apiRef?.current?.getSceneElements?.() || []).filter((element) => element && !element.isDeleted && !element.deleted);
      fitButton.disabled = !canEdit || viewModeEnabled || visibleElements.length === 0;
      fitContentButtonRef.current = fitButton;

      const nativeTitles = [
        [".zoom-out", "Zoom out"],
        [".zoom-in", "Zoom in"],
        [".reset-zoom", "Reset zoom to 100%"],
        [".undo-button", "Undo (Ctrl/Cmd+Z)"],
        [".redo-button", "Redo (Ctrl+Y / Cmd+Shift+Z)"],
      ];
      nativeTitles.forEach(([selector, title]) => {
        root.querySelectorAll(selector).forEach((button) => {
          if (!button.getAttribute("title")) button.setAttribute("title", title);
        });
      });
    };
    syncNavigationControls();
    observer = new MutationObserver(syncNavigationControls);
    observer.observe(root, { childList: true, subtree: true });
    const repositionOnPointerMove = () => placeScrollBackControl();
    window.addEventListener("resize", repositionOnPointerMove);
    window.addEventListener("pointermove", repositionOnPointerMove, { passive: true });
    const tooltipObserver = new MutationObserver(suppressNativeScrollBackTooltip);
    tooltipObserver.observe(document.body, { childList: true, subtree: true });
    suppressNativeScrollBackTooltip();
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", repositionOnPointerMove);
      window.removeEventListener("pointermove", repositionOnPointerMove);
      tooltipObserver.disconnect();
      root.querySelectorAll(".sketchizi-scroll-back-control").forEach((button) => {
        button.classList.remove("sketchizi-scroll-back-control");
        ["position", "left", "top", "right", "bottom", "z-index"].forEach((property) => button.style.removeProperty(property));
      });
      if (fitButton) {
        fitButton.removeEventListener("click", fitToContent);
        fitButton.remove();
      }
      if (fitContentButtonRef.current === fitButton) fitContentButtonRef.current = null;
    };
  }, [apiRef, canEdit, viewModeEnabled]);

  const updateCursorFromPointer = (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("canvas")) {
      updateCollaborationCursor?.(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    updateCollaborationCursor?.({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  const clearRemoteCursor = () => {
    updateCollaborationCursor?.(null);
  };
  const gridAppState = apiRef?.current?.getAppState?.() || {};
  const gridZoom = Math.max(0.1, Number(gridAppState.zoom?.value ?? gridAppState.zoom) || 1);
  const gridStepPixels = Math.max(5, Number(gridSize) || 20) * gridZoom;
  const rootRect = canvasRootRef.current?.getBoundingClientRect();
  const gridOriginX = ((((Number(gridAppState.scrollX) || 0) * gridZoom) + (rootRect?.width || Number(gridAppState.width) || 0) / 2) % gridStepPixels + gridStepPixels) % gridStepPixels;
  const gridOriginY = ((((Number(gridAppState.scrollY) || 0) * gridZoom) + (rootRect?.height || Number(gridAppState.height) || 0) / 2) % gridStepPixels + gridStepPixels) % gridStepPixels;
  const gridOverlayStyle = {
    "--sketchizi-grid-step": `${gridStepPixels}px`,
    "--sketchizi-grid-origin-x": `${gridOriginX}px`,
    "--sketchizi-grid-origin-y": `${gridOriginY}px`,
  };
  const visibleSceneElements = apiRef?.current?.getSceneElements?.() || savedSketch?.elements || [];
  const isCanvasEmpty = visibleSceneElements.every((element) => element?.isDeleted || element?.deleted);

  return (
    <main ref={canvasRootRef} data-grid-visible={gridVisible ? "true" : "false"} style={gridOverlayStyle} className={viewModeEnabled ? "canvas viewer-mode" : "canvas"} onDropCapture={handleDrop} onPointerMove={updateCursorFromPointer} onPointerLeave={clearRemoteCursor}>
      <Excalidraw
        // Always seed the scene with the active Day/Night background. Legacy
        // saved scenes may contain an old independent canvas color, which must
        // never flash or override the current global theme during initialization.
        initialData={{
          elements: savedSketch?.elements || [],
          appState: {
            ...(savedSketch?.appState || {}),
            // Start in the standard Sketchizi workspace. Zen Mode remains
            // available as an explicit user choice, not the default on startup.
            // Keep this after the saved appState spread so older drawings that
            // were saved in Zen Mode do not force it on for every new session.
            zenModeEnabled: false,
            zoom: { value: savedSketch?.appState?.zoom?.value ?? savedSketch?.appState?.zoom ?? 1 },
            currentItemFontFamily: normalizeFontFamilyId(savedSketch?.appState?.currentItemFontFamily) ?? DEFAULT_FONT_FAMILY_ID,
            viewBackgroundColor: getCanvasBackground(isDarkTheme),
            gridModeEnabled: false,
          },
          files: savedSketch?.files || {},
        }}
        excalidrawAPI={registerExcalidrawAPI}
        onExcalidrawAPI={registerExcalidrawAPI}
        theme={isDarkTheme ? "dark" : "light"}
        viewModeEnabled={viewModeEnabled}
        gridModeEnabled={false}
        aiEnabled={true}
        onChange={handleSceneChange}
        onScrollChange={handleViewportChange}
      />
      {(apiRef.current?.getAppState?.().zenModeEnabled ?? true) && (
        <ContextualFormattingToolbar
          apiRef={apiRef}
          canvasRootRef={canvasRootRef}
          canvasRevision={canvasRevision}
          selectedElements={selectedElements}
          applyToSelected={applyToSelected}
          onOpenProperties={onOpenProperties}
          propertiesOpen={propertiesOpen}
          canEdit={canEdit && !viewModeEnabled}
        />
      )}
      <AlignmentGuides canvasRootRef={canvasRootRef} apiRef={apiRef} canEdit={canEdit} viewModeEnabled={viewModeEnabled} />
      <RemoteCursors participants={collaborationParticipants} selfId={collaborationSelfId} />
      <RemoteSelections participants={collaborationParticipants} selfId={collaborationSelfId} apiRef={apiRef} />
      <Minimap minimapOpen={minimapOpen} minimapScene={minimapScene} apiRef={apiRef} minimapDragRef={minimapDragRef} centerOnMinimap={centerOnMinimap} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={closeShortcuts} />
    </main>
  );
}
