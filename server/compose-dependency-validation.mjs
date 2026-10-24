const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,63}$/;

function dependenciesFor(serviceName, definition, diagnostics) {
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
    diagnostics.push({
      code: "COMPOSE_SERVICE_INVALID",
      serviceName,
      message: `Service "${serviceName}" must be a mapping.`,
    });
    return [];
  }
  if (!Object.hasOwn(definition, "depends_on")) return [];
  const dependsOn = definition.depends_on;
  if (Array.isArray(dependsOn)) {
    if (!dependsOn.every((name) => typeof name === "string" && name.trim())) {
      diagnostics.push({
        code: "COMPOSE_DEPENDS_ON_INVALID",
        serviceName,
        message: `Service "${serviceName}" has an invalid depends_on list; use service names as non-empty strings.`,
      });
      return [];
    }
    return [...new Set(dependsOn)];
  }
  if (dependsOn && typeof dependsOn === "object") {
    const names = Object.keys(dependsOn);
    for (const [name, condition] of Object.entries(dependsOn)) {
      if (condition !== null && (typeof condition !== "object" || Array.isArray(condition))) {
        diagnostics.push({
          code: "COMPOSE_DEPENDS_ON_INVALID",
          serviceName,
          dependencyName: name,
          message: `Dependency "${name}" on service "${serviceName}" must use a condition mapping.`,
        });
      }
    }
    return names;
  }
  diagnostics.push({
    code: "COMPOSE_DEPENDS_ON_INVALID",
    serviceName,
    message: `Service "${serviceName}" has an invalid depends_on value; use a list or mapping of service names.`,
  });
  return [];
}

export function validateComposeDependencies(services) {
  const diagnostics = [];
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    return {
      valid: false,
      diagnostics: [{ code: "COMPOSE_SERVICES_INVALID", message: "Compose services must be a mapping." }],
    };
  }

  const serviceNames = new Set(Object.keys(services));
  const graph = new Map();
  for (const [serviceName, definition] of Object.entries(services)) {
    const dependencies = dependenciesFor(serviceName, definition, diagnostics);
    graph.set(serviceName, dependencies);
    for (const dependencyName of dependencies) {
      if (!SERVICE_NAME_PATTERN.test(dependencyName)) {
        diagnostics.push({
          code: "COMPOSE_DEPENDENCY_NAME_INVALID",
          serviceName,
          dependencyName,
          message: `Service "${serviceName}" references invalid dependency name "${dependencyName}".`,
        });
      } else if (!serviceNames.has(dependencyName)) {
        diagnostics.push({
          code: "COMPOSE_DEPENDENCY_MISSING",
          serviceName,
          dependencyName,
          message: `Service "${serviceName}" depends on missing service "${dependencyName}". Add that service or correct the dependency name.`,
        });
      } else if (serviceName === dependencyName) {
        diagnostics.push({
          code: "COMPOSE_DEPENDENCY_CYCLE",
          serviceName,
          dependencyName,
          message: `Service "${serviceName}" depends on itself, creating a dependency cycle.`,
        });
      }
    }
  }

  const state = new Map();
  const stack = [];
  const reportedCycles = new Set();
  function visit(serviceName) {
    if (state.get(serviceName) === 2) return;
    if (state.get(serviceName) === 1) {
      const start = stack.indexOf(serviceName);
      const cycle = [...stack.slice(start), serviceName];
      const key = [...new Set(cycle)].sort().join("|");
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        diagnostics.push({
          code: "COMPOSE_DEPENDENCY_CYCLE",
          services: cycle,
          message: `Compose dependency cycle detected: ${cycle.join(" → ")}.`,
        });
      }
      return;
    }
    state.set(serviceName, 1);
    stack.push(serviceName);
    for (const dependencyName of graph.get(serviceName) || []) {
      if (serviceNames.has(dependencyName)) visit(dependencyName);
    }
    stack.pop();
    state.set(serviceName, 2);
  }
  for (const serviceName of serviceNames) visit(serviceName);

  return { valid: diagnostics.length === 0, diagnostics };
}
