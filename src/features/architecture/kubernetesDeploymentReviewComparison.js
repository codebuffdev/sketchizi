const SEVERITY_RANK = Object.freeze({ error: 0, warning: 1, info: 2 });

function identity(finding) {
  return String(finding?.id || finding?.diagnosticId || [
    finding?.code || "",
    finding?.resourceId || "",
    finding?.relationshipId || "",
  ].join("|"));
}

function fingerprint(finding) {
  return JSON.stringify([
    finding?.code || "", finding?.severity || "", finding?.message || "",
    finding?.remediation || "", finding?.resourceId || "",
    finding?.relationshipId || "", finding?.relationshipType || "",
    finding?.source?.id || finding?.sourceResourceId || "",
    finding?.source?.type || finding?.sourceResourceType || "",
    finding?.target?.id || finding?.targetResourceId || "",
    finding?.target?.type || finding?.targetResourceType || "",
  ]);
}

/**
 * Compares two Kubernetes review snapshots by stable finding identity.
 * Snapshot inputs may be raw validation arrays or exported report objects.
 */
export function compareKubernetesDeploymentReviews(baseline, current) {
  const baselineFindings = Array.isArray(baseline?.findings) ? baseline.findings : [];
  const currentFindings = Array.isArray(current?.findings) ? current.findings : [];
  const baselineMap = new Map(baselineFindings.map((finding) => [identity(finding), finding]));
  const currentMap = new Map(currentFindings.map((finding) => [identity(finding), finding]));
  const added = [];
  const unchanged = [];
  const resolved = [];
  const changed = [];

  for (const [id, finding] of currentMap) {
    const previous = baselineMap.get(id);
    if (!previous) {
      added.push({ finding, previous: null, identity: id });
    } else if (fingerprint(previous) === fingerprint(finding)) {
      unchanged.push({ finding, previous, identity: id });
    } else {
      changed.push({ finding, previous, identity: id, changes: {
        severity: previous.severity !== finding.severity,
        message: previous.message !== finding.message,
        remediation: previous.remediation !== finding.remediation,
        relationship: previous.relationshipType !== finding.relationshipType ||
          previous.relationshipId !== finding.relationshipId ||
          JSON.stringify(previous.source || null) !== JSON.stringify(finding.source || null) ||
          JSON.stringify(previous.target || null) !== JSON.stringify(finding.target || null),
      } });
    }
  }

  for (const [id, finding] of baselineMap) {
    if (!currentMap.has(id)) resolved.push({ finding, previous: finding, identity: id });
  }

  const rank = (entry) => SEVERITY_RANK[entry.finding?.severity] ?? 3;
  for (const list of [added, changed, resolved, unchanged]) list.sort((a, b) => rank(a) - rank(b) || a.identity.localeCompare(b.identity));

  return {
    baselineGeneratedAt: baseline?.generatedAt || null,
    currentGeneratedAt: current?.generatedAt || null,
    counts: {
      added: added.length,
      changed: changed.length,
      resolved: resolved.length,
      unchanged: unchanged.length,
      current: currentMap.size,
      baseline: baselineMap.size,
      severityIncreased: changed.filter((entry) =>
        (SEVERITY_RANK[entry.finding?.severity] ?? 3) < (SEVERITY_RANK[entry.previous?.severity] ?? 3)).length,
      severityDecreased: changed.filter((entry) =>
        (SEVERITY_RANK[entry.finding?.severity] ?? 3) > (SEVERITY_RANK[entry.previous?.severity] ?? 3)).length,
    },
    added,
    changed,
    resolved,
    unchanged,
    scopeNote: "This comparison reflects two diagram-validation snapshots. It is not a live Kubernetes cluster comparison.",
  };
}
