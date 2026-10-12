/**
 * Excalidraw's binary-file registry is keyed by file ID. Materialize every
 * record as a plain JSON-safe object before it is sent over collaboration.
 * Some records can expose `id` through a getter or non-enumerable property:
 * reading `file.id` succeeds, but JSON.stringify silently omits that property,
 * which makes the server reject the update as a missing file ID. Always write
 * the selected ID as an own, enumerable property, even when it already looks
 * valid.
 *
 * Invalid IDs are recovered from a valid registry key. A valid but different
 * ID remains unchanged so an actual key/ID mismatch is still diagnosed rather
 * than silently rewritten. Entries with no usable ID or registry key cannot
 * be addressed by the protocol and are omitted instead of poisoning the whole
 * collaboration snapshot.
 */
const isValidFileId = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 128;

function materializeFileRecord(file, id) {
  // Explicitly read protocol fields as well as spreading the record so fields
  // implemented as getters/non-enumerable properties survive JSON serialization.
  const normalized = {
    ...file,
    id,
    mimeType: file.mimeType,
    dataURL: file.dataURL,
  };
  if (file.created !== undefined) normalized.created = file.created;
  if (file.lastRetrieved !== undefined) normalized.lastRetrieved = file.lastRetrieved;
  if (file.version !== undefined) normalized.version = file.version;
  return normalized;
}

export function normalizeCollaborationFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) return {};

  // A null prototype also makes unusual registry IDs such as `__proto__`
  // ordinary keys rather than special object setters.
  const normalized = Object.create(null);
  for (const [key, file] of Object.entries(files)) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      normalized[key] = file;
      continue;
    }

    const validKey = isValidFileId(key);
    const validId = isValidFileId(file.id);
    const id = validId ? file.id : validKey ? key : null;

    if (id === null) continue;
    normalized[key] = materializeFileRecord(file, id);
  }
  return normalized;
}
