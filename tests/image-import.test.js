import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_MAX_IMAGE_SIZE, DEFAULT_STANDARD_MAX_IMAGE_SIZE, formatBytes, resolveMaxImageBytes,
} from "../src/features/canvas/imageImport/imageSizePolicy.js";
import {
  DIMENSION_STEP, ImageShrinkError, QUALITY_STEPS, bufferHasTransparency, chooseOutputType, shrinkToLimit,
} from "../src/features/canvas/imageImport/imageCompression.js";
import {
  extractImageFiles, fitImageToViewport, isImportableImageFile, replaceExtension,
} from "../src/features/canvas/imageImport/imageImportModel.js";

const MB = 1024 * 1024;
const blobOf = (size, type) => new Blob([new Uint8Array(size)], { type });

test("admins get 4 MB; standard users use plan config or the 2 MB default", () => {
  assert.equal(ADMIN_MAX_IMAGE_SIZE, 4 * MB);
  assert.equal(resolveMaxImageBytes({ role: "admin" }), 4 * MB);
  assert.equal(resolveMaxImageBytes({ role: "admin", limits: { maxImageSizeBytes: 1 } }), 4 * MB);
  assert.equal(resolveMaxImageBytes({ role: "user" }), DEFAULT_STANDARD_MAX_IMAGE_SIZE);
  assert.equal(resolveMaxImageBytes(null), 2 * MB);
  assert.equal(resolveMaxImageBytes({ role: "user", limits: { maxImageSizeBytes: 3 * MB } }), 3 * MB);
  for (const bad of [0, -5, "abc", NaN, null]) {
    assert.equal(resolveMaxImageBytes({ limits: { maxImageSizeBytes: bad } }), 2 * MB);
  }
});

test("formatBytes matches the modal and toast copy", () => {
  assert.equal(formatBytes(6.4 * MB), "6.4 MB");
  assert.equal(formatBytes(4 * MB), "4 MB");
  assert.equal(formatBytes(1.8 * MB), "1.8 MB");
  assert.equal(formatBytes(812 * 1024), "812 KB");
  assert.equal(formatBytes(0), "0 B");
});

test("transparency detection finds any alpha < 255", () => {
  assert.equal(bufferHasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), false);
  assert.equal(bufferHasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254])), true);
});

test("output type: WebP when available, otherwise PNG for alpha and JPEG for opaque", () => {
  assert.equal(chooseOutputType({ hasAlpha: true }).mimeType, "image/webp");
  assert.equal(chooseOutputType({ hasAlpha: true, webpSupported: false }).mimeType, "image/png");
  assert.equal(chooseOutputType({ hasAlpha: false, webpSupported: false }).mimeType, "image/jpeg");
});

test("keeps original dimensions and stops at the first quality that fits", async () => {
  const calls = [];
  const sizes = { 0.92: 5 * MB, 0.85: 3 * MB, 0.78: 1 * MB };
  const result = await shrinkToLimit({
    width: 4000, height: 3000, maxBytes: 2 * MB, hasAlpha: false,
    encode: async (w, h, type, q) => { calls.push([w, h, type, q]); return blobOf(sizes[q], type); },
  });
  assert.deepEqual(calls.map((c) => c[3]), [0.92, 0.85, 0.78]);
  assert.ok(calls.every(([w, h]) => w === 4000 && h === 3000));
  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.scaled, false);
  assert.equal(result.quality, 0.78);
  assert.deepEqual(QUALITY_STEPS, [0.92, 0.85, 0.78]);
});

test("only scales down (0.85x steps, aspect preserved) after the quality ladder fails", async () => {
  const calls = [];
  const result = await shrinkToLimit({
    width: 4000, height: 3000, maxBytes: 2 * MB, hasAlpha: true,
    encode: async (w, h, type, q) => {
      calls.push([w, h, q]);
      // size shrinks with area: 4000x3000 -> 6 MB
      return blobOf(Math.round(6 * MB * (w * h) / (4000 * 3000)), type);
    },
  });
  assert.deepEqual(calls.slice(0, 3).map((c) => c[2]), [0.92, 0.85, 0.78]);
  const scaled = calls.slice(3);
  assert.ok(scaled.length >= 1 && scaled.every((c) => c[2] === 0.78));
  assert.equal(scaled[0][0], Math.round(4000 * DIMENSION_STEP));
  assert.equal(scaled[0][1], Math.round(3000 * DIMENSION_STEP));
  scaled.forEach(([w, h]) => assert.ok(Math.abs(w / h - 4 / 3) < 0.01));
  assert.equal(result.scaled, true);
  assert.ok(result.blob.size <= 2 * MB);
});

test("falls back when the browser cannot encode WebP", async () => {
  const seen = [];
  const result = await shrinkToLimit({
    width: 100, height: 100, maxBytes: 10, hasAlpha: true,
    encode: async (w, h, type) => { seen.push(type); return blobOf(5, type === "image/webp" ? "image/png" : type); },
  });
  assert.deepEqual(seen, ["image/webp", "image/png"]);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.quality, null);
});

test("aborts, and fails clearly when nothing fits", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    shrinkToLimit({ width: 10, height: 10, maxBytes: 1, hasAlpha: false, encode: async () => blobOf(1, "image/webp"), signal: controller.signal }),
    { name: "AbortError" },
  );
  await assert.rejects(
    shrinkToLimit({ width: 500, height: 500, maxBytes: 1, hasAlpha: false, encode: async (w, h, t) => blobOf(100, t) }),
    ImageShrinkError,
  );
});

test("file filtering leaves SVG and non-images to Excalidraw", () => {
  const f = (name, type) => ({ name, type });
  assert.equal(isImportableImageFile(f("a.png", "image/png")), true);
  assert.equal(isImportableImageFile(f("a.svg", "image/svg+xml")), false);
  assert.equal(isImportableImageFile(f("a.sketchizi", "")), false);
  assert.equal(isImportableImageFile(f("photo.JPG", "")), true);
  assert.equal(extractImageFiles([f("a.png", "image/png"), f("b.txt", "text/plain")]).length, 1);
  assert.equal(extractImageFiles(null).length, 0);
});

test("extension follows the encoded type and placement keeps aspect ratio", () => {
  assert.equal(replaceExtension("holiday.photo.png", "image/webp"), "holiday.photo.webp");
  assert.equal(replaceExtension("scan.PNG", "image/jpeg"), "scan.jpg");
  const fit = fitImageToViewport({ naturalWidth: 4000, naturalHeight: 3000, viewportHeight: 900, zoom: 1 });
  assert.equal(fit.height, 500);
  assert.ok(Math.abs(fit.width / fit.height - 4 / 3) < 1e-9);
  const small = fitImageToViewport({ naturalWidth: 100, naturalHeight: 50, viewportHeight: 900, zoom: 1 });
  assert.deepEqual(small, { width: 100, height: 50 });
});
