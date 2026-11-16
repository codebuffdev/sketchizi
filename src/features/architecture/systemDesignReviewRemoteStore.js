/**
 * Remote persistence adapter for shared architecture reviews.
 *
 * The caller must supply an authenticated Supabase client configured by the
 * host application. This module deliberately does not create a client or embed
 * credentials. Authorization is enforced by PostgreSQL RLS, not this adapter.
 */
const TABLE = "architecture_review_collaborations";
const MAX_PAYLOAD_BYTES = 1_000_000;
const text = (value, limit = 180) => String(value ?? "").trim().slice(0, limit);

function serializePayload(value) {
  const payload = value && typeof value === "object" ? value : {};
  const reviewId = text(payload.reviewId);
  if (!reviewId) throw new Error("A review ID is required for remote collaboration.");
  const normalized = {
    schemaVersion: 1,
    reviewId,
    owner: text(payload.owner, 120),
    reviewers: Array.isArray(payload.reviewers) ? payload.reviewers.slice(0, 100) : [],
    comments: Array.isArray(payload.comments) ? payload.comments.slice(-500) : [],
    updatedAt: text(payload.updatedAt, 40) || new Date().toISOString(),
  };
  const serialized = JSON.stringify(normalized);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error("Review collaboration data exceeds the 1 MB remote payload limit.");
  }
  return normalized;
}

function assertClient(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("An authenticated Supabase client is required for shared review collaboration.");
  }
}

function normalizeRow(row) {
  if (!row || typeof row !== "object" || !row.payload) return null;
  return {
    workspaceId: row.workspace_id,
    reviewId: row.review_id,
    payload: serializePayload({ ...row.payload, reviewId: row.review_id }),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

export function createSystemDesignReviewRemoteStore(client) {
  assertClient(client);
  return {
    async list(workspaceId) {
      const workspace = text(workspaceId);
      if (!workspace) throw new Error("A workspace ID is required.");
      const { data, error } = await client.from(TABLE)
        .select("workspace_id, review_id, payload, created_at, updated_at, updated_by")
        .eq("workspace_id", workspace)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message || "Could not load shared architecture reviews.");
      return (Array.isArray(data) ? data : []).map(normalizeRow).filter(Boolean);
    },
    async load(workspaceId, reviewId) {
      const workspace = text(workspaceId);
      const review = text(reviewId);
      if (!workspace || !review) throw new Error("Workspace ID and review ID are required.");
      const { data, error } = await client.from(TABLE)
        .select("workspace_id, review_id, payload, created_at, updated_at, updated_by")
        .eq("workspace_id", workspace)
        .eq("review_id", review)
        .maybeSingle();
      if (error) throw new Error(error.message || "Could not load the shared architecture review.");
      return normalizeRow(data);
    },
    async save(workspaceId, value, options = {}) {
      const workspace = text(workspaceId);
      if (!workspace) throw new Error("A workspace ID is required.");
      const payload = serializePayload(value);
      const columns = "workspace_id, review_id, payload, created_at, updated_at, updated_by";
      // Supplying expectedUpdatedAt opts into optimistic concurrency. Null means
      // the caller believes this is a new row; a timestamp means update only if
      // the remote row has not changed since it was read.
      if (Object.prototype.hasOwnProperty.call(options, "expectedUpdatedAt")) {
        const rowInput = { workspace_id: workspace, review_id: payload.reviewId, payload };
        if (options.expectedUpdatedAt == null) {
          const { data, error } = await client.from(TABLE).insert(rowInput).select(columns).single();
          if (error) {
            if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
              const conflict = new Error("This review already exists remotely. Load the latest copy before saving.");
              conflict.code = "REVIEW_CONFLICT";
              throw conflict;
            }
            throw new Error(error.message || "Could not create the shared architecture review.");
          }
          return normalizeRow(data);
        }
        const { data, error } = await client.from(TABLE).update({ payload }).eq("workspace_id", workspace)
          .eq("review_id", payload.reviewId).eq("updated_at", options.expectedUpdatedAt)
          .select(columns).maybeSingle();
        if (error) throw new Error(error.message || "Could not update the shared architecture review.");
        if (!data) {
          const conflict = new Error("Another reviewer changed this review. Load the latest copy and reconcile changes before saving.");
          conflict.code = "REVIEW_CONFLICT";
          throw conflict;
        }
        return normalizeRow(data);
      }
      const { data, error } = await client.from(TABLE)
        .upsert({ ...{ workspace_id: workspace, review_id: payload.reviewId, payload } }, { onConflict: "workspace_id,review_id" })
        .select(columns).single();
      if (error) throw new Error(error.message || "Could not save the shared architecture review.");
      return normalizeRow(data);
    },
    subscribe(workspaceId, reviewId, onChange, onStatus = () => {}) {
      const workspace = text(workspaceId);
      const review = text(reviewId);
      if (!workspace) throw new Error("A workspace ID is required for realtime updates.");
      if (typeof onChange !== "function") throw new Error("A realtime change callback is required.");
      if (typeof client.channel !== "function") {
        onStatus("unavailable");
        return () => {};
      }
      const filter = `workspace_id=eq.${workspace}`;
      const channel = client.channel(`architecture-review:${workspace}:${review || "all"}`)
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter }, (event) => {
          if (review && event?.new?.review_id !== review && event?.old?.review_id !== review) return;
          onChange({ eventType: event?.eventType || "UNKNOWN", reviewId: event?.new?.review_id || event?.old?.review_id || null, updatedAt: event?.new?.updated_at || null });
        })
        .subscribe((status) => onStatus(String(status || "unknown").toLowerCase()));
      return () => { try { const result = client.removeChannel?.(channel); if (result?.catch) result.catch(() => {}); } catch {} };
    },
  };
}

export const SYSTEM_DESIGN_REVIEW_REMOTE_TABLE = TABLE;
