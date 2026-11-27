import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { fetchCurrentUser } from "../../auth/authClient.js";
import { putCachedFiles } from "../../workspace/binaryFileCache.js";
import { formatBytes, isAdminUser, resolveMaxImageBytes } from "./imageSizePolicy.js";
import { optimizeImageToLimit, readImageDimensions } from "./imageCompression.js";
import { IMAGE_PICKER_ACCEPT, INSERT_IMAGE_EVENT, extractImageFiles, fitImageToViewport } from "./imageImportModel.js";

// A sleeping backend must never stall a drop or paste: after this long we fall
// back to the standard-user limit for this import.
const USER_LOOKUP_TIMEOUT_MS = 1500;
const STAGGER_PX = 24;
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";

const isAbort = (error) => error?.name === "AbortError";

function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

async function contentFileId(blob) {
  try {
    const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Role-aware image import for drag-and-drop, clipboard paste and the dock's
 * "Upload Image" picker. Files within the user's limit are placed unchanged;
 * larger ones open a confirmation modal and are optimized in the browser.
 */
export function useImageImport({ apiRef, canvasRootRef, canEdit, viewModeEnabled, showToast }) {
  const [prompt, setPrompt] = useState(null);
  const enabled = Boolean(canEdit) && !viewModeEnabled;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const promptOpenRef = useRef(false);
  const userRef = useRef({ resolved: false, user: null });
  const pointerRef = useRef(null);
  const resolverRef = useRef(null);
  const abortRef = useRef(null);
  const queueRef = useRef(Promise.resolve());

  const notify = useCallback((text, kind) => showToastRef.current?.(text, kind), []);

  const resolveUser = useCallback(async () => {
    if (userRef.current.resolved) return userRef.current.user;
    const lookup = fetchCurrentUser()
      .then((result) => ({ ok: true, user: result?.authenticated ? result.user : null }))
      .catch(() => ({ ok: false, user: null }));
    const settled = await Promise.race([
      lookup,
      new Promise((resolve) => window.setTimeout(() => resolve(null), USER_LOOKUP_TIMEOUT_MS)),
    ]);
    const remember = (result) => { if (result?.ok) userRef.current = { resolved: true, user: result.user }; };
    if (!settled) { lookup.then(remember); return null; }
    remember(settled);
    return settled.user;
  }, []);

  const insertImageFile = useCallback(async (file, origin, index) => {
    const api = apiRef.current;
    const root = canvasRootRef.current;
    if (!api || !root) throw new Error("The editor is still initializing. Please try again in a moment.");

    const [dataURL, natural, fileId] = await Promise.all([
      readAsDataURL(file), readImageDimensions(file), contentFileId(file),
    ]);
    const appState = api.getAppState();
    const rect = root.getBoundingClientRect();
    const { width, height } = fitImageToViewport({
      naturalWidth: natural.width,
      naturalHeight: natural.height,
      viewportHeight: appState.height ?? rect.height,
      zoom: appState.zoom?.value ?? 1,
    });
    const clientX = origin?.clientX ?? rect.left + rect.width / 2;
    const clientY = origin?.clientY ?? rect.top + rect.height / 2;
    const scene = viewportCoordsToSceneCoords({ clientX, clientY }, appState);

    const fileData = { id: fileId, dataURL, mimeType: file.type || "image/png", created: Date.now(), lastRetrieved: Date.now() };
    api.addFiles([fileData]);
    putCachedFiles({ [fileId]: fileData }).catch(() => {});

    const [element] = convertToExcalidrawElements([{
      type: "image",
      x: scene.x - width / 2 + index * STAGGER_PX,
      y: scene.y - height / 2 + index * STAGGER_PX,
      width, height, fileId, status: "saved",
    }]);
    api.updateScene({
      elements: [...api.getSceneElements(), element],
      appState: { selectedElementIds: { [element.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [apiRef, canvasRootRef]);

  const askToShrink = useCallback((file, maxBytes, admin) => new Promise((resolve) => {
    resolverRef.current = resolve;
    promptOpenRef.current = true;
    setPrompt({ file, maxBytes, isAdmin: admin, busy: false });
  }), []);

  const closePrompt = useCallback(() => {
    resolverRef.current = null;
    abortRef.current = null;
    promptOpenRef.current = false;
    setPrompt(null);
  }, []);

  const processFiles = useCallback(async (files, origin) => {
    const user = await resolveUser();
    const maxBytes = resolveMaxImageBytes(user);
    let placed = 0;
    for (const file of files) {
      try {
        if (file.size <= maxBytes) {
          await insertImageFile(file, origin, placed);
          placed += 1;
          continue;
        }
        const decision = await askToShrink(file, maxBytes, isAdminUser(user));
        if (decision !== "shrink") continue;
        const controller = new AbortController();
        abortRef.current = controller;
        const result = await optimizeImageToLimit(file, maxBytes, { signal: controller.signal });
        await insertImageFile(result.file, origin, placed);
        placed += 1;
        notify(`Optimized image from ${formatBytes(result.originalSize)} → ${formatBytes(result.newSize)}`);
      } catch (error) {
        if (!isAbort(error)) notify(error?.message || "Could not import this image.", "error");
      } finally {
        if (promptOpenRef.current) closePrompt();
      }
    }
  }, [askToShrink, closePrompt, insertImageFile, notify, resolveUser]);

  // Serialize imports so two quick drops cannot stack two modals.
  const importFiles = useCallback((files, origin) => {
    queueRef.current = queueRef.current.then(() => processFiles(files, origin)).catch(() => {});
  }, [processFiles]);

  const openPicker = useCallback(() => {
    if (!enabledRef.current || promptOpenRef.current) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_PICKER_ACCEPT;
    input.multiple = true;
    input.style.display = "none";
    const cleanup = () => input.remove();
    input.addEventListener("change", () => {
      const files = extractImageFiles(input.files);
      cleanup();
      if (files.length) importFiles(files, null);
    });
    input.addEventListener("cancel", cleanup);
    document.body.appendChild(input);
    input.click();
  }, [importFiles]);

  const confirmShrink = useCallback(() => {
    setPrompt((current) => (current ? { ...current, busy: true } : current));
    resolverRef.current?.("shrink");
  }, []);

  const cancelPrompt = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); return; } // optimizing: abort cooperatively
    resolverRef.current?.("cancel");
    closePrompt();
  }, [closePrompt]);

  useEffect(() => {
    const reset = () => { userRef.current = { resolved: false, user: null }; };
    window.addEventListener("sketchizi:auth-changed", reset);
    if (enabled) resolveUser();
    return () => window.removeEventListener("sketchizi:auth-changed", reset);
  }, [enabled, resolveUser]);

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    const isVisible = () => root.getClientRects().length > 0;
    const inEditable = (event) => event.target instanceof Element && !!event.target.closest(EDITABLE_SELECTOR);

    const onDrop = (event) => {
      if (!enabledRef.current || !(event.target instanceof Element) || !event.target.closest(".excalidraw")) return;
      const files = extractImageFiles(event.dataTransfer?.files);
      if (!files.length) return; // not an image: leave .sketchizi/.excalidraw/SVG drops to Excalidraw
      event.preventDefault();
      event.stopPropagation(); // keep Excalidraw's own (unlimited-by-role) drop path out of it
      importFiles(files, { clientX: event.clientX, clientY: event.clientY });
    };
    const onPaste = (event) => {
      if (!enabledRef.current || promptOpenRef.current || !isVisible() || inEditable(event)) return;
      const files = extractImageFiles(event.clipboardData?.files);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation(); // Excalidraw listens on document; we run first on window
      const pointer = pointerRef.current;
      const rect = root.getBoundingClientRect();
      const inside = pointer && pointer.clientX >= rect.left && pointer.clientX <= rect.right
        && pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
      importFiles(files, inside ? pointer : null);
    };
    // Excalidraw's native image shortcut ("9") would open its own, role-unaware picker.
    const onKeyDown = (event) => {
      if (event.key !== "9" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (!enabledRef.current || promptOpenRef.current || !isVisible() || inEditable(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPicker();
    };
    const onPointerMove = (event) => { pointerRef.current = { clientX: event.clientX, clientY: event.clientY }; };
    const onInsertImage = (event) => {
      if (!enabledRef.current) return;
      event.preventDefault(); // tells the dispatcher this surface handled the request
      openPicker();
    };

    root.addEventListener("drop", onDrop, true);
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("paste", onPaste, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(INSERT_IMAGE_EVENT, onInsertImage);
    return () => {
      root.removeEventListener("drop", onDrop, true);
      root.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("paste", onPaste, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(INSERT_IMAGE_EVENT, onInsertImage);
    };
  }, [canvasRootRef, importFiles, openPicker]);

  return { prompt, confirmShrink, cancelPrompt, openPicker };
}
