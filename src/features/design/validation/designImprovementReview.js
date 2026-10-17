const PRIORITY = Object.freeze({
  error: 0,
  warning: 1,
  recommendation: 2,
  info: 3,
});

function classifyDiagnostic(item) {
  if (item.severity === "error") return { priority: "high", score: 100, kind: "finding" };
  if (item.severity === "warning") return { priority: "medium", score: 65, kind: "finding" };
  return { priority: "low", score: 35, kind: "finding" };
}

function explainDiagnostic(item) {
  if (item.code === "template.required-role") {
    return "Required components make the diagram complete and keep it aligned with the selected template.";
  }
  if (item.code === "template.relationship") {
    return "An unapproved relationship can make the diagram harder to interpret or inconsistent with the selected pattern.";
  }
  if (item.code === "template.unbound-connector") {
    return "A connector without two bound endpoints can become detached when components move.";
  }
  if (item.code === "template.unknown") {
    return "The selected template is unavailable, so its domain-specific rules cannot be checked.";
  }
  return "Review this item against the design's intent and the active template rules.";
}

function diagnosticAction(item) {
  if (item.code === "template.required-role") return "Add the missing component.";
  if (item.code === "template.relationship") return "Review the endpoints and choose an allowed relationship.";
  if (item.code === "template.unbound-connector") return "Bind the connector to both intended components.";
  if (item.code === "template.unknown") return "Choose an available template or restore the missing template.";
  return "Inspect the finding and decide whether a change is needed.";
}

export function buildDesignImprovementReview(diagnostics = [], recommendations = []) {
  const items = [];
  for (const diagnostic of diagnostics) {
    const classification = classifyDiagnostic(diagnostic);
    items.push({
      id: `finding:${diagnostic.code}:${diagnostic.elementId || diagnostic.message}`,
      source: "finding",
      sourceItem: diagnostic,
      title: diagnostic.message,
      detail: explainDiagnostic(diagnostic),
      nextAction: diagnosticAction(diagnostic),
      priority: classification.priority,
      score: classification.score,
      kind: classification.kind,
      elementId: diagnostic.elementId || null,
      severity: diagnostic.severity || "info",
    });
  }

  for (const recommendation of recommendations) {
    const missingComponent = recommendation.type === "component";
    items.push({
      id: `recommendation:${recommendation.id}`,
      source: "recommendation",
      sourceItem: recommendation,
      title: recommendation.title,
      detail: recommendation.message,
      nextAction: missingComponent ? "Add this component if it belongs in your design." : "Check whether this relationship exists conceptually, then connect the components if appropriate.",
      priority: "low",
      score: missingComponent ? 40 : 30,
      kind: "recommendation",
      elementId: null,
      severity: "recommendation",
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2, info: 3 };
  items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]
    || b.score - a.score
    || a.title.localeCompare(b.title));

  const counts = items.reduce((result, item) => {
    result[item.priority] += 1;
    return result;
  }, { high: 0, medium: 0, low: 0, info: 0 });
  return { items, counts, total: items.length };
}
