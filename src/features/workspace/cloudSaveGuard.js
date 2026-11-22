// Guards that keep the cloud auto-save from conflicting with itself.

/**
 * Structural fingerprint of a scene: live element ids with version/versionNonce
 * plus file ids. Viewport (scroll/zoom), selection and other appState changes
 * never alter it, so they cannot trigger a cloud save.
 */
export function sceneFingerprint(elements, files = {}) {
  const parts = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    if (!element || element.isDeleted || typeof element.id !== "string") continue;
    parts.push(`${element.id}:${element.version ?? 0}:${element.versionNonce ?? 0}`);
  }
  parts.sort();
  const fileIds = Object.keys(files || {}).sort();
  const text = `${parts.join(",")}|${fileIds.join(",")}`;
  let h1 = 0x811c9dc5; let h2 = 0x1b873593;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${parts.length}:${fileIds.length}:${h1.toString(16)}${h2.toString(16)}`;
}

/** Latest revision this browser tab knows per diagram; survives stale session copies. */
export function createRevisionRegistry() {
  const map = new Map();
  return {
    get: (id) => map.get(id),
    /** Only ever moves forward. */
    note(id, revision) {
      const value = Number(revision);
      if (!id || !Number.isFinite(value)) return;
      if (!(map.get(id) >= value)) map.set(id, value);
    },
    effective(id, sessionRevision) {
      const known = map.get(id);
      const own = Number(sessionRevision);
      if (Number.isFinite(known) && Number.isFinite(own)) return Math.max(known, own);
      return Number.isFinite(known) ? known : sessionRevision;
    },
  };
}

export const isRevisionConflict = (error) =>
  error?.status === 409 || error?.status === 412 || error?.code === "revision_conflict";

/**
 * Decide what a 409 means.
 *  - "self-echo": the server copy already has exactly what we tried to save
 *    (our own duplicate/earlier request) -> adopt its revision, no banner.
 *  - "reload": nothing unsaved locally -> silently take the server copy.
 *  - "conflict": local unsaved edits AND different server content -> banner.
 */
export function classifyConflict({ remoteFingerprint, attemptedFingerprint, savedFingerprint, localFingerprint }) {
  if (remoteFingerprint === attemptedFingerprint || remoteFingerprint === localFingerprint) return "self-echo";
  if (localFingerprint === savedFingerprint) return "reload";
  return "conflict";
}
