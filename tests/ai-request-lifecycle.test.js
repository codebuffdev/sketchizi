import test from "node:test";
import assert from "node:assert/strict";
import { appendAssistantOnce, classifyChatFailure, classifyRequestStatus, classifyStatusLookupError, upsertUserMessage } from "../src/features/ai/aiRequestLifecycle.js";

test("a provider failure returned after durable failure marking is terminal, even with a 502", () => {
  assert.equal(classifyChatFailure({ status: 502, code: "provider_unavailable" }, true), "confirmed_failure");
  assert.equal(classifyChatFailure({ status: 502, code: "provider_timeout" }, true), "confirmed_failure");
});

test("a 503 before POST /chat is not classified as an accepted pending request", () => {
  assert.equal(classifyChatFailure({ status: 503, code: "identity_gateway_not_configured" }, false), "rejected_before_acceptance");
  assert.equal(classifyChatFailure({ status: 503, code: "ai_service_not_configured" }, true), "rejected_before_acceptance");
});

test("generic 5xx responses remain outcome-unknown, while known pre-acceptance errors are rejected", () => {
  assert.equal(classifyChatFailure({ status: 503, code: "ai_request_failed" }, true), "unknown");
  assert.equal(classifyChatFailure({ status: 500, code: "identity_verification_unavailable" }, true), "rejected_before_acceptance");
  assert.equal(classifyChatFailure({ status: 504, code: "ai_request_failed" }, true), "unknown");
  assert.equal(classifyChatFailure({ status: 404, code: "request_not_found" }, true), "unknown");
  assert.equal(classifyChatFailure({ code: "transport_interrupted" }, true), "unknown");
});

test("a confirmed request failure can be retried without duplicating its user bubble", () => {
  const prior = [{ role: "user", messageId: "logical-1", requestId: "attempt-1", text: "Explain this", timestamp: "original-time" }];
  const retried = upsertUserMessage(prior, { role: "user", messageId: "logical-1", requestId: "attempt-2", text: "Explain this", timestamp: "new-time" }, "logical-1");
  assert.equal(retried.length, 1);
  assert.equal(retried[0].requestId, "attempt-2");
  assert.equal(retried[0].timestamp, "original-time");
});

test("a new intentional request with the same text gets a separate user bubble", () => {
  const prior = [{ role: "user", messageId: "logical-1", requestId: "attempt-1", text: "Explain this", timestamp: "original-time" }];
  const next = upsertUserMessage(prior, { role: "user", messageId: "logical-2", requestId: "attempt-2", text: "Explain this", timestamp: "new-time" });
  assert.equal(next.length, 2);
});

test("assistant answers with the same request ID are rendered once", () => {
  const prior = [{ role: "assistant", requestId: "attempt-1", text: "Answer", timestamp: "original-time" }];
  assert.equal(appendAssistantOnce(prior, { role: "assistant", requestId: "attempt-1", text: "Answer", timestamp: "second-time" }), prior);
});

test("request polling distinguishes pending, success with/without answer, confirmed failure, and expired uncertainty", () => {
  assert.equal(classifyRequestStatus({ status: "pending" }), "pending");
  assert.equal(classifyRequestStatus({ status: "processing" }), "pending");
  assert.equal(classifyRequestStatus({ status: "succeeded", answer: "answer" }), "succeeded_with_answer");
  assert.equal(classifyRequestStatus({ status: "succeeded", answer: null }), "succeeded_without_answer");
  assert.equal(classifyRequestStatus({ status: "failed", code: "provider_error" }), "failed_confirmed");
  assert.equal(classifyRequestStatus({ status: "failed", code: "reservation_expired" }), "outcome_unknown");
  assert.equal(classifyRequestStatus({ status: "weird" }), "unknown");
});

test("status 404 is only classified as missing request for the explicit backend code", () => {
  assert.equal(classifyStatusLookupError({ status: 404, code: "request_not_found" }), "request_not_found");
  assert.equal(classifyStatusLookupError({ status: 404, code: "not_found" }), "lookup_unavailable");
  assert.equal(classifyStatusLookupError({ status: 503, code: "storage_unavailable" }), "lookup_unavailable");
});
