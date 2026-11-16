const RECOVERY_GUIDANCE = {
  DOCKER_CLI_MISSING: {
    title: "Docker CLI unavailable",
    steps: ["Install or repair Docker Desktop.", "Ensure the docker CLI is available on PATH.", "Run Check runner again."],
    risk: "No Compose lifecycle action was confirmed.",
    action: "health",
    actionLabel: "Check runner",
  },
  DOCKER_DAEMON_UNAVAILABLE: {
    title: "Docker engine unavailable",
    steps: ["Open Docker Desktop and wait until the engine reports ready.", "Run Check runner to verify daemon access.", "Retry only after the connection check succeeds."],
    risk: "Do not repeat Start or Stop until the engine state is checked.",
    action: "health",
    actionLabel: "Check Docker connection",
  },
  PORT_CONFLICT: {
    title: "Published port is already in use",
    steps: ["Identify the process or container currently using the host port.", "Change the host-side port mapping for the affected service.", "Run Validate, then retry when the conflict is resolved."],
    risk: "Do not stop unrelated containers without identifying their owner.",
    action: "validate",
    actionLabel: "Validate Compose file",
  },
  IMAGE_ACCESS_DENIED: {
    title: "Image registry access denied",
    steps: ["Verify the image name and tag for this service.", "Confirm registry authentication and image pull permissions.", "Retry after access has been verified."],
    risk: "Never include registry passwords or access tokens in diagnostic reports.",
    action: "logs",
    actionLabel: "View service logs",
  },
  DOCKERFILE_MISSING: {
    title: "Dockerfile or build context not found",
    steps: ["Confirm the build context is the directory containing the Dockerfile.", "Check the Dockerfile name and relative path.", "Run Validate before starting services again."],
    risk: "No files will be deleted or changed automatically.",
    action: "validate",
    actionLabel: "Validate Compose file",
  },
  COMPOSE_CONFIG_INVALID: {
    title: "Compose configuration is invalid",
    steps: ["Read the first validation error in the command output.", "Correct the named service field or YAML structure.", "Re-run Validate before Start."],
    risk: "Start is not recommended until validation passes.",
    action: "validate",
    actionLabel: "Revalidate Compose file",
  },
  COMMAND_TIMEOUT: {
    title: "Command timed out; final state may be uncertain",
    steps: ["Run Status or Refresh status to observe current containers.", "Inspect targeted service logs if a container is unhealthy or stopped.", "Retry a lifecycle command only after confirming the actual state."],
    risk: "A timeout does not prove Start or Stop failed; repeating immediately can compound the problem.",
    action: "ps",
    actionLabel: "Check runtime status",
  },
  DOCKER_DISK_FULL: {
    title: "Docker storage is full",
    steps: ["Review Docker Desktop disk usage.", "Remove only resources confirmed safe to discard.", "Avoid broad prune or volume deletion commands until data impact is understood."],
    risk: "Pruning and volume removal can permanently delete data.",
    action: "ps",
    actionLabel: "Check runtime status",
  },
  COMPOSE_COMMAND_FAILED: {
    title: "Compose command failed",
    steps: ["Read the first actionable error in stderr.", "Inspect affected service logs when the service is known.", "Correct the reported configuration, build, or runtime issue before retrying."],
    risk: "No automatic restart or cleanup will be performed.",
    action: "logs",
    actionLabel: "Inspect recent logs",
  },
};

const SAFE_FOLLOW_UP_ACTIONS = new Set(["health", "validate", "ps", "logs"]);

/**
 * Return explainable, non-destructive recovery guidance for a known runner error.
 * This function only recommends checks or diagnostics; it never executes Docker commands.
 */
export function getComposeRecoveryGuidance(errorCode, action, serviceName) {
  const selected = RECOVERY_GUIDANCE[errorCode];
  if (!selected) return null;
  if (!SAFE_FOLLOW_UP_ACTIONS.has(selected.action)) return null;
  const target = serviceName ? ` for service “${serviceName}”` : "";
  return {
    ...selected,
    steps: [...selected.steps],
    scope: `Recommended next steps${target} · original action: ${action || "unknown"}`,
  };
}
