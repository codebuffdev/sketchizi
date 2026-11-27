// Pre-upload inspection for "Save to Cloud" (local -> cloud migration). Pure: no DOM, unit-tested.
//
// Local canvases may hold any image at full resolution. The cloud limit (4 MB admin / 2 MB standard)
// applies to the whole serialized payload, whose embedded images travel as base64 data URLs (~1.33x
// their file size). When the payload is too big we plan how far each image must shrink so the whole
// document fits, instead of only checking each image on its own.

export const PAYLOAD_SAFETY = 0.96;      // leave headroom for re-serialization differences
export const MIN_IMAGE_TARGET_BYTES = 24 * 1024;

const dataUrlBody = (dataURL) => {
  const comma = typeof dataURL === "string" ? dataURL.indexOf(",") : -1;
  return comma === -1 ? "" : dataURL.slice(comma + 1);
};

/** Decoded (file) size of a base64 data URL. */
export function decodedDataUrlBytes(dataURL) {
  const body = dataUrlBody(dataURL);
  if (!body) return 0;
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/** Embedded images of a document, largest first. */
export function listEmbeddedImages(document) {
  const files = document?.files && typeof document.files === "object" ? document.files : {};
  return Object.entries(files)
    .filter(([, file]) => typeof file?.dataURL === "string" && file.dataURL.startsWith("data:"))
    .map(([id, file]) => ({
      id,
      mimeType: file.mimeType || "image/png",
      dataUrlBytes: file.dataURL.length,
      decodedBytes: decodedDataUrlBytes(file.dataURL),
    }))
    .sort((a, b) => b.dataUrlBytes - a.dataUrlBytes);
}

/**
 * Decide which images must shrink so the whole payload fits `maxBytes`.
 * Returns { needed, feasible, targets[] } where each target is
 * { id, decodedBytes, targetBlobBytes } (largest images first, only those that actually must shrink).
 */
export function planImageShrink({ totalBytes, maxBytes, images }) {
  if (!Number.isFinite(totalBytes) || totalBytes <= maxBytes) return { needed: false, feasible: true, targets: [] };
  const list = Array.isArray(images) ? images : [];
  const sumAll = list.reduce((sum, image) => sum + image.dataUrlBytes, 0);
  const budget = maxBytes * PAYLOAD_SAFETY - (totalBytes - sumAll); // bytes left for ALL image data URLs
  for (let count = 1; count <= list.length; count += 1) {
    const candidates = list.slice(0, count);
    const fixed = list.slice(count).reduce((sum, image) => sum + image.dataUrlBytes, 0);
    const room = budget - fixed;
    if (room <= 0) continue;
    const candidateTotal = candidates.reduce((sum, image) => sum + image.dataUrlBytes, 0);
    const targets = candidates
      .map((image) => ({ image, dataUrlTarget: Math.min(image.dataUrlBytes, Math.floor((room * image.dataUrlBytes) / candidateTotal)) }))
      .filter(({ image, dataUrlTarget }) => dataUrlTarget < image.dataUrlBytes);
    if (!targets.length || targets.some(({ dataUrlTarget }) => dataUrlTarget < MIN_IMAGE_TARGET_BYTES)) continue;
    return {
      needed: true,
      feasible: true,
      targets: targets.map(({ image, dataUrlTarget }) => ({
        id: image.id,
        mimeType: image.mimeType,
        decodedBytes: image.decodedBytes,
        targetBlobBytes: Math.floor((dataUrlTarget * 3) / 4),
      })),
    };
  }
  return { needed: true, feasible: false, targets: [] };
}

/** { exceeds, totalBytes, maxBytes, images, plan } for the cloud-save confirmation modal. */
export function inspectCloudPayload({ document, totalBytes, maxBytes }) {
  const images = listEmbeddedImages(document);
  const plan = planImageShrink({ totalBytes, maxBytes, images });
  return { exceeds: plan.needed, totalBytes, maxBytes, images, plan };
}
