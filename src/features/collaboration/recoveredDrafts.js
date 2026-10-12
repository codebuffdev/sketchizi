const STORAGE_KEY = "sketchizi.collaboration.recovery.v1";

function readState() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { nextUntitled: 1, sessions: [] };
    const parsed = JSON.parse(raw);
    return {
      nextUntitled: Number.isInteger(parsed?.nextUntitled) && parsed.nextUntitled > 0 ? parsed.nextUntitled : 1,
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions.filter((item) => item && typeof item.id === "string" && Array.isArray(item.drafts)) : [],
    };
  } catch {
    return { nextUntitled: 1, sessions: [] };
  }
}

function writeState(state) {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function getRecoveredSessions() {
  return readState().sessions.filter((session) => session.drafts.length > 0).sort((a, b) => b.endedAt - a.endedAt);
}

export function allocateSessionLabel(name) {
  const state = readState();
  const normalized = String(name || "").trim();
  if (normalized) return normalized;
  const label = `Untitled session ${state.nextUntitled++}`;
  writeState(state);
  return label;
}

export function createRecoveredSession({ id, name, endedAt = Date.now(), draftText = "" }) {
  const state = readState();
  const existing = state.sessions.find((session) => session.id === id);
  if (existing) {
    if (typeof draftText === "string" && draftText.trim()) {
      const number = Math.max(0, ...existing.drafts.map((draft) => Number(draft.number) || 0)) + 1;
      existing.drafts.push({ id: `${id}:draft:${number}`, number, text: draftText, updatedAt: Date.now() });
      existing.endedAt = Math.max(Number(existing.endedAt) || 0, endedAt);
      writeState(state);
    }
    return existing;
  }
  const label = String(name || "").trim() || `Untitled session ${state.nextUntitled++}`;
  const session = { id, name: label, endedAt, drafts: [] };
  if (typeof draftText === "string" && draftText.trim()) session.drafts.push({ id: `${id}:draft:1`, number: 1, text: draftText, updatedAt: Date.now() });
  state.sessions.push(session);
  writeState(state);
  return session;
}

export function addRecoveredDraft(sessionId, text = "") {
  const state = readState();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return null;
  const number = Math.max(0, ...session.drafts.map((draft) => Number(draft.number) || 0)) + 1;
  const draft = { id: `${sessionId}:draft:${number}`, number, text: String(text), updatedAt: Date.now() };
  session.drafts.push(draft);
  writeState(state);
  return draft;
}

export function updateRecoveredDraft(sessionId, draftId, text) {
  const state = readState();
  const session = state.sessions.find((item) => item.id === sessionId);
  const draft = session?.drafts.find((item) => item.id === draftId);
  if (!draft) return false;
  draft.text = String(text);
  draft.updatedAt = Date.now();
  return writeState(state);
}

export function clearRecoveredDraft(sessionId, draftId) {
  const state = readState();
  const sessionIndex = state.sessions.findIndex((item) => item.id === sessionId);
  if (sessionIndex < 0) return false;
  const session = state.sessions[sessionIndex];
  session.drafts = session.drafts.filter((item) => item.id !== draftId);
  if (!session.drafts.length) state.sessions.splice(sessionIndex, 1);
  return writeState(state);
}

export function clearRecoveredSessions() {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export function getRecoveredDraftHistory(sessionId, draftId) {
  const session = readState().sessions.find((item) => item.id === sessionId);
  const draft = session?.drafts.find((item) => item.id === draftId);
  return { undoStack: Array.isArray(draft?.undoStack) ? draft.undoStack : [], redoStack: Array.isArray(draft?.redoStack) ? draft.redoStack : [] };
}

export function updateRecoveredDraftHistory(sessionId, draftId, undoStack, redoStack) {
  const state = readState();
  const session = state.sessions.find((item) => item.id === sessionId);
  const draft = session?.drafts.find((item) => item.id === draftId);
  if (!draft) return false;
  draft.undoStack = Array.isArray(undoStack) ? undoStack.slice(-100) : [];
  draft.redoStack = Array.isArray(redoStack) ? redoStack.slice(-100) : [];
  return writeState(state);
}
