const finite = (value) => typeof value === "number" && Number.isFinite(value);

function measuredHopDuration(hop) {
  const queue = finite(hop?.queueWaitMs) ? Math.max(0, hop.queueWaitMs) : null;
  const service = finite(hop?.serviceTimeMs) ? Math.max(0, hop.serviceTimeMs) : null;
  if (queue === null && service === null) return null;
  return (queue ?? 0) + (service ?? 0);
}

/**
 * Select the most actionable hop using recorded lifecycle evidence only.
 * A failed/unavailable/dropped request focuses its recorded terminal problem;
 * otherwise, a successful request focuses the hop with the greatest measured
 * queue-wait + service-time contribution. This does not infer an unrecorded cause.
 */
export function deriveTraceInvestigation(trace) {
  if (!trace || !Array.isArray(trace.hops) || !trace.hops.length) return null;
  const hops = trace.hops;
  const terminalProblemIndex = trace.outcome !== "success"
    ? hops.map((hop, index) => ({ hop, index })).reverse().find(({ hop }) => ["failed", "unavailable", "dropped"].includes(hop?.outcome) && hop?.kind !== "traffic-source")?.index
    : null;
  let hopIndex = terminalProblemIndex ?? -1;
  if (hopIndex < 0) {
    let longest = -1;
    hops.forEach((hop, index) => {
      if (hop?.kind === "traffic-source" || !hop?.entityId) return;
      const duration = measuredHopDuration(hop);
      if (duration !== null && duration > longest) {
        longest = duration;
        hopIndex = index;
      }
    });
  }
  if (hopIndex < 0) hopIndex = hops.findIndex((hop) => hop?.entityId && hop?.kind !== "traffic-source");
  if (hopIndex < 0) hopIndex = hops.findIndex((hop) => hop?.entityId);
  if (hopIndex < 0) return null;

  const hop = hops[hopIndex];
  const measuredDurationMs = measuredHopDuration(hop);
  const arrival = finite(hop.arrivalMs) ? hop.arrivalMs : null;
  const outcomeTime = finite(hop.outcomeAtMs) ? hop.outcomeAtMs : finite(hop.serviceCompletedAtMs) ? hop.serviceCompletedAtMs : null;
  const failurePoint = trace.outcome !== "success" && ["failed", "unavailable", "dropped"].includes(hop.outcome);
  return {
    requestId: trace.requestId,
    requestOutcome: trace.outcome,
    hopIndex,
    entityId: hop.entityId,
    componentLabel: hop.label || hop.entityId,
    hopOutcome: hop.outcome || "unknown",
    reason: failurePoint ? "request-problem-point" : measuredDurationMs !== null ? "largest-measured-hop-duration" : "hop-without-timing-evidence",
    durationMs: measuredDurationMs,
    queueWaitMs: finite(hop.queueWaitMs) ? Math.max(0, hop.queueWaitMs) : null,
    serviceTimeMs: finite(hop.serviceTimeMs) ? Math.max(0, hop.serviceTimeMs) : null,
    operation: typeof hop.operation === "string" ? hop.operation : null,
    writeContentionMs: finite(hop.writeContentionMs) ? Math.max(0, hop.writeContentionMs) : null,
    startMs: arrival,
    endMs: outcomeTime,
    hasTimeWindow: arrival !== null && outcomeTime !== null && outcomeTime >= arrival,
  };
}

/** Return the data-derived chart buckets overlapped by a selected trace hop. */
export function findTraceWindowBucketRange(points, investigation) {
  if (!Array.isArray(points) || points.length === 0 || !investigation?.hasTimeWindow) return null;
  const start = investigation.startMs;
  const end = investigation.endMs;
  const matches = [];
  points.forEach((point, index) => {
    if (!finite(point?.startMs) || !finite(point?.endMs)) return;
    if (point.endMs >= start && point.startMs <= end) matches.push(index);
  });
  if (matches.length) return { startIndex: matches[0], endIndex: matches[matches.length - 1] };
  return null;
}
