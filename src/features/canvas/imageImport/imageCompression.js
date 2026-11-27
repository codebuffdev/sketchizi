// Visually lossless, client-side image shrinking.
//
// Strategy (per the import spec):
//   1. Keep the ORIGINAL pixel dimensions and walk the quality ladder
//      0.92 -> 0.85 -> 0.78 (WebP, or JPEG/PNG when WebP encoding is missing).
//   2. Only if that is still too large, scale the dimensions down in 0.85x steps
//      (aspect ratio preserved, high-quality smoothing) at the lowest quality.
//   3. Transparency is detected first so alpha is never flattened.
//
// `shrinkToLimit` is codec-agnostic (it receives an `encode` function) so the
// stepping logic is unit-tested without a browser. The canvas adapters below are
// only touched at call time, never at import time.

import { replaceExtension } from "./imageImportModel.js";

export const QUALITY_STEPS = Object.freeze([0.92, 0.85, 0.78]);
export const DIMENSION_STEP = 0.85;
export const MIN_LONG_EDGE = 48;
export const MAX_DIMENSION_STEPS = 60;

export class ImageShrinkError extends Error {
  constructor(message = "This image could not be reduced enough to fit your size limit.") {
    super(message);
    this.name = "ImageShrinkError";
  }
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function scaledSize(width, height, scale) {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** WebP handles alpha and compresses best; fall back where it cannot be encoded. */
export function chooseOutputType({ hasAlpha, webpSupported = true }) {
  if (webpSupported) return { mimeType: "image/webp", lossy: true };
  return hasAlpha
    ? { mimeType: "image/png", lossy: false }
    : { mimeType: "image/jpeg", lossy: true };
}

/** True when any pixel has alpha < 255. `rgba` is a flat RGBA byte array. */
export function bufferHasTransparency(rgba) {
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] < 255) return true;
  }
  return false;
}

/**
 * @param {object} options
 * @param {number} options.width            original pixel width
 * @param {number} options.height           original pixel height
 * @param {number} options.maxBytes         hard size ceiling
 * @param {boolean} options.hasAlpha
 * @param {(w:number,h:number,mime:string,quality?:number)=>Promise<Blob>} options.encode
 * @param {AbortSignal} [options.signal]
 */
export async function shrinkToLimit({ width, height, maxBytes, hasAlpha, encode, signal }) {
  let output = chooseOutputType({ hasAlpha, webpSupported: true });
  const lowestQuality = QUALITY_STEPS[QUALITY_STEPS.length - 1];

  for (let step = 0; step <= MAX_DIMENSION_STEPS; step += 1) {
    const scale = DIMENSION_STEP ** step;
    const size = scaledSize(width, height, scale);
    if (step > 0 && Math.max(size.width, size.height) < MIN_LONG_EDGE) break;

    const qualities = step === 0 ? QUALITY_STEPS : [lowestQuality];
    for (const quality of qualities) {
      if (signal?.aborted) throw abortError();
      let blob = await encode(size.width, size.height, output.mimeType, output.lossy ? quality : undefined);

      // Canvas encoders silently answer PNG when they cannot produce WebP.
      if (output.mimeType === "image/webp" && blob.type !== "image/webp") {
        output = chooseOutputType({ hasAlpha, webpSupported: false });
        blob = await encode(size.width, size.height, output.mimeType, output.lossy ? quality : undefined);
      }

      if (blob.size <= maxBytes) {
        return { blob, mimeType: output.mimeType, width: size.width, height: size.height, quality: output.lossy ? quality : null, scaled: step > 0 };
      }
      if (!output.lossy) break; // quality is meaningless for PNG; go straight to resizing
    }
  }
  throw new ImageShrinkError();
}

/* ------------------------------ browser adapters ------------------------------ */

export async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch { /* fall through to <img> decoding */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readImageDimensions(file) {
  const decoded = await decodeImage(file);
  try { return { width: decoded.width, height: decoded.height }; } finally { decoded.close(); }
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
  if (typeof canvas.convertToBlob === "function") return canvas.convertToBlob({ type: mimeType, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageShrinkError("Your browser could not encode this image."))), mimeType, quality);
  });
}

/** Scans in horizontal bands so very large images never need a full-size pixel buffer. */
export function detectTransparency(source, width, height) {
  const bandHeight = Math.max(1, Math.min(height, Math.floor(4_000_000 / Math.max(1, width))));
  const canvas = createCanvas(width, bandHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  for (let top = 0; top < height; top += bandHeight) {
    const rows = Math.min(bandHeight, height - top);
    context.clearRect(0, 0, width, bandHeight);
    context.drawImage(source, 0, top, width, rows, 0, 0, width, rows);
    if (bufferHasTransparency(context.getImageData(0, 0, width, rows).data)) return true;
  }
  return false;
}

export function createCanvasEncoder(source) {
  const canvas = createCanvas(1, 1);
  return async (width, height, mimeType, quality) => {
    canvas.width = width;   // resizing also resets the 2D state
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    return canvasToBlob(canvas, mimeType, quality);
  };
}

/**
 * Shrinks `file` to <= maxBytes. Resolves to a new File plus before/after stats.
 * Animated GIFs are flattened to their first frame (a canvas limitation).
 */
export async function optimizeImageToLimit(file, maxBytes, { signal } = {}) {
  const decoded = await decodeImage(file);
  try {
    if (signal?.aborted) throw abortError();
    const hasAlpha = file.type === "image/jpeg" || file.type === "image/bmp"
      ? false
      : detectTransparency(decoded.source, decoded.width, decoded.height);
    const result = await shrinkToLimit({
      width: decoded.width,
      height: decoded.height,
      maxBytes,
      hasAlpha,
      encode: createCanvasEncoder(decoded.source),
      signal,
    });
    const optimized = new File([result.blob], replaceExtension(file.name, result.mimeType), {
      type: result.mimeType,
      lastModified: Date.now(),
    });
    return { ...result, file: optimized, hasAlpha, originalSize: file.size, newSize: optimized.size };
  } finally {
    decoded.close();
  }
}
