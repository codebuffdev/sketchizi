import { CaptureUpdateAction, convertToExcalidrawElements, restoreElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { logger } from "../../logging/logger";
import { insertAwsResource, isIntelligentAwsResourceIcon } from "../aws-resources/awsResourceService";
import { insertKubernetesResource, isIntelligentKubernetesResourceIcon } from "../kubernetes-resources/kubernetesResourceService";
import { insertNetworkingResource, isIntelligentNetworkingResourceIcon } from "../networking/networkingResourceService.js";

export function createEditableLibraryElements(icon, x, y) {
    const source = icon?.source;
    const id = icon?.id || "";
    const groupId = `${source}-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const groups = [groupId];
    const elements = [];
    const add = (spec) => elements.push({ ...spec, groupIds: groups, customData: { ...(spec.customData || {}), diagramIcon: true, editableTemplate: true, iconId: icon.id, iconName: icon.name, iconCategory: icon.category, iconSource: source } });
    const text = (tx, ty, tw, value, opts = {}) => add({ type: "text", x: tx, y: ty, width: tw, text: value, fontSize: opts.fontSize || 16, fontFamily: opts.fontFamily ?? 1, textAlign: opts.textAlign || "center", verticalAlign: opts.verticalAlign || "middle", strokeColor: opts.strokeColor || "#1e1e1e", backgroundColor: opts.backgroundColor || "transparent", autoResize: false });

    const box = (bx, by, bw, bh, opts = {}) => add({ type: "rectangle", x: bx, y: by, width: bw, height: bh, strokeColor: opts.strokeColor || "#1e1e1e", backgroundColor: opts.backgroundColor || "#ffffff", fillStyle: opts.fillStyle || "solid", strokeWidth: opts.strokeWidth || 2, roughness: 0, roundness: opts.roundness ?? { type: 3 } });
    const line = (x1, y1, x2, y2, opts = {}) => {
      const lx = Math.min(x1, x2), ly = Math.min(y1, y2);
      add({ type: "line", x: lx, y: ly, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), points: [[x1 - lx, y1 - ly], [x2 - lx, y2 - ly]], strokeColor: opts.strokeColor || "#1e1e1e", strokeWidth: opts.strokeWidth || 2, roughness: 0, strokeStyle: opts.strokeStyle || "solid", startArrowhead: opts.startArrowhead, endArrowhead: opts.endArrowhead });
    };
    const arrow = (x1, y1, x2, y2, opts = {}) => line(x1, y1, x2, y2, { ...opts, endArrowhead: opts.endArrowhead || "triangle" });
    const diamond = (dx, dy, dw, dh, opts = {}) => {
      const cx = dx + dw / 2, cy = dy + dh / 2;
      add({ type: "diamond", x: dx, y: dy, width: dw, height: dh, strokeColor: opts.strokeColor || "#5b55c7", backgroundColor: opts.backgroundColor || "#f6f4ff", fillStyle: "solid", strokeWidth: opts.strokeWidth || 2, roughness: 0 });
      return { cx, cy };
    };
    const ellipse = (ex, ey, ew, eh, opts = {}) => add({ type: "ellipse", x: ex, y: ey, width: ew, height: eh, strokeColor: opts.strokeColor || "#1e1e1e", backgroundColor: opts.backgroundColor || "#ffffff", fillStyle: "solid", strokeWidth: opts.strokeWidth || 2, roughness: 0 });

    if (source === "uml") {
      const W = 220, H = 150;
      switch (id) {
        case "uml-class":
        case "uml-abstract-class": {
          const abstract = id === "uml-abstract-class";
          box(x, y, W, H);
          line(x, y + 42, x + W, y + 42);
          line(x, y + 94, x + W, y + 94);
          text(x + 10, y + 6, W - 20, abstract ? "Abstract" : "Class", { fontSize: 21, textAlign: "center" });
          text(x + 14, y + 48, W - 28, abstract ? "# field: Type" : "+ field: Type", { fontSize: 14, textAlign: "left" });
          text(x + 14, y + 100, W - 28, abstract ? "# method()" : "+ method()", { fontSize: 14, textAlign: "left" });
          break;
        }
        case "uml-interface": {
          box(x, y, W, H);
          line(x, y + 48, x + W, y + 48);
          text(x + 8, y + 5, W - 16, "<<interface>>", { fontSize: 17, strokeColor: "#5b55c7" });
          text(x + 8, y + 53, W - 16, "Repository", { fontSize: 21 });
          text(x + 14, y + 104, W - 28, "+ save()", { fontSize: 14, textAlign: "left" });
          break;
        }
        case "uml-enum": {
          box(x, y, W, H);
          line(x, y + 46, x + W, y + 46);
          text(x + 8, y + 5, W - 16, "<<enum>>", { fontSize: 17, strokeColor: "#5b55c7" });
          text(x + 8, y + 51, W - 16, "Status", { fontSize: 20 });
          text(x + 14, y + 92, W - 28, "ACTIVE", { fontSize: 13, textAlign: "left" });
          text(x + 14, y + 120, W - 28, "INACTIVE", { fontSize: 13, textAlign: "left" });
          break;
        }
        case "uml-package": {
          box(x, y + 28, W, H - 28, { roundness: { type: 3 } });
          box(x + 10, y, 78, 38, { roundness: { type: 3 } });
          text(x + 15, y + 52, W - 30, "Package", { fontSize: 20 });
          break;
        }
        case "uml-actor": {
          ellipse(x + 88, y + 4, 44, 44);
          line(x + 110, y + 48, x + 110, y + 98);
          line(x + 75, y + 65, x + 145, y + 65);
          line(x + 110, y + 98, x + 88, y + 132);
          line(x + 110, y + 98, x + 132, y + 132);
          text(x + 50, y + 132, 120, "Actor", { fontSize: 16 });
          break;
        }
        case "uml-use-case": {
          ellipse(x, y + 20, W, 92);
          text(x + 16, y + 46, W - 32, "Use Case", { fontSize: 18 });
          break;
        }
        case "uml-component": {
          box(x, y, W, H);
          box(x + 12, y + 20, 28, 24, { strokeWidth: 1.5 });
          box(x + 12, y + 50, 28, 24, { strokeWidth: 1.5 });
          box(x + 12, y + 80, 28, 24, { strokeWidth: 1.5 });
          text(x + 48, y + 34, W - 60, "Component", { fontSize: 18, textAlign: "left" });
          break;
        }
        case "uml-node": {
          const top = y + 25;
          box(x + 10, top, W - 10, H - 35);
          line(x + W - 10, top, x + W, top + 18);
          line(x + W, top + 18, x + W, y + H - 10);
          text(x + 30, y + 55, W - 60, "Node", { fontSize: 20 });
          break;
        }
        case "uml-note": {
          box(x + 10, y + 8, W - 20, H - 16);
          text(x + 24, y + 40, W - 48, "Note", { fontSize: 20 });
          text(x + 24, y + 78, W - 48, "Add your note", { fontSize: 14, textAlign: "left" });
          break;
        }
        case "uml-association": {
          box(x, y + 52, 54, 46); box(x + W - 54, y + 52, 54, 46); line(x + 54, y + 75, x + W - 54, y + 75); break;
        }
        case "uml-generalization": {
          box(x, y + 84, 54, 46); box(x + W - 54, y, 54, 46); arrow(x + 54, y + 84, x + W - 54, y + 46); break;
        }
        case "uml-realization": {
          box(x, y + 84, 54, 46); box(x + W - 54, y, 54, 46); line(x + 54, y + 84, x + W - 54, y + 46, { strokeStyle: "dashed", endArrowhead: "triangle" }); break;
        }
        case "uml-aggregation": {
          box(x, y + 52, 54, 46); box(x + W - 54, y + 52, 54, 46); line(x + 54, y + 75, x + W - 90, y + 75); diamond(x + W - 90, y + 59, 32, 32, { backgroundColor: "#ffffff" }); break;
        }
        case "uml-composition": {
          box(x, y + 52, 54, 46); box(x + W - 54, y + 52, 54, 46); line(x + 54, y + 75, x + W - 90, y + 75); diamond(x + W - 90, y + 59, 32, 32, { backgroundColor: "#1e1e1e", strokeColor: "#1e1e1e" }); break;
        }
        default: box(x, y, W, H); text(x + 10, y + 55, W - 20, icon.name, { fontSize: 18 });
      }
    } else if (source === "mindmap") {
      const W = 230, H = 92;
      const accentStroke = "#5b55c7";
      switch (id) {
        case "mind-central-topic":
          box(x, y, W, H, { strokeColor: accentStroke, backgroundColor: "#f6f4ff", strokeWidth: 3 });
          text(x + 12, y + 22, W - 24, "Central Topic", { fontSize: 22 });
          break;
        case "mind-main-topic":
          box(x, y, W, H, { strokeColor: accentStroke, backgroundColor: "#ffffff", strokeWidth: 2 });
          text(x + 12, y + 22, W - 24, "Main Topic", { fontSize: 20 });
          break;
        case "mind-subtopic":
          box(x, y, 190, 76, { strokeColor: accentStroke, backgroundColor: "#ffffff" });
          text(x + 10, y + 18, 170, "Subtopic", { fontSize: 17 });
          break;
        case "mind-floating-topic":
          box(x, y, 210, 76, { strokeColor: "#1e1e1e", backgroundColor: "#ffffff", strokeStyle: "dashed" });
          text(x + 10, y + 18, 190, "Floating Topic", { fontSize: 17 });
          break;
        case "mind-summary":
          diamond(x, y + 8, 210, 76, { strokeColor: accentStroke, backgroundColor: "#f6f4ff", strokeWidth: 3 });
          text(x + 16, y + 28, 178, "Summary", { fontSize: 17 });
          break;
        case "mind-boundary":
          box(x, y, 230, 110, { strokeColor: accentStroke, backgroundColor: "transparent", strokeWidth: 2 });
          text(x + 15, y + 35, 200, "Boundary", { fontSize: 18, strokeColor: accentStroke });
          break;
        case "mind-relationship":
          box(x, y + 28, 54, 54, { strokeColor: accentStroke, backgroundColor: "#ffffff" }); box(x + 176, y + 28, 54, 54, { strokeColor: accentStroke, backgroundColor: "#ffffff" });
          line(x + 54, y + 55, x + 176, y + 55, { strokeColor: accentStroke, endArrowhead: "triangle" });
          break;
        case "mind-branch":
          ellipse(x, y + 38, 18, 18, { strokeColor: accentStroke, backgroundColor: accentStroke });
          arrow(x + 18, y + 47, x + 118, y + 18, { strokeColor: "#1e1e1e" }); arrow(x + 18, y + 47, x + 118, y + 76, { strokeColor: "#1e1e1e" });
          ellipse(x + 118, y + 6, 18, 18, { strokeColor: accentStroke, backgroundColor: "#ffffff" }); ellipse(x + 118, y + 66, 18, 18, { strokeColor: accentStroke, backgroundColor: "#ffffff" });
          break;
        case "mind-callout":
          box(x, y + 8, 230, 80, { strokeColor: accentStroke, backgroundColor: "#ffffff" });
          text(x + 14, y + 29, 202, "Callout", { fontSize: 18 });
          break;
        default: box(x, y, W, H); text(x + 12, y + 22, W - 24, icon.name, { fontSize: 18 });
      }
    }

    return convertToExcalidrawElements(elements);
  };

export function createIconInserter({ apiRef, gridEnabled, gridSize, markRecentlyUsed }) {
  const addIconToCanvas = (icon, clientX, clientY, options = {}) => {
    const exact = options.exact === true;
    const api = apiRef.current;
    if (!api) { logger.warn("Excalidraw API not ready; icon was not inserted.", { category: "canvas", operation: "icon-insert" }); return; }

    const canvas = document.querySelector(".excalidraw");
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const appState = api.getAppState();
    const { x: sceneClientX, y: sceneClientY } = viewportCoordsToSceneCoords(
      { clientX, clientY },
      appState,
    );

    const width = 120;
    const height = 120;

    // Click-to-place should not put every icon at exactly the same
    // coordinates. Start at the requested point, then look for the first
    // nearby position that does not overlap an existing diagram icon.
    // Use Excalidraw's own viewport → scene conversion so offsets, zoom and
    // scroll semantics stay identical to the editor itself.
    let baseX = sceneClientX - width / 2;
    let baseY = sceneClientY - height / 2;

    if (gridEnabled) {
      baseX = Math.round(baseX / gridSize) * gridSize;
      baseY = Math.round(baseY / gridSize) * gridSize;
    }

    const existingIcons = api
      .getSceneElements()
      .filter(
        (element) =>
          element.type === "image" && element.customData?.diagramIcon
      );

    // Always place a new icon beside an existing icon instead of stacking
    // multiple clicked icons at the same position. We first try the requested
    // position, then move horizontally in fixed steps until the slot is free.
    const gap = 24;
    const stepX = width + gap;

    const overlaps = (x, y) =>
      existingIcons.some((element) => {
        return (
          x < element.x + element.width &&
          x + width > element.x &&
          y < element.y + element.height &&
          y + height > element.y
        );
      });

    let x = baseX;
    let y = baseY;

    if (!exact && overlaps(x, y)) {
      // Prefer the right-hand side so icons form a clean horizontal row.
      let found = false;
      for (let i = 1; i <= existingIcons.length + 20; i += 1) {
        const candidateX = baseX + i * stepX;
        if (!overlaps(candidateX, baseY)) {
          x = candidateX;
          found = true;
          break;
        }
      }

      // If the right side is crowded, search left.
      if (!found) {
        for (let i = 1; i <= existingIcons.length + 20; i += 1) {
          const candidateX = baseX - i * stepX;
          if (!overlaps(candidateX, baseY)) {
            x = candidateX;
            found = true;
            break;
          }
        }
      }

      // Finally search vertically if the whole row is occupied.
      if (!found) {
        for (let row = 1; row <= existingIcons.length + 20 && !found; row += 1) {
          for (const direction of [1, -1]) {
            const candidateY = baseY + direction * row * (height + gap);
            if (!overlaps(baseX, candidateY)) {
              x = baseX;
              y = candidateY;
              found = true;
              break;
            }
          }
        }
      }
    }

    const commitInsertedElements = (newElements) => {
      if (!newElements?.length) return;

      // Match Excalidraw's own library/paste insertion pipeline: restore the
      // elements and retain deleted scene elements before replacing the scene.
      // Excalidraw then performs its own scene/index normalization internally.
      const restoredElements = restoreElements(newElements, null, {
        deleteInvisibleElements: true,
      });
      if (!restoredElements.length) return;

      const previousElements = api.getSceneElementsIncludingDeleted();
      const nextElements = [...previousElements, ...restoredElements];
      const ids = restoredElements.map((element) => element.id);
      api.updateScene({
        elements: nextElements,
        appState: {
          ...api.getAppState(),
          selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])),
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      markRecentlyUsed(icon);
    };

    if (icon.source === "uml" || icon.source === "mindmap") {
      commitInsertedElements(createEditableLibraryElements(icon, x, y));
      return;
    }

    if (isIntelligentAwsResourceIcon(icon)) {
      void insertAwsResource({ api, icon, x, y, markRecentlyUsed });
      return;
    }

    if (isIntelligentKubernetesResourceIcon(icon)) {
      void insertKubernetesResource({ api, icon, x, y, markRecentlyUsed });
      return;
    }

    if (isIntelligentNetworkingResourceIcon(icon)) {
      insertNetworkingResource({ api, icon, x, y, markRecentlyUsed });
      return;
    }

    const fileId = `icon-${icon.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    // Use the Eraser SVG URL itself as the Excalidraw file source.
    // The previous version wrapped the remote SVG inside a data: SVG. Browsers
    // block that nested cross-origin resource in many contexts, which caused
    // the broken-image placeholder on the canvas. Excalidraw ultimately loads
    // the file source through an <img>, so keeping the original SVG URL is the
    // correct path and preserves the real Eraser artwork.
    const imageSource = icon.src;

    const addImage = (dataURL) => {
      api.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType: "image/svg+xml",
          created: Date.now(),
          lastRetrieved: Date.now(),
        },
      ]);

      const elements = convertToExcalidrawElements([
        {
          type: "image",
          x,
          y,
          width,
          height,
          fileId,
          customData: {
            diagramIcon: true,
            iconId: icon.id,
            iconName: icon.name,
            iconCategory: icon.category,
          },
        },
      ]);

      commitInsertedElements(elements);
    };

    // Fetch through the same-origin proxy so Excalidraw receives a genuine
    // self-contained SVG data URL. This also makes insertion work when the
    // Eraser bucket itself does not expose CORS headers.
    fetch(imageSource, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Icon request failed (${response.status})`);
        return response.text();
      })
      .then((svg) => {
        const dataURL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        addImage(dataURL);
      })
      .catch((error) => {
        logger.error("Could not load Eraser icon", error, { category: "canvas", operation: "icon-insert", iconSource: "eraser" });
      });
  };
  return addIconToCanvas;
}

export function createStarterMindMap(apiRef) {
    const api = apiRef.current;
    if (!api) return;

    const appState = api.getAppState();
    const zoom = appState.zoom?.value || 1;
    const scrollX = appState.scrollX || 0;
    const scrollY = appState.scrollY || 0;
    const canvas = document.querySelector(".excalidraw");
    const rect = canvas?.getBoundingClientRect();
    const centerX = rect ? (rect.width / 2) / zoom - scrollX : -320;
    const centerY = rect ? (rect.height / 2) / zoom - scrollY : -120;

    const topicW = 180;
    const topicH = 64;
    const childW = 150;
    const childH = 54;
    const centralX = centerX - topicW / 2;
    const centralY = centerY - topicH / 2;
    const childXs = [centralX - 230, centralX + topicW + 50];
    const childYs = [centralY - 95, centralY + 5, centralY + 105];

    const nodes = [
      { x: centralX, y: centralY, width: topicW, height: topicH, text: "Central Topic", accent: true },
      { x: childXs[0], y: childYs[0], width: childW, height: childH, text: "Main Topic 1" },
      { x: childXs[0], y: childYs[1], width: childW, height: childH, text: "Main Topic 2" },
      { x: childXs[0], y: childYs[2], width: childW, height: childH, text: "Main Topic 3" },
      { x: childXs[1], y: childYs[0], width: childW, height: childH, text: "Main Topic 4" },
      { x: childXs[1], y: childYs[1], width: childW, height: childH, text: "Main Topic 5" },
      { x: childXs[1], y: childYs[2], width: childW, height: childH, text: "Main Topic 6" },
    ];

    const elements = [];
    const ids = [];

    nodes.forEach((node) => {
      const group = `mind-map-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const box = convertToExcalidrawElements([{
        type: "rectangle",
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        strokeColor: node.accent ? "#5b55c7" : "#1e1e1e",
        backgroundColor: node.accent ? "#f6f4ff" : "#ffffff",
        fillStyle: "solid",
        strokeWidth: 2,
        roughness: 0,
        roundness: { type: 3 },
        groupIds: [group],
        customData: { mindMap: true, kind: node.accent ? "central" : "topic" },
      }, {
        type: "text",
        x: node.x + 16,
        y: node.y + 20,
        width: node.width - 32,
        text: node.text,
        fontSize: node.accent ? 20 : 16,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        strokeColor: "#1e1e1e",
        groupIds: [group],
        customData: { mindMap: true },
      }]);
      elements.push(...box);
      ids.push(...box.map((item) => item.id));
    });

    const centralRight = centralX + topicW;
    const centralMidY = centralY + topicH / 2;
    childYs.forEach((y) => {
      const childMidY = y + childH / 2;
      const leftStartX = childXs[0] + childW;
      const leftStartY = childMidY;
      const leftEndX = centralX;
      const leftEndY = centralMidY;
      const leftX = Math.min(leftStartX, leftEndX);
      const leftY = Math.min(leftStartY, leftEndY);
      const leftDX = leftEndX - leftStartX;
      const leftDY = leftEndY - leftStartY;
      elements.push(...convertToExcalidrawElements([{
        type: "arrow",
        x: leftX,
        y: leftY,
        width: Math.abs(leftDX),
        height: Math.abs(leftDY),
        points: [[leftStartX - leftX, leftStartY - leftY], [leftEndX - leftX, leftEndY - leftY]],
        strokeColor: "#5b55c7",
        strokeWidth: 2,
        roughness: 0,
        endArrowhead: "triangle",
        customData: { mindMap: true, kind: "branch" },
      }]));

      const rightStartX = centralRight;
      const rightStartY = centralMidY;
      const rightEndX = childXs[1];
      const rightEndY = childMidY;
      const rightX = Math.min(rightStartX, rightEndX);
      const rightY = Math.min(rightStartY, rightEndY);
      const rightDX = rightEndX - rightStartX;
      const rightDY = rightEndY - rightStartY;
      elements.push(...convertToExcalidrawElements([{
        type: "arrow",
        x: rightX,
        y: rightY,
        width: Math.abs(rightDX),
        height: Math.abs(rightDY),
        points: [[rightStartX - rightX, rightStartY - rightY], [rightEndX - rightX, rightEndY - rightY]],
        strokeColor: "#5b55c7",
        strokeWidth: 2,
        roughness: 0,
        endArrowhead: "triangle",
        customData: { mindMap: true, kind: "branch" },
      }]));
    });

    api.updateScene({
      elements: [...api.getSceneElements(), ...elements],
      appState: { ...api.getAppState(), selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };
