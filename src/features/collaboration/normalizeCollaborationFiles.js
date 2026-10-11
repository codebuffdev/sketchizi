/**
 * Excalidraw's binary-file registry is keyed by file ID. Some local records can
 * carry a missing or malformed `id` even though their registry key is valid.
 * Restore only invalid IDs from that trusted registry key before serializing.
 * A valid but different ID is preserved so a genuine key/ID mismatch remains
 * visible to server validation instead of being silently rewritten.
 */
export function normalizeCollaborationFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) return {};

  const normalized = {};
  for (const [key, file] of Object.entries(files)) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      normalized[key] = file;
      continue;
    }

    const hasValidKey = typeof key === "string" && key.trim().length > 0 && key.length <= 128;
    const hasValidId = typeof file.id === "string" && file.id.trim().length > 0 && file.id.length <= 128;
    normalized[key] = !hasValidId && hasValidKey ? { ...file, id: key } : file;
  }
  return normalized;
}
