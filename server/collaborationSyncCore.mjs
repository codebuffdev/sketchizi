import {
  recordSyncDiagnostic,
  syncDiagnosticNow,
  syncDiagnosticRef,
  syncDiagnosticsEnabled,
} from "./syncDiagnostics.mjs";

export const MAX_ELEMENTS = 10000;
export const MAX_FILES = 500;
// Keep a per-file allowance near the 8 MiB message budget while leaving room
// for the JSON envelope and scene metadata. The previous 6 MiB limit rejected
// files that the client correctly allowed inside a single collaboration message.
export const MAX_FILE_DATA_URL = 7 * 1024 * 1024 + 64 * 1024;

export function validElement(element) {
  return element &&
    typeof element === "object" &&
    typeof element.id === "string" &&
    element.id.length <= 128 &&
    Number.isInteger(element.version) &&
    Number.isInteger(element.versionNonce);
}

export function collaborationFileValidationIssue(id, file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) return "file-record-invalid";
  if (typeof file.id !== "string" || file.id.length === 0 || file.id.length > 128) return "file-id-invalid";
  if (typeof file.mimeType !== "string" || !file.mimeType.trim()) return "file-mime-type-invalid";
  if (typeof file.dataURL !== "string" || !file.dataURL) return "file-data-url-invalid";
  if (file.dataURL.length > MAX_FILE_DATA_URL) return "file-data-url-too-large";
  if (file.id !== id) return "file-id-key-mismatch";
  return null;
}

export function validFile(file) {
  return collaborationFileValidationIssue(file?.id, file) === null;
}

function collaborationFileValidationError(id, file, fileIndex) {
  const reason = collaborationFileValidationIssue(id, file);
  if (!reason) return null;
  const messages = {
    "file-record-invalid": "the file record is missing or malformed",
    "file-id-invalid": "the file ID is missing or invalid",
    "file-mime-type-invalid": "the file MIME type is missing or invalid",
    "file-data-url-invalid": "the file data is missing or invalid",
    "file-data-url-too-large": "the image data exceeds the supported collaboration file-size limit; reduce the image size and try again",
    "file-id-key-mismatch": "the file ID does not match its record key; remove and re-add the affected image, then try again",
  };
  const error = new Error(`Invalid collaboration file: ${messages[reason] || "the file record is malformed"}.`);
  error.code = reason === "file-data-url-too-large" ? "COLLAB_FILE_DATA_TOO_LARGE" : "COLLAB_FILE_INVALID";
  error.reason = reason;
  error.fileRef = syncDiagnosticRef(id);
  error.fileIndex = fileIndex;
  error.fileKeyPresent = typeof id === "string" && id.length > 0;
  error.fileIdPresent = typeof file?.id === "string" && file.id.trim().length > 0;
  error.fileIdType = file?.id === null ? "null" : Array.isArray(file?.id) ? "array" : typeof file?.id;
  error.fileIdLength = typeof file?.id === "string" ? file.id.length : -1;
  error.fileKeyMatchesId = error.fileIdPresent && id === file.id;
  return error;
}

export function chooseElement(current, incoming) {
  if (!current) return incoming;
  if (incoming.version > current.version) return incoming;
  if (incoming.version < current.version) return current;
  if (incoming.versionNonce === current.versionNonce) return current;
  // Concurrent edits can legitimately produce the same element version.
  // Use versionNonce as a deterministic tie-breaker so every client converges.
  return incoming.versionNonce > current.versionNonce ? incoming : current;
}

/**
 * The server's in-memory scene merge, isolated for deterministic testing. The
 * conflict-resolution rule is stable; incoming batches are fully validated
 * before any room state is mutated.
 */
export function mergeSnapshot(room, elements, files, authorId = null) {
  const diagnosticsEnabled = syncDiagnosticsEnabled();
  const startedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
  const incomingElementCount = diagnosticsEnabled && Array.isArray(elements) ? elements.length : 0;
  const incomingFileCount = diagnosticsEnabled && files && typeof files === "object"
    ? (Array.isArray(files) ? files.length : Object.keys(files).length)
    : 0;
  const outcomes = diagnosticsEnabled ? {
    created: 0,
    incomingNewerVersion: 0,
    currentNewerVersion: 0,
    equalVersionEqualNonce: 0,
    equalVersionIncomingNonceWins: 0,
    equalVersionCurrentNonceWins: 0,
    invalidElements: 0,
    elementsExamined: 0,
    elementsAccepted: 0,
    elementsSkipped: 0,
    deletedAccepted: 0,
    filesExamined: 0,
    filesAccepted: 0,
  } : null;

  try {
    if (!Array.isArray(elements) || elements.length > MAX_ELEMENTS) {
      throw new Error("Invalid collaboration scene.");
    }

    // Validate the complete incoming batch before mutating room state. In
    // particular, a bad file must not leave accepted elements partially
    // applied when the batch is rejected.
    for (const element of elements) {
      if (outcomes) outcomes.elementsExamined += 1;
      if (!validElement(element)) {
        if (outcomes) outcomes.invalidElements += 1;
        throw new Error("Invalid collaboration element.");
      }
    }

    let fileEntries = [];
    if (files && typeof files === "object") {
      fileEntries = Array.isArray(files) ? files.map((file) => [file?.id, file]) : Object.entries(files);
      if (fileEntries.length > MAX_FILES) throw new Error("Too many collaboration files.");
      for (let index = 0; index < fileEntries.length; index += 1) {
        const [id, file] = fileEntries[index];
        if (outcomes) outcomes.filesExamined += 1;
        const validationError = collaborationFileValidationError(id, file, index);
        if (validationError) throw validationError;
      }
    }

    const acceptedElements = [];
    for (const element of elements) {
      const current = room.elements.get(element.id);
      if (outcomes) {
        if (!current) outcomes.created += 1;
        else if (element.version > current.version) outcomes.incomingNewerVersion += 1;
        else if (element.version < current.version) outcomes.currentNewerVersion += 1;
        else if (element.versionNonce === current.versionNonce) outcomes.equalVersionEqualNonce += 1;
        else if (element.versionNonce > current.versionNonce) outcomes.equalVersionIncomingNonceWins += 1;
        else outcomes.equalVersionCurrentNonceWins += 1;
      }
      const chosen = chooseElement(current, element);
      if (chosen === current) {
        if (outcomes) outcomes.elementsSkipped += 1;
        continue;
      }
      room.elements.set(element.id, chosen);
      if (authorId) {
        const currentAuthorship = room.authorship.get(element.id);
        if (!currentAuthorship && !element.isDeleted) {
          room.authorship.set(element.id, { createdBy: authorId, lastModifiedBy: authorId });
        } else if (currentAuthorship) {
          room.authorship.set(element.id, { ...currentAuthorship, lastModifiedBy: authorId });
        }
      }
      acceptedElements.push(chosen);
      if (outcomes) {
        outcomes.elementsAccepted += 1;
        if (chosen.isDeleted) outcomes.deletedAccepted += 1;
      }
    }

    const acceptedFiles = [];
    for (const [id, file] of fileEntries) {
      room.files.set(id, file);
      acceptedFiles.push(file);
      if (outcomes) outcomes.filesAccepted += 1;
    }

    const acceptedAuthorship = Object.fromEntries(acceptedElements.map((element) => [element.id, room.authorship.get(element.id)]).filter(([, value]) => value));
    if (diagnosticsEnabled) recordSyncDiagnostic("server.merge.completed", {
      roomRef: syncDiagnosticRef(room.id),
      authorRef: authorId ? syncDiagnosticRef(authorId) : "none",
      outcome: "accepted",
      incomingElementCount,
      incomingFileCount,
      ...outcomes,
      durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
      roomElementCountAfter: room.elements.size,
      roomFileCountAfter: room.files.size,
    });
    return { elements: acceptedElements, files: acceptedFiles, authorship: acceptedAuthorship };
  } catch (error) {
    if (diagnosticsEnabled) recordSyncDiagnostic("server.merge.completed", {
      roomRef: syncDiagnosticRef(room.id),
      authorRef: authorId ? syncDiagnosticRef(authorId) : "none",
      outcome: "rejected",
      rejectionReason: error?.reason || error?.code || error?.message || "merge-error",
      rejectionMessage: error?.message || "Merge failed",
      invalidFileRef: error?.fileRef || "none",
      invalidFileIndex: Number.isInteger(error?.fileIndex) ? error.fileIndex : -1,
      incomingElementCount,
      incomingFileCount,
      ...outcomes,
      durationMs: Math.max(0, syncDiagnosticNow() - startedAt),
      roomElementCountAfter: room.elements.size,
      roomFileCountAfter: room.files.size,
    });
    throw error;
  }
}
