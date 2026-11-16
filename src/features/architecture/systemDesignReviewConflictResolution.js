import { normalizeReviewCollaboration } from "./systemDesignReviewCollaboration.js";

const byId = (items) => new Map(items.map((item) => [String(item.id), item]));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Summarize differences without mutating either copy. */
export function compareReviewCollaborationCopies(localValue, remoteValue) {
  const local = normalizeReviewCollaboration(localValue, localValue?.reviewId);
  const remote = normalizeReviewCollaboration(remoteValue, local.reviewId);
  const localReviewers = byId(local.reviewers);
  const remoteReviewers = byId(remote.reviewers);
  let reviewerConflicts = 0;
  for (const [id, item] of localReviewers) {
    const other = remoteReviewers.get(id);
    if (other && !same(item, other)) reviewerConflicts += 1;
  }
  const localComments = byId(local.comments);
  const remoteComments = byId(remote.comments);
  return {
    reviewerConflicts,
    localOnlyReviewers: [...localReviewers.keys()].filter((id) => !remoteReviewers.has(id)).length,
    remoteOnlyReviewers: [...remoteReviewers.keys()].filter((id) => !localReviewers.has(id)).length,
    localOnlyComments: [...localComments.keys()].filter((id) => !remoteComments.has(id)).length,
    remoteOnlyComments: [...remoteComments.keys()].filter((id) => !localComments.has(id)).length,
    conflictingComments: [...localComments.keys()].filter((id) => remoteComments.has(id) && !same(localComments.get(id), remoteComments.get(id))).length,
    ownerConflict: Boolean(local.owner && remote.owner && local.owner !== remote.owner),
  };
}

/**
 * Conservative merge: local reviewer values win same-ID conflicts, remote-only
 * reviewers are added, and comments are unioned by ID (local wins duplicate IDs).
 * This is a proposal, not an automatic write to the remote store.
 */
export function mergeReviewCollaborationCopies(localValue, remoteValue) {
  const local = normalizeReviewCollaboration(localValue, localValue?.reviewId);
  const remote = normalizeReviewCollaboration(remoteValue, local.reviewId);
  if (local.reviewId && remote.reviewId && local.reviewId !== remote.reviewId) {
    throw new Error("Cannot merge collaboration records for different reviews.");
  }
  const reviewers = byId(remote.reviewers);
  for (const reviewer of local.reviewers) reviewers.set(reviewer.id, reviewer);
  const comments = byId(remote.comments);
  for (const comment of local.comments) comments.set(comment.id, comment);
  return normalizeReviewCollaboration({
    ...remote,
    ...local,
    owner: local.owner || remote.owner,
    reviewers: [...reviewers.values()],
    comments: [...comments.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-500),
    updatedAt: new Date().toISOString(),
  }, local.reviewId || remote.reviewId);
}
