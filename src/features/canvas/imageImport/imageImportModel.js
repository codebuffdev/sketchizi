// Pure helpers shared by the image import hook, dock and tests.

export const INSERT_IMAGE_EVENT = "sketchizi:insert-image";

// Raster formats we can re-encode. SVG is deliberately excluded: it is a vector
// format that Excalidraw sanitizes itself, so it keeps Excalidraw's native path.
const IMPORTABLE_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp",
]);
const IMPORTABLE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

export const IMAGE_PICKER_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp";

export function isImportableImageFile(file) {
  if (!file || typeof file.name !== "string") return false;
  if (file.type) return IMPORTABLE_TYPES.has(file.type.toLowerCase());
  return IMPORTABLE_EXTENSIONS.test(file.name);
}

export function extractImageFiles(fileList) {
  return Array.from(fileList || []).filter(isImportableImageFile);
}

const EXTENSION_BY_TYPE = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

export function replaceExtension(name, mimeType) {
  const extension = EXTENSION_BY_TYPE[mimeType];
  const base = String(name || "image").replace(/\.[^./\\]+$/, "") || "image";
  return extension ? `${base}.${extension}` : base;
}

/**
 * Natural aspect ratio, capped to a comfortable on-screen height so a large
 * photo does not land bigger than the viewport (same rule Excalidraw applies).
 */
export function fitImageToViewport({ naturalWidth, naturalHeight, viewportHeight = 800, zoom = 1 }) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const maxHeight = Math.min(Math.max(viewportHeight - 120, 160), 500) / safeZoom;
  const height = Math.min(naturalHeight, maxHeight);
  const width = (height * naturalWidth) / naturalHeight;
  return { width, height };
}
