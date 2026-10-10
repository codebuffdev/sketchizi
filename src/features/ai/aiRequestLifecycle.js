const CONFIRMED_FAILURE_CODES = new Set([
  "provider_unavailable",
  "provider_timeout",
  "generation_failed",
  "request_already_failed",
]);

const PRE_ACCEPTANCE_CODES = new Set([
  "ai_service_not_configured",
  "identity_gateway_not_configured",
  "identity_verification_unavailable",
  // The gateway assertion is consumed before the controller can reserve a chat request.
  "identity_store_unavailable",
  "identity_not_configured",
  "identity_assertion_failed",
  "authentication_required",
  "csrf_rejected",
  "origin_rejected",
  "unsupported_media_type",
  "request_too_large",
  "invalid_path",
  "method_not_allowed",
  "conversation_not_found",
]);

/** Classifies a POST failure by its contract/code, not HTTP status alone. */
export function classifyChatFailure(error, chatPostWasAttempted) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "");

  if (status === 401 || code === "authentication_required") return "authentication";
  if (code === "completed_result_not_retained") return "succeeded_without_answer";
  if (code === "reservation_expired") return "reservation_expired";
  if (CONFIRMED_FAILURE_CODES.has(code)) return "confirmed_failure";

  if (
    PRE_ACCEPTANCE_CODES.has(code) ||
    code.startsWith("invalid_") ||
    code.endsWith("_too_large") ||
    [400, 403, 413, 415, 429].includes(status)
  ) return "rejected_before_acceptance";

  // Failures before POST /chat cannot have a backend reservation.
  if (!chatPostWasAttempted) return "rejected_before_acceptance";

  // These mean the backend may have reserved or completed the request. Query or
  // recover using the SAME request ID; do not silently start another generation.
  if (
    code === "transport_interrupted" ||
    code === "request_still_processing" ||
    code === "reservation_lost" ||
    code === "storage_unavailable" ||
    code === "internal_error" ||
    code === "ai_service_unavailable" ||
    code === "request_not_found" ||
    [408, 404, 500, 502, 503, 504, 522, 524].includes(status)
  ) return "unknown";

  return "rejected_before_acceptance";
}

/** Adds a fresh user message or updates the existing bubble for a retry attempt. */
export function upsertUserMessage(messages, nextMessage, replaceMessageId = null) {
  if (replaceMessageId) {
    const index = messages.findIndex((message) => message.role === "user" &&
      (message.messageId === replaceMessageId || message.requestId === replaceMessageId));
    if (index >= 0) {
      return messages.map((message, position) => position === index
        ? { ...message, messageId: message.messageId || replaceMessageId, requestId: nextMessage.requestId, text: nextMessage.text }
        : message);
    }
  }
  if (messages.some((message) => message.role === "user" && message.requestId === nextMessage.requestId)) return messages;
  return [...messages, nextMessage];
}

/** A POST response and a later status poll can race; render an answer at most once. */
export function appendAssistantOnce(messages, answerMessage) {
  if (messages.some((message) => message.role === "assistant" && message.requestId === answerMessage.requestId)) return messages;
  return [...messages, answerMessage];
}

/** Interprets the durable request-state contract independently of HTTP delivery state. */
export function classifyRequestStatus(payload) {
  if (payload?.status === "succeeded") return payload.answer ? "succeeded_with_answer" : "succeeded_without_answer";
  if (payload?.status === "failed") return payload.code === "reservation_expired" ? "outcome_unknown" : "failed_confirmed";
  if (payload?.status === "pending" || payload?.status === "processing") return "pending";
  return "unknown";
}

export function classifyStatusLookupError(error) {
  if (Number(error?.status || 0) === 401) return "authentication";
  if (Number(error?.status || 0) === 404 && error?.code === "request_not_found") return "request_not_found";
  return "lookup_unavailable";
}
