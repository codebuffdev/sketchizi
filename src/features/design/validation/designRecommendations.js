import { getDesignTemplate, getTemplateRulesForProfile } from "../templates/templateRegistry.js";
import { inferDesignRole } from "./templateValidator.js";

function resolveBoundShape(elementId, elements) {
  const endpoint = elements.find((element) => element?.id === elementId);
  if (!endpoint) return null;
  if (endpoint.containerId) return elements.find((element) => element.id === endpoint.containerId) || endpoint;
  return endpoint;
}

export function recommendDesignNextSteps(elements = [], profile = null, diagnostics = []) {
  if (!profile?.templateId) return [];
  const template = getDesignTemplate(profile.templateId);
  if (!template) return [];

  const templateRules = getTemplateRulesForProfile(template, profile);
  const liveElements = elements.filter((element) => element && !element.isDeleted);
  const shapes = liveElements.filter((element) =>
    ["rectangle", "ellipse", "diamond", "polygon", "image", "frame"].includes(element.type)
  );
  const roleCounts = new Map();
  const roleElements = new Map();
  for (const shape of shapes) {
    const role = inferDesignRole(shape, liveElements);
    if (!role) continue;
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    if (!roleElements.has(role)) roleElements.set(role, []);
    roleElements.get(role).push(shape);
  }

  const recommendations = [];
  const missingDiagnostics = diagnostics.filter((item) => item.code === "template.required-role");
  const remainingMissing = new Map();
  for (const role of templateRules.requiredRoles) {
    const count = remainingMissing.has(role) ? remainingMissing.get(role) + 1 : 1;
    remainingMissing.set(role, count);
  }
  for (const [role, requiredCount] of remainingMissing) {
    const missingCount = Math.max(0, requiredCount - (roleCounts.get(role) || 0));
    for (let index = 0; index < missingCount; index += 1) {
      recommendations.push({
        id: `component:${role}:${index + 1}`,
        type: "component",
        role,
        title: `Add a ${role} component`,
        message: `The ${template.name} template expects ${roleCountLabel(requiredCount, role)}. Add ${missingCount > 1 ? `one of the ${missingCount} missing '${role}' components` : `a '${role}' component`} to complete the design.`,
        reason: "Required by the active template",
      });
    }
  }

  const existingPairs = new Set();
  const existingRolePairs = new Set();
  for (const connector of liveElements.filter((element) => ["arrow", "line"].includes(element.type))) {
    const source = resolveBoundShape(connector?.startBinding?.elementId, liveElements);
    const target = resolveBoundShape(connector?.endBinding?.elementId, liveElements);
    const from = source && inferDesignRole(source, liveElements);
    const to = target && inferDesignRole(target, liveElements);
    if (from && to) {
      existingRolePairs.add(`${from}->${to}`);
      existingPairs.add(`${source.id}->${target.id}`);
    }
  }

  for (const [from, to] of templateRules.allowedRelationships) {
    if (!(roleElements.get(from)?.length) || !(roleElements.get(to)?.length)) continue;
    const sourceElementIds = (roleElements.get(from) || []).map((element) => element.id);
    const targetElementIds = (roleElements.get(to) || []).map((element) => element.id);
    const hasUnconnectedPair = sourceElementIds.some((sourceId) =>
      targetElementIds.some((targetId) => !existingPairs.has(`${sourceId}->${targetId}`))
    );
    if (!hasUnconnectedPair) continue;
    recommendations.push({
      id: `connection:${from}->${to}`,
      type: "connection",
      from,
      to,
      sourceElementIds,
      targetElementIds,
      title: `Connect ${from} → ${to}`,
      message: `The template allows a connection from '${from}' to '${to}'. Consider adding it if these components interact in your design.`,
      reason: "Allowed by the active template",
    });
  }

  // Keep advice concise and deterministic; the UI can render this without applying edits.
  return recommendations;
}

function roleCountLabel(count, role) {
  return count > 1 ? `${count} '${role}' components` : `a '${role}' component`;
}
