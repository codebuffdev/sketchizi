import {
  recordSyncDiagnostic,
  syncDiagnosticNow,
  syncDiagnosticRef,
  syncDiagnosticsEnabled,
} from "./syncDiagnostics.mjs";

export const MAX_ELEMENTS = 10000;
export const MAX_FILES = 500;
export const MAX_FILE_DATA_URL = 6 * 1024 * 1024;

export function validElement(element) {
  return element &&
    typeof element === "object" &&
    typeof element.id === "string" &&
    element.id.length <= 128 &&
    Number.isInteger(element.version) &&
    Number.isInteger(element.versionNonce);
}

export function validFile(file) {
  return file &&
    typeof file === "object" &&
    typeof file.id === "string" &&
    file.id.length <= 128 &&
    typeof file.mimeType === "string" &&
    typeof file.dataURL === "string" &&
    file.dataURL.length <= MAX_FILE_DATA_URL;
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
 * The server's existing in-memory scene merge, isolated so it can be exercised
 * directly by the diagnostic characterization harness. Conflict choices and
 * mutation order are intentionally unchanged from the 1.10.36 baseline.
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

    const acceptedElements = [];
    for (const element of elements) {
      if (outcomes) outcomes.elementsExamined += 1;
      if (!validElement(element)) {
        if (outcomes) outcomes.invalidElements += 1;
        throw new Error("Invalid collaboration element.");
      }
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
    if (files && typeof files === "object") {
      const entries = Array.isArray(files) ? files.map((file) => [file?.id, file]) : Object.entries(files);
      if (entries.length > MAX_FILES) throw new Error("Too many collaboration files.");
      for (const [id, file] of entries) {
        if (outcomes) outcomes.filesExamined += 1;
        if (!validFile(file) || file.id !== id) throw new Error("Invalid collaboration file.");
        room.files.set(id, file);
        acceptedFiles.push(file);
        if (outcomes) outcomes.filesAccepted += 1;
      }
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
      rejectionReason: error?.message || "merge-error",
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
