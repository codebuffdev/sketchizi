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

function getDependencies(serviceDefinition) {
  const declared = serviceDefinition && serviceDefinition.depends_on;
  if (Array.isArray(declared)) return declared.filter((name) => typeof name === "string");
  if (declared && typeof declared === "object") return Object.keys(declared);
  return [];
}

export function extractDockerFailureEvidence(stderr = "", stdout = "", services = []) {
  const definitions = Array.isArray(services) ? null : (services && typeof services === "object" ? services : null);
  const names = definitions ? Object.keys(definitions) : (Array.isArray(services) ? services.map(String) : []);
  const lines = (String(stderr) + "\n" + String(stdout)).split(/\r?\n/).map(cleanLine).filter(Boolean);
  if (lines.length === 0) return null;
  const keywords = ["error", "failed", "failure", "denied", "unhealthy", "not found", "cannot", "unable", "conflict", "invalid", "timeout"];
  const relevant = lines.find((line) => keywords.some((word) => line.toLowerCase().includes(word))) || lines[0];
  const normalized = relevant.toLowerCase();
  const matches = names.filter((name) => hasServiceBoundary(normalized, name.toLowerCase()));
  const dependencyContext = ["depend", "dependency", "depends on", "depends_on"].some((word) => normalized.includes(word));
  if (dependencyContext && matches.length > 1 && definitions) {
    const edges = [];
    for (const dependent of matches) {
      for (const upstream of getDependencies(definitions[dependent])) {
        if (matches.includes(upstream)) edges.push({ dependent, upstream });
      }
    }
    if (edges.length === 1) {
      const { dependent, upstream } = edges[0];
      return { serviceName: upstream, dependentServiceName: dependent, line: relevant, confidence: "dependency-context", relation: "upstream-dependency" };
    }
    return { line: relevant, confidence: "ambiguous", candidateServices: matches.slice(0, 5), relation: "ambiguous" };
  }
  if (matches.length === 1) return { serviceName: matches[0], line: relevant, confidence: "service-match", relation: "direct" };
  if (matches.length > 1) return { line: relevant, confidence: "ambiguous", candidateServices: matches.slice(0, 5), relation: "ambiguous" };
  return { line: relevant, confidence: "output-only", relation: "unattributed" };
}

function getServiceDependencies(definition) {
  const declared = definition && definition.depends_on;
  if (Array.isArray(declared)) return declared.filter((name) => typeof name === "string");
  if (declared && typeof declared === "object") return Object.keys(declared);
  return [];
}

export function getServiceFailureRemediation(evidence, services = {}, stderr = "", stdout = "") {
  if (!evidence) return null;
  const output = (String(stderr) + "\n" + String(stdout) + "\n" + String(evidence.line || "")).toLowerCase();
  const definitions = services && typeof services === "object" && !Array.isArray(services) ? services : {};
  const serviceName = evidence.serviceName;
  const definition = serviceName ? definitions[serviceName] || {} : {};
  const dependencies = getServiceDependencies(definition);
  const serviceLabel = serviceName ? ' for service "' + serviceName + '"' : "";
  if (/pull access denied|authentication required|unauthorized|denied: requested access|manifest unknown/.test(output)) {
    return { title: "Check image access", detail: "Verify the image name/tag and registry permissions" + serviceLabel + ". If the image is private, authenticate with the correct registry before starting the project.", basis: "image-pull-error" };
  }
  if (/failed to read dockerfile|dockerfile.*not found|no such file or directory.*dockerfile/.test(output)) {
    const buildContext = definition.build && typeof definition.build === "object" ? definition.build.context : definition.build;
    const dockerfile = definition.build && typeof definition.build === "object" ? definition.build.dockerfile : "Dockerfile";
    return { title: "Check build paths", detail: "Confirm the build context" + (buildContext ? ' "' + String(buildContext) + '"' : "") + " and Dockerfile" + (dockerfile ? ' "' + String(dockerfile) + '"' : "") + " exist relative to the Compose file.", basis: "dockerfile-path-error" };
  }
  if (/port is already allocated|address already in use|bind:.*address/.test(output)) {
    const ports = Array.isArray(definition.ports) ? definition.ports : [];
    return { title: "Resolve port conflict", detail: "Check whether another process is using the published host port" + (ports.length ? " (" + ports.map((port) => typeof port === "string" ? port : JSON.stringify(port)).slice(0, 3).join(", ") + ")" : "") + ". Change the host-side port mapping or stop the conflicting process.", basis: "port-conflict" };
  }
  if (evidence.relation === "upstream-dependency" && evidence.serviceName) {
    return { title: "Inspect upstream dependency", detail: 'Check logs and health for "' + serviceName + '" first. "' + evidence.dependentServiceName + '" declares it as a dependency, so verify its readiness and health check before restarting the dependent service.', basis: "declared-dependency" };
  }
  if (/unhealthy|health check|healthcheck/.test(output) || definition.healthcheck) {
    return { title: "Check health and readiness", detail: "Inspect this service's logs and healthcheck command" + serviceLabel + ". Confirm the endpoint/command, startup grace period, and any required environment variables.", basis: "healthcheck-context" };
  }
  if (evidence.confidence === "ambiguous") {
    return { title: "Confirm the failing service", detail: "The output mentions multiple possible services and the dependency graph does not establish a unique cause. Inspect the listed services' logs individually before changing the Compose configuration.", basis: "ambiguous-evidence" };
  }
  if (definition.build) {
    return { title: "Inspect the service build", detail: "Review the build context, Dockerfile instructions, and build output" + serviceLabel + ". Correct the first reported build error before retrying.", basis: "build-config" };
  }
  if (definition.image) {
    return { title: "Inspect the service image", detail: 'Verify image "' + String(definition.image) + '" is valid, available, and compatible with the target platform' + serviceLabel + ". Review the complete command output for the first failure.", basis: "image-config" };
  }
  if (dependencies.length) {
    return { title: "Inspect declared dependencies", detail: "Check that " + dependencies.join(", ") + " are available and ready before this service starts. depends_on controls startup order but does not guarantee application-level readiness without health conditions.", basis: "dependency-config" };
  }
  return { title: "Inspect service output", detail: "Review the first Docker Compose error and this service's logs. The available evidence suggests a next check, but does not prove root cause or perform recovery.", basis: "general-evidence" };
}
