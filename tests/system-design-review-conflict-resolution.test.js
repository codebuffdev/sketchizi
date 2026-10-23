import test from "node:test";
import assert from "node:assert/strict";
import { compareReviewCollaborationCopies, mergeReviewCollaborationCopies } from "../src/features/architecture/systemDesignReviewConflictResolution.js";

const local = { reviewId: "r1", owner: "Local", reviewers: [{ id: "a", name: "Alex", status: "approved" }, { id: "b", name: "Bea", status: "pending" }], comments: [{ id: "c1", author: "Alex", body: "Local comment", createdAt: "2026-01-01" }] };
const remote = { reviewId: "r1", owner: "Remote", reviewers: [{ id: "a", name: "Alex", status: "changes_requested" }, { id: "c", name: "Cam", status: "pending" }], comments: [{ id: "c2", author: "Cam", body: "Remote comment", createdAt: "2026-01-02" }] };

test("summarizes local-only, remote-only, and conflicting records", () => {
  assert.deepEqual(compareReviewCollaborationCopies(local, remote), {
    reviewerConflicts: 1, localOnlyReviewers: 1, remoteOnlyReviewers: 1,
    localOnlyComments: 1, remoteOnlyComments: 1, conflictingComments: 0, ownerConflict: true,
  });
});

test("merge retains local values on conflicts and unions reviewers and comments", () => {
  const merged = mergeReviewCollaborationCopies(local, remote);
  assert.equal(merged.owner, "Local");
  assert.equal(merged.reviewers.find((item) => item.id === "a").status, "approved");
  assert.deepEqual(merged.reviewers.map((item) => item.id).sort(), ["a", "b", "c"]);
  assert.deepEqual(merged.comments.map((item) => item.id), ["c1", "c2"]);
});

test("refuses to merge different review IDs", () => {
  assert.throws(() => mergeReviewCollaborationCopies(local, { ...remote, reviewId: "r2" }), /different reviews/);
});

test("normalizes malformed inputs without mutating source copies", () => {
  const input = { reviewId: "r1", reviewers: "bad", comments: null };
  const merged = mergeReviewCollaborationCopies(input, { reviewId: "r1", reviewers: [], comments: [] });
  assert.equal(merged.reviewers.length, 0);
  assert.equal(input.reviewers, "bad");
});
