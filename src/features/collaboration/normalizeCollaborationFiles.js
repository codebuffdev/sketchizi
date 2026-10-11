/**
 * Excalidraw's binary-file registry is keyed by file ID. Some file records
 * (notably imported/older records) omit `id` even though the registry key is
 * valid. Collaboration messages send record values, so restore a missing ID
 * from that trusted key before serializing. An existing, non-empty ID is left
 * untouched so a genuinely mismatched record still fails server validation.
 */
export function normalizeCollaborationFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) return {};

  const normalized = {};
  for (const [key, file] of Object.entries(files)) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      normalized[key] = file;
      continue;
    }

    const idIsMissing = file.id === undefined || file.id === null || file.id === "";
    normalized[key] = idIsMissing ? { ...file, id: key } : file;
  }
  return normalized;
}
