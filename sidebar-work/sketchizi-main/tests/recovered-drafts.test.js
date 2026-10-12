import test from "node:test";
import assert from "node:assert/strict";

function createSessionStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("recovered drafts stay tab-scoped, retain stable numbering, and disappear when cleared", async () => {
  globalThis.window = { sessionStorage: createSessionStorage() };
  const recovery = await import("../src/features/collaboration/recoveredDrafts.js?recovery-test");

  assert.equal(recovery.allocateSessionLabel(""), "Untitled session 1");
  assert.equal(recovery.allocateSessionLabel("Named session"), "Named session");
  assert.equal(recovery.allocateSessionLabel(""), "Untitled session 2");

  recovery.createRecoveredSession({ id: "room-a", name: "Named session", endedAt: 100, draftText: "first" });
  const second = recovery.addRecoveredDraft("room-a", "second");
  const third = recovery.addRecoveredDraft("room-a", "third");
  recovery.createRecoveredSession({ id: "room-a", name: "Named session", endedAt: 101, draftText: "fourth" });
  assert.equal(second.number, 2);
  assert.equal(third.number, 3);

  recovery.updateRecoveredDraft("room-a", second.id, "edited second");
  recovery.updateRecoveredDraftHistory("room-a", second.id, ["second"], []);
  assert.deepEqual(recovery.getRecoveredDraftHistory("room-a", second.id), { undoStack: ["second"], redoStack: [] });

  recovery.clearRecoveredDraft("room-a", second.id);
  const sessions = recovery.getRecoveredSessions();
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].drafts.map((draft) => draft.number), [1, 3, 4]);

  for (const draft of sessions[0].drafts) recovery.clearRecoveredDraft("room-a", draft.id);
  assert.deepEqual(recovery.getRecoveredSessions(), []);
});
