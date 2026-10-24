function cleanLine(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").trim().slice(0, 240);
}

function hasServiceBoundary(line, serviceName) {
  let offset = line.indexOf(serviceName);
  while (offset !== -1) {
    const before = offset > 0 ? line[offset - 1] : "";
    const afterIndex = offset + serviceName.length;
    const after = afterIndex < line.length ? line[afterIndex] : "";
    const isNameChar = (char) => /[a-zA-Z0-9_.-]/.test(char);
    if ((!before || !isNameChar(before)) && (!after || !isNameChar(after))) return true;
    offset = line.indexOf(serviceName, offset + 1);
  }
  return false;
}

export function extractDockerFailureEvidence(stderr = "", stdout = "", serviceNames = []) {
  const names = Array.isArray(serviceNames) ? serviceNames.map(String) : Object.keys(serviceNames || {});
  const lines = (String(stderr) + "\n" + String(stdout)).split(/\r?\n/).map(cleanLine).filter(Boolean);
  if (lines.length === 0) return null;
  const keywords = ["error", "failed", "failure", "denied", "unhealthy", "not found", "cannot", "unable", "conflict", "invalid", "timeout"];
  const relevant = lines.find((line) => keywords.some((word) => line.toLowerCase().includes(word))) || lines[0];
  const normalized = relevant.toLowerCase();
  const matches = names.filter((name) => hasServiceBoundary(normalized, name.toLowerCase()));
  const dependencyContext = ["depend", "dependency", "depends on", "depends_on"].some((word) => normalized.includes(word));
  if (dependencyContext && matches.length > 1) {
    return { serviceName: matches[matches.length - 1], dependentServiceName: matches[0], line: relevant, confidence: "dependency-context", relation: "upstream-dependency" };
  }
  if (matches.length === 1) return { serviceName: matches[0], line: relevant, confidence: "service-match", relation: "direct" };
  if (matches.length > 1) return { line: relevant, confidence: "ambiguous", candidateServices: matches.slice(0, 5), relation: "ambiguous" };
  return { line: relevant, confidence: "output-only", relation: "unattributed" };
}
