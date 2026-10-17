function severityForMode(ruleMode) {
  return ruleMode === "strict" ? "error" : "warning";
}

/**
 * Reports template-required roles and relationships separately from the
 * quality score. This is a descriptive report, not a score or auto-fix.
 */
export function buildDesignCompletenessReport(template, diagnostics = [], elements = [], profile = {}) {
  const safeDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];
  const safeElements = Array.isArray(elements) ? elements : [];
  const ruleMode = profile?.ruleMode || "guided";
  const requiredSeverity = severityForMode(ruleMode);

  const requiredRoleFindings = safeDiagnostics.filter((item) =>
    /required role|missing required|missing .*component|missing .*role/i.test(
      `${item?.code || ""} ${item?.message || ""}`
    )
  );
  const relationshipFindings = safeDiagnostics.filter((item) =>
    /relationship|connection|connector|connected|bound/i.test(
      `${item?.code || ""} ${item?.message || ""}`
    )
  );

  const requirements = Array.isArray(template?.rules?.requiredRoles)
    ? template.rules.requiredRoles
    : [];
  const roleCounts = new Map();
  for (const element of safeElements) {
    if (!element || element.isDeleted || !["rectangle", "ellipse", "diamond", "polygon", "image", "frame"].includes(element.type)) continue;
    const role = String(element?.customData?.designRole || element?.customData?.role || element?.text || "").trim().toLowerCase();
    if (!role) continue;
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }

  const normalizedRequirements = requirements.map((role) => {
    const normalizedRole = String(role).trim().toLowerCase();
    const presentCount = roleCounts.get(normalizedRole) || 0;
    const requiredCount = requirements.filter((candidate) => String(candidate).trim().toLowerCase() === normalizedRole).length;
    const complete = presentCount >= requiredCount;
    return {
      role: String(role),
      requiredCount,
      presentCount,
      complete,
      status: complete ? "complete" : "missing",
      severity: complete ? "complete" : requiredSeverity,
    };
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.role.toLowerCase() === item.role.toLowerCase()) === index);

  const missingRoles = normalizedRequirements.filter((item) => !item.complete);
  const actionableRequirements = missingRoles.map((item) => ({
    id: `missing-role:${item.role.toLowerCase()}`,
    type: "component",
    role: item.role,
    title: `Add ${item.role}`,
    action: "add-component",
    severity: item.severity,
  }));
  const totalRoles = normalizedRequirements.length;
  const completeRoles = totalRoles - missingRoles.length;

  const allowedRelationships = Array.isArray(template?.rules?.allowedRelationships)
    ? template.rules.allowedRelationships
    : [];
  const relationshipChecks = allowedRelationships.map((pair) => {
    const from = String(pair?.from || pair?.[0] || "").trim();
    const to = String(pair?.to || pair?.[1] || "").trim();
    const relatedDiagnostics = relationshipFindings.filter((item) => {
      const text = `${item?.code || ""} ${item?.message || ""}`.toLowerCase();
      return text.includes(from.toLowerCase()) && text.includes(to.toLowerCase());
    });
    const relevantRolesPresent = roleCounts.has(from.toLowerCase()) && roleCounts.has(to.toLowerCase());
    const hasFinding = relatedDiagnostics.some((item) => item.severity === "error" || item.severity === "warning");
    return {
      from,
      to,
      label: `${from} → ${to}`,
      status: !relevantRolesPresent ? "not-assessed" : hasFinding ? "needs-review" : "no-reported-issue",
      severity: hasFinding ? requiredSeverity : "info",
      explanation: !relevantRolesPresent
        ? "Cannot assess this relationship until both roles are present."
        : hasFinding
          ? "Validation reported a relationship or connection issue."
          : "No matching relationship issue was reported by validation.",
    };
  });

  const reviewedRelationships = relationshipChecks.filter((item) => item.status !== "not-assessed");
  const relationshipIssues = relationshipChecks.filter((item) => item.status === "needs-review");
  const complete = missingRoles.length === 0 && relationshipIssues.length === 0;

  return {
    templateId: template?.id || null,
    templateName: template?.name || "Freeform design",
    ruleMode,
    status: complete ? "complete" : "incomplete",
    summary: {
      requiredRoles: totalRoles,
      completeRoles,
      missingRoles: missingRoles.length,
      requiredRelationships: relationshipChecks.length,
      assessedRelationships: reviewedRelationships.length,
      relationshipsNeedingReview: relationshipIssues.length,
      totalElements: safeElements.filter((element) => element && !element.isDeleted).length,
      validationFindings: safeDiagnostics.length,
    },
    roles: normalizedRequirements,
    relationships: relationshipChecks,
    actionableRequirements,
    findings: {
      requiredRoles: requiredRoleFindings.length,
      relationships: relationshipFindings.length,
    },
    note: "Completeness is a template-oriented checklist, not a guarantee of architectural correctness. Relationships marked as having no reported issue reflect available validation diagnostics, not independent proof that every connector is correct.",
  };
}
