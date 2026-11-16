import { validateDesignTemplate } from "./templateValidator.js";

/** Identify newly created or newly bound connectors that violate strict rules. */
export function enforceStrictTemplateRelationships(elements = [], previousElements = [], profile = null) {
  if (!profile?.templateId || profile.ruleMode !== "strict") {
    return { rejectedConnectorIds: [], diagnostics: [] };
  }
  const previousById = new Map(previousElements.filter((item) => item && !item.isDeleted).map((item) => [item.id, item]));
  const attemptedConnectorIds = new Set(elements.filter((item) => {
    if (!item || item.isDeleted || !["arrow", "line"].includes(item.type)) return false;
    const previous = previousById.get(item.id);
    if (!previous) return true;
    const hasBindings = Boolean(item.startBinding?.elementId && item.endBinding?.elementId);
    return hasBindings && (
      previous.startBinding?.elementId !== item.startBinding?.elementId
      || previous.endBinding?.elementId !== item.endBinding?.elementId
    );
  }).map((item) => item.id));
  if (!attemptedConnectorIds.size) return { rejectedConnectorIds: [], diagnostics: [] };
  const diagnostics = validateDesignTemplate(elements, profile).filter(
    (item) => item.code === "template.relationship" && item.severity === "error" && attemptedConnectorIds.has(item.elementId),
  );
  return { rejectedConnectorIds: [...new Set(diagnostics.map((item) => item.elementId))], diagnostics };
}
