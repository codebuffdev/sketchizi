function cleanLine(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").trim().slice(0, 240);
}

export function extractDockerFailureEvidence(stderr = "", stdout = "", serviceNames = []) {
  const lines = (String(stderr) + "\n" + String(stdout)).split(/\r?\n/).map(cleanLine).filter(Boolean);
  if (lines.length === 0) return null;
  const keywords = ["error", "failed", "failure", "denied", "unhealthy", "not found", "cannot", "unable", "conflict", "invalid", "timeout"];
  const relevant = lines.find((line) => keywords.some((word) => line.toLowerCase().includes(word))) || lines[0];
  const normalized = relevant.toLowerCase();
  const serviceName = serviceNames.find((name) => normalized.includes(String(name).toLowerCase()));
  return { ...(serviceName ? { serviceName } : {}), line: relevant, confidence: serviceName ? "service-match" : "output-only" };
}
