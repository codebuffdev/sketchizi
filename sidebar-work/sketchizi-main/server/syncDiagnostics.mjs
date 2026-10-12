const DIAGNOSTICS_ENABLED = process.env.SKETCHIZI_SYNC_DIAGNOSTICS === "1";
let eventSequence = 0;

export function syncDiagnosticsEnabled() {
  return DIAGNOSTICS_ENABLED;
}

export function syncDiagnosticNow() {
  if (!DIAGNOSTICS_ENABLED) return 0;
  try {
    return Number(process.hrtime.bigint()) / 1e6;
  } catch {
    return Date.now();
  }
}

export function syncDiagnosticRef(value) {
  try {
    const input = String(value ?? "");
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
  } catch {
    return "unknown";
  }
}

function safeFields(fields) {
  const result = {};
  const blocked = /^(?:text|content|payload|dataURL|dataUrl|elements|files|snapshot|scene|message|raw|request|response|customData|errorDetails)$/i;
  for (const [key, value] of Object.entries(fields || {})) {
    if (blocked.test(key)) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = typeof value === "string" ? value.slice(0, 120) : value;
    } else if (Array.isArray(value) && value.length === 0) {
      result[key] = [];
    } else if ((key === "typeCounts" || key === "elementTypeCounts") && value && typeof value === "object") {
      result[key] = Object.fromEntries(Object.entries(value).filter(([, count]) => Number.isFinite(count)));
    }
  }
  return result;
}

export function recordSyncDiagnostic(event, fields = {}) {
  if (!DIAGNOSTICS_ENABLED) return;
  try {
    eventSequence += 1;
    const record = {
      diagnostic: "sketchizi-collaboration-sync",
      side: "server",
      eventId: eventSequence,
      timestamp: new Date().toISOString(),
      event: String(event).slice(0, 100),
      ...safeFields(fields),
    };
    console.info("[Sketchizi Sync Diagnostics]", JSON.stringify(record));
  } catch {
    // Diagnostic logging must never interfere with collaboration.
  }
}

export function syncUtf8ByteLength(value) {
  try {
    return Buffer.byteLength(String(value), "utf8");
  } catch {
    return String(value).length;
  }
}

export function summarizeSyncMessage(message) {
  const elements = Array.isArray(message?.elements) ? message.elements : [];
  const files = Array.isArray(message?.files)
    ? message.files
    : message?.files && typeof message.files === "object" ? Object.values(message.files) : [];
  const typeCounts = {};
  let deletedCount = 0;
  for (const element of elements) {
    const type = typeof element?.type === "string" ? element.type : "unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    if (element?.isDeleted) deletedCount += 1;
  }
  return {
    messageType: typeof message?.type === "string" ? message.type : "unknown",
    elementCount: elements.length,
    deletedCount,
    fileCount: files.length,
    elementTypeCounts: typeCounts,
  };
}
