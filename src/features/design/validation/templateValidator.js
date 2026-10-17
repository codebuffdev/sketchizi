import { getDesignTemplate } from "../templates/templateRegistry.js";

function getElementLabel(element, elements) {
  if (typeof element?.text === "string" && element.text.trim()) return element.text.trim();
  const textElements = elements.filter((candidate) => candidate?.type === "text" && typeof candidate.text === "string" && candidate.text.trim());
  const childText = textElements.find((candidate) => candidate.containerId === element?.id);
  if (childText) return childText.text.trim();
  // Some diagrams imported from other tools use standalone text elements rather
  // than Excalidraw container bindings. Associate a label only when its center
  // falls inside the shape's bounds, avoiding loose nearest-neighbour guesses.
  const insideText = textElements.find((candidate) => {
    if (candidate.containerId) return false;
    const centerX = Number(candidate.x || 0) + Number(candidate.width || 0) / 2;
    const centerY = Number(candidate.y || 0) + Number(candidate.height || 0) / 2;
    return centerX >= Number(element.x || 0) && centerX <= Number(element.x || 0) + Number(element.width || 0)
      && centerY >= Number(element.y || 0) && centerY <= Number(element.y || 0) + Number(element.height || 0);
  });
  return insideText?.text?.trim() || "";
}

function inferRole(element, elements) {
  const explicit = element?.customData?.design?.role;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().toLowerCase();
  const label = getElementLabel(element, elements).toLowerCase();
  const matchers = [
    ["start", /^start$|\b(start|entry|begin)\b/],
    ["end", /^end$|\b(end|finish|exit|terminal)\b/],
    ["client", /\b(client|browser|mobile app|frontend)\b/],
    ["presentation", /\b(presentation|ui layer|view layer)\b/],
    ["application", /\b(application|application layer|use case)\b/],
    ["domain", /^domain$|\bdomain layer\b/],
    ["infrastructure", /\b(infrastructure|infrastructure layer)\b/],
    ["producer", /\b(producer|publisher)\b/],
    ["queue", /\b(queue|broker|event bus)\b/],
    ["consumer", /\b(consumer|subscriber)\b/],
    ["database", /\b(database|db|postgres|postgresql|mysql|sql)\b/],
    ["entity", /\b(entity|table|record)\b/],
    ["task", /^task$|\b(task|process|step)\b/],
    ["service", /\b(api|service|server|backend|worker|gateway)\b/],
  ];
  return matchers.find(([, regex]) => regex.test(label))?.[0] || null;
}

function getConnectorEndpoints(connector, elements) {
  const sourceId = connector?.startBinding?.elementId;
  const targetId = connector?.endBinding?.elementId;
  const resolveShape = (id) => {
    const endpoint = elements.find((element) => element?.id === id);
    if (!endpoint) return null;
    if (endpoint.containerId) return elements.find((element) => element.id === endpoint.containerId) || endpoint;
    return endpoint;
  };
  return { source: resolveShape(sourceId), target: resolveShape(targetId) };
}

export function validateDesignTemplate(elements = [], profile = null) {
  if (!profile?.templateId) return [];
  const template = getDesignTemplate(profile.templateId);
  if (!template) return [{ code: "template.unknown", severity: "warning", message: `Template '${profile.templateId}' is not available in this Sketchizi version.` }];
  const liveElements = elements.filter((element) => element && !element.isDeleted);
  const shapes = liveElements.filter((element) => ["rectangle", "ellipse", "diamond", "polygon", "image", "frame"].includes(element.type));
  const roles = shapes.map((element) => ({ element, role: inferRole(element, liveElements) })).filter((item) => item.role);
  const diagnostics = [];
  const severity = profile.ruleMode === "strict" ? "error" : "warning";

  const required = [...(template.requiredRoles || [])];
  const available = roles.map((item) => item.role);
  for (const role of required) {
    const index = available.indexOf(role);
    if (index >= 0) available.splice(index, 1);
    else diagnostics.push({ code: "template.required-role", severity, message: `Add a '${role}' component to satisfy the ${template.name} template.` });
  }

  for (const connector of liveElements.filter((element) => ["arrow", "line"].includes(element.type))) {
    const { source, target } = getConnectorEndpoints(connector, liveElements);
    if (!source || !target) {
      diagnostics.push({ code: "template.unbound-connector", severity: "warning", elementId: connector.id, message: "This connector is not bound to two recognized elements." });
      continue;
    }
    const sourceRole = inferRole(source, liveElements);
    const targetRole = inferRole(target, liveElements);
    if (sourceRole && targetRole && template.allowedRelationships?.length) {
      const allowed = template.allowedRelationships.some(([from, to]) => from === sourceRole && to === targetRole);
      if (!allowed) diagnostics.push({ code: "template.relationship", severity, elementId: connector.id, message: `The connection from '${sourceRole}' to '${targetRole}' is not listed in the ${template.name} template rules.` });
    }
  }
  return diagnostics;
}
