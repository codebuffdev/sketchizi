const DB_NAME = "sketchizi-local-state";
const DB_VERSION = 2;
const STORE_NAME = "documents";
const DOCUMENT_ID = "main";
const RECENT_STORE_NAME = "recent-documents";
const EMERGENCY_KEY = "sketchizi-emergency-backup";

export class PersistenceError extends Error {
  constructor(message, kind = "unknown", cause = null) {
    super(message);
    this.name = "PersistenceError";
    this.kind = kind;
    this.cause = cause;
  }
}

function classifyStorageError(error, fallback = "unknown") {
  const name = error?.name || "";
  const message = String(error?.message || "").toLowerCase();

  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || message.includes("quota") || message.includes("storage is full")) {
    return "quota";
  }
  if (name === "InvalidStateError" || message.includes("transaction is inactive") || message.includes("database connection is closing")) {
    return "unavailable";
  }
  return fallback;
}

function toPersistenceError(error, fallbackMessage, fallbackKind = "unknown") {
  if (error instanceof PersistenceError) return error;
  const kind = classifyStorageError(error, fallbackKind);
  const message = kind === "quota"
    ? "Browser storage is full. The sketch could not be saved locally."
    : fallbackMessage;
  return new PersistenceError(message, kind, error);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new PersistenceError("IndexedDB is not available in this browser.", "unavailable"));
      return;
    }

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(toPersistenceError(error, "Unable to open local storage.", "unavailable"));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(RECENT_STORE_NAME)) {
        db.createObjectStore(RECENT_STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(toPersistenceError(request.error, "Unable to open local storage.", "unavailable"));
    request.onblocked = () => reject(new PersistenceError("Local storage is blocked by another database connection.", "unavailable"));
  });
}

export async function loadSketch() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch {}
        fn(value);
      };

      let transaction;
      try {
        transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(DOCUMENT_ID);
        request.onsuccess = () => finish(resolve, request.result || null);
        request.onerror = () => finish(reject, toPersistenceError(request.error, "Unable to restore the saved sketch.", "read"));
        transaction.onerror = () => finish(reject, toPersistenceError(transaction.error, "Unable to restore the saved sketch.", "read"));
        transaction.onabort = () => finish(reject, toPersistenceError(transaction.error, "Unable to restore the saved sketch.", "read"));
      } catch (error) {
        finish(reject, toPersistenceError(error, "Unable to restore the saved sketch.", "read"));
      }
    });
  } catch (error) {
    throw toPersistenceError(error, "Unable to restore the saved sketch.", "unavailable");
  }
}

export async function saveSketch({ elements, appState, files }) {
  let db;
  try {
    db = await openDatabase();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch {}
        fn(value);
      };

      const record = {
        id: DOCUMENT_ID,
        savedAt: Date.now(),
        elements,
        files: files || {},
        appState: {
          viewBackgroundColor: appState?.viewBackgroundColor,
          scrollX: appState?.scrollX || 0,
          scrollY: appState?.scrollY || 0,
          zoom: appState?.zoom?.value || 1,
          gridModeEnabled: !!appState?.gridModeEnabled,
          gridSize: appState?.gridSize,
          gridStep: appState?.gridStep,
        },
      };

      let transaction;
      try {
        transaction = db.transaction(STORE_NAME, "readwrite");
        const request = transaction.objectStore(STORE_NAME).put(record, DOCUMENT_ID);
        request.onerror = () => finish(reject, toPersistenceError(request.error, "Unable to save the sketch locally.", "write"));
        transaction.onerror = () => finish(reject, toPersistenceError(transaction.error, "Unable to save the sketch locally.", "write"));
        transaction.onabort = () => finish(reject, toPersistenceError(transaction.error, "Unable to save the sketch locally.", "write"));
        transaction.oncomplete = () => finish(resolve, true);
      } catch (error) {
        finish(reject, toPersistenceError(error, "Unable to save the sketch locally.", "write"));
      }
    });
  } catch (error) {
    throw toPersistenceError(error, "Unable to save the sketch locally.", "write");
  }
}

// Small emergency fallback. It is only used after IndexedDB fails, and may
// itself be unavailable or too small. The caller still receives the original
// IndexedDB failure so the UI can warn the user when neither storage works.
export function saveEmergencyBackup(payload) {
  try {
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify({ ...payload, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadEmergencyBackup() {
  try {
    const raw = localStorage.getItem(EMERGENCY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearEmergencyBackup() {
  try { localStorage.removeItem(EMERGENCY_KEY); } catch {}
}

export async function saveRecentSketch({ id, name, elements, appState, files }) {
  if (!id) throw new PersistenceError("A recent file id is required.", "write");
  let db;
  try {
    db = await openDatabase();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch {}
        fn(value);
      };
      try {
        const transaction = db.transaction(RECENT_STORE_NAME, "readwrite");
        const record = {
          id,
          name: String(name || "Untitled drawing").trim() || "Untitled drawing",
          savedAt: Date.now(),
          elements: elements || [],
          files: files || {},
          appState: {
            viewBackgroundColor: appState?.viewBackgroundColor,
            scrollX: appState?.scrollX || 0,
            scrollY: appState?.scrollY || 0,
            zoom: appState?.zoom?.value || 1,
            gridModeEnabled: !!appState?.gridModeEnabled,
            gridSize: appState?.gridSize,
            gridStep: appState?.gridStep,
          },
        };
        const request = transaction.objectStore(RECENT_STORE_NAME).put(record, id);
        request.onerror = () => finish(reject, toPersistenceError(request.error, "Unable to save this recent file.", "write"));
        transaction.onerror = () => finish(reject, toPersistenceError(transaction.error, "Unable to save this recent file.", "write"));
        transaction.onabort = () => finish(reject, toPersistenceError(transaction.error, "Unable to save this recent file.", "write"));
        transaction.oncomplete = () => finish(resolve, record);
      } catch (error) {
        finish(reject, toPersistenceError(error, "Unable to save this recent file.", "write"));
      }
    });
  } catch (error) {
    throw toPersistenceError(error, "Unable to save this recent file.", "write");
  }
}

export async function loadRecentSketch(id) {
  let db;
  try {
    db = await openDatabase();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch {}
        fn(value);
      };
      try {
        const transaction = db.transaction(RECENT_STORE_NAME, "readonly");
        const request = transaction.objectStore(RECENT_STORE_NAME).get(id);
        request.onsuccess = () => finish(resolve, request.result || null);
        request.onerror = () => finish(reject, toPersistenceError(request.error, "Unable to open the recent file.", "read"));
        transaction.onerror = () => finish(reject, toPersistenceError(transaction.error, "Unable to open the recent file.", "read"));
        transaction.onabort = () => finish(reject, toPersistenceError(transaction.error, "Unable to open the recent file.", "read"));
      } catch (error) {
        finish(reject, toPersistenceError(error, "Unable to open the recent file.", "read"));
      }
    });
  } catch (error) {
    throw toPersistenceError(error, "Unable to open the recent file.", "read");
  }
}

export async function deleteRecentSketch(id) {
  if (!id) return false;
  let db;
  try {
    db = await openDatabase();
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; try { db.close(); } catch {} resolve(value); };
      try {
        const transaction = db.transaction(RECENT_STORE_NAME, "readwrite");
        transaction.objectStore(RECENT_STORE_NAME).delete(id);
        transaction.oncomplete = () => finish(true);
        transaction.onerror = () => finish(false);
        transaction.onabort = () => finish(false);
      } catch { finish(false); }
    });
  } catch { return false; }
}

export async function clearSketch() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch {}
        fn(value);
      };

      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const request = transaction.objectStore(STORE_NAME).delete(DOCUMENT_ID);
        request.onerror = () => finish(reject, toPersistenceError(request.error, "Unable to clear the saved sketch.", "write"));
        transaction.onerror = () => finish(reject, toPersistenceError(transaction.error, "Unable to clear the saved sketch.", "write"));
        transaction.onabort = () => finish(reject, toPersistenceError(transaction.error, "Unable to clear the saved sketch.", "write"));
        transaction.oncomplete = () => finish(resolve, true);
      } catch (error) {
        finish(reject, toPersistenceError(error, "Unable to clear the saved sketch.", "write"));
      }
    });
  } catch {
    return false;
  }
}
