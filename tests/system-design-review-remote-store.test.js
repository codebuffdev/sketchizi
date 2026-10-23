import test from "node:test";
import assert from "node:assert/strict";
import { createSystemDesignReviewRemoteStore, SYSTEM_DESIGN_REVIEW_REMOTE_TABLE } from "../src/features/architecture/systemDesignReviewRemoteStore.js";

function fakeClient({ data = null, error = null } = {}) {
  const calls = [];
  const result = { data, error };
  const chain = {};
  for (const method of ["select", "eq", "order", "upsert", "insert", "update"]) chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
  chain.maybeSingle = async () => result;
  chain.single = async () => result;
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return { client: { from: (table) => { calls.push(["from", table]); return chain; } }, calls };
}

test("requires an authenticated client interface and a workspace ID", async () => {
  assert.throws(() => createSystemDesignReviewRemoteStore(null), /authenticated Supabase client/);
  const { client } = fakeClient();
  const store = createSystemDesignReviewRemoteStore(client);
  await assert.rejects(store.list(""), /workspace ID/);
  await assert.rejects(store.load("workspace", ""), /Workspace ID and review ID/);
  await assert.rejects(store.save("", { reviewId: "r1" }), /workspace ID/);
});

test("saves normalized payloads using workspace-scoped upsert", async () => {
  const row = { workspace_id: "workspace-1", review_id: "review-1", payload: { reviewId: "review-1", owner: "Owner", reviewers: [], comments: [] }, created_at: "2026-01-01", updated_at: "2026-01-02", updated_by: "user-1" };
  const { client, calls } = fakeClient({ data: row });
  const saved = await createSystemDesignReviewRemoteStore(client).save("workspace-1", { reviewId: "review-1", owner: " Owner ", reviewers: [], comments: [] });
  assert.equal(saved.reviewId, "review-1");
  assert.equal(saved.payload.owner, "Owner");
  assert.ok(calls.some((call) => call[0] === "from" && call[1] === SYSTEM_DESIGN_REVIEW_REMOTE_TABLE));
  assert.ok(calls.some((call) => call[0] === "upsert" && call[2].onConflict === "workspace_id,review_id"));
});

test("loads and lists rows, and translates remote errors", async () => {
  const row = { workspace_id: "workspace-1", review_id: "review-1", payload: { reviewId: "review-1", reviewers: [], comments: [] } };
  const { client } = fakeClient({ data: [row] });
  const store = createSystemDesignReviewRemoteStore(client);
  const rows = await store.list("workspace-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workspaceId, "workspace-1");
  const { client: errorClient } = fakeClient({ error: { message: "permission denied" } });
  await assert.rejects(createSystemDesignReviewRemoteStore(errorClient).load("workspace-1", "review-1"), /permission denied/);
});

test("rejects missing IDs and oversized payloads before sending", async () => {
  const { client, calls } = fakeClient();
  const store = createSystemDesignReviewRemoteStore(client);
  await assert.rejects(store.save("workspace-1", {}), /review ID/);
  await assert.rejects(store.save("workspace-1", { reviewId: "r1", comments: [{ body: "x".repeat(1_100_000) }] }), /1 MB/);
  assert.equal(calls.length, 0);
});


test("optimistic updates require the previously observed timestamp and reject stale writes", async () => {
  const { client, calls } = fakeClient({ data: null });
  const store = createSystemDesignReviewRemoteStore(client);
  await assert.rejects(store.save("workspace-1", { reviewId: "review-1" }, { expectedUpdatedAt: "2026-01-01T00:00:00Z" }), /Another reviewer changed this review/);
  assert.ok(calls.some((call) => call[0] === "update"));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "updated_at" && call[2] === "2026-01-01T00:00:00Z"));
});

test("new shared review uses insert rather than overwriting an existing row", async () => {
  const { client, calls } = fakeClient({ error: { code: "23505", message: "duplicate key" } });
  const store = createSystemDesignReviewRemoteStore(client);
  await assert.rejects(store.save("workspace-1", { reviewId: "review-1" }, { expectedUpdatedAt: null }), /already exists remotely/);
  assert.ok(calls.some((call) => call[0] === "insert"));
  assert.ok(!calls.some((call) => call[0] === "upsert"));
});

test("realtime subscription filters to workspace and review and can unsubscribe", () => {
  const events = [];
  let handler;
  let statusHandler;
  const channel = {
    on: (type, filter, callback) => { events.push([type, filter]); handler = callback; return channel; },
    subscribe: (callback) => { statusHandler = callback; callback("SUBSCRIBED"); return channel; },
  };
  let removed = false;
  const client = { from() {}, channel: (name) => { events.push(["channel", name]); return channel; }, removeChannel: () => { removed = true; } };
  const changes = [];
  const statuses = [];
  const stop = createSystemDesignReviewRemoteStore(client).subscribe("workspace-1", "review-1", (event) => changes.push(event), (status) => statuses.push(status));
  statusHandler("SUBSCRIBED");
  handler({ eventType: "UPDATE", new: { review_id: "review-1", updated_at: "now" }, old: {} });
  handler({ eventType: "UPDATE", new: { review_id: "other-review" }, old: {} });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].reviewId, "review-1");
  assert.ok(statuses.includes("subscribed"));
  assert.ok(events.some(([type, filter]) => type === "postgres_changes" && filter.filter === "workspace_id=eq.workspace-1"));
  stop();
  assert.equal(removed, true);
});
