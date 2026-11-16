/**
 * Static Compose dependency exploration. This describes declared startup
 * dependencies, NOT observed network traffic or runtime request traces.
 */
export function traceComposeDependencies(document, start) {
  const services = document?.services;
  if (!services || typeof services !== "object" || Array.isArray(services)) throw new TypeError("Compose services mapping required.");
  if (!Object.hasOwn(services, start)) throw new Error("Unknown starting service: " + start);
  const steps = [];
  const visited = new Set();
  const active = new Set();
  const warnings = [];
  function visit(name) {
    if (active.has(name)) { warnings.push("Dependency cycle detected at " + name); return; }
    if (visited.has(name)) return;
    visited.add(name);
    active.add(name);
    const service = services[name];
    const depends = Array.isArray(service?.depends_on) ? service.depends_on : Object.keys(service?.depends_on || {});
    for (const target of depends) {
      steps.push({ from: name, to: target, exists: Object.hasOwn(services, target) });
      if (Object.hasOwn(services, target)) visit(target);
      else warnings.push(name + " references missing service " + target);
    }
    active.delete(name);
  }
  visit(start);
  return { start, services: [...visited], steps, warnings };
}
