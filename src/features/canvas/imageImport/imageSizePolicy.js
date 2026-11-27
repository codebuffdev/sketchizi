// Role-aware upload limits for images placed on the canvas.
//
//   admin          -> 4 MB (fixed)
//   everyone else  -> user.limits.maxImageSizeBytes (plan configuration) or 2 MB
//
// Pure module: no DOM, so it is unit-tested directly under node --test.

export const ADMIN_MAX_IMAGE_SIZE = 4 * 1024 * 1024;
export const DEFAULT_STANDARD_MAX_IMAGE_SIZE = 2 * 1024 * 1024;

const MB = 1024 * 1024;
const KB = 1024;

export function isAdminUser(user) {
  return user?.role === "admin";
}

export function resolveMaxImageBytes(user) {
  if (isAdminUser(user)) return ADMIN_MAX_IMAGE_SIZE;
  const configured = Number(user?.limits?.maxImageSizeBytes);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_STANDARD_MAX_IMAGE_SIZE;
}

/** "6.4 MB", "4 MB", "812 KB", "0 B". Binary units, one decimal, trailing .0 dropped. */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const trim = (n) => String(Math.round(n * 10) / 10);
  if (value >= MB) return `${trim(value / MB)} MB`;
  if (value >= KB) return `${Math.round(value / KB)} KB`;
  return `${Math.round(value)} B`;
}

// ---- storage-aware policy -------------------------------------------------
// Size limits protect Cloud Workspace only. A local canvas imports any image at full quality;
// the limit is enforced at import time on cloud-backed canvases and once, up front, when a local
// canvas is saved to the cloud (see cloudPayloadPolicy.js).

export const STORAGE_MODE_LOCAL = "local";
export const STORAGE_MODE_CLOUD = "cloud";

export function resolveStorageMode({ cloudActive = false, detached = false } = {}) {
  return cloudActive && !detached ? STORAGE_MODE_CLOUD : STORAGE_MODE_LOCAL;
}

/** Import-time size checks apply to cloud canvases only; an unknown mode fails closed (enforced). */
export function enforcesImportLimit(storageMode) {
  return storageMode !== STORAGE_MODE_LOCAL;
}

/** Limit for a Cloud Workspace account from /limits: admin 4 MB, otherwise plan value or 2 MB. */
export function resolveCloudLimitBytes(limits) {
  return resolveMaxImageBytes({
    role: limits?.admin ? "admin" : "user",
    limits: { maxImageSizeBytes: limits?.maxImageSizeBytes },
  });
}
