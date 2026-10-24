const SUPPORTED_RESTART_POLICIES = new Set(["no", "always", "on-failure", "unless-stopped"]);
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value) {
  return isRecord(value) ? structuredClone(value) : {};
}

function diagnostic(code, severity, message, path, remediation) {
  return { code, severity, message, path, remediation };
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function yamlScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return quoteYaml(value);
}

function emitYaml(value, depth = 0) {
  const indent = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value.map((item) => {
      if (isRecord(item) || Array.isArray(item)) {
        const nested = emitYaml(item, depth + 1);
        return `${indent}-\n${nested}`;
      }
      return `${indent}- ${yamlScalar(item)}`;
    }).join("\n");
  }
  if (!isRecord(value)) return yamlScalar(value);
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  return entries.map(([key, item]) => {
    const safeKey = /^[a-zA-Z0-9_.-]+$/.test(key) ? key : quoteYaml(key);
    if (isRecord(item) || Array.isArray(item)) {
      if (!Object.keys(item).length && isRecord(item)) return `${indent}${safeKey}: {}`;
      if (Array.isArray(item) && item.length === 0) return `${indent}${safeKey}: []`;
      return `${indent}${safeKey}:\n${emitYaml(item, depth + 1)}`;
    }
    return `${indent}${safeKey}: ${yamlScalar(item)}`;
  }).join("\n");
}

export function createComposeDocument(input = {}) {
  const source = isRecord(input) ? input : {};
  return {
    name: typeof source.name === "string" ? source.name : "",
    services: cloneRecord(source.services),
    volumes: cloneRecord(source.volumes),
    networks: cloneRecord(source.networks),
  };
}

export function validateComposeDocument(input) {
  const document = createComposeDocument(input);
  const findings = [];
  const services = document.services;
  const serviceNames = Object.keys(services);

  if (serviceNames.length === 0) {
    findings.push(diagnostic("COMPOSE_NO_SERVICES", "error", "Compose must define at least one service.", "services", "Add a service with an image or build context."));
  }

  for (const [name, service] of Object.entries(services)) {
    const path = `services.${name}`;
    if (!NAME_PATTERN.test(name)) {
      findings.push(diagnostic("COMPOSE_INVALID_SERVICE_NAME", "error", `Service name "${name}" contains unsupported characters.`, path, "Use letters, numbers, underscores, periods, or hyphens."));
    }
    if (!isRecord(service)) {
      findings.push(diagnostic("COMPOSE_INVALID_SERVICE", "error", "Service definition must be an object.", path, "Replace this service definition with a mapping."));
      continue;
    }
    if (!(typeof service.image === "string" && service.image.trim()) && !(typeof service.build === "string" && service.build.trim()) && !isRecord(service.build)) {
      findings.push(diagnostic("COMPOSE_MISSING_IMAGE_OR_BUILD", "error", "Service must define image or build.", path, "Set image to a container image, or configure build."));
    }
    if (service.restart != null && !SUPPORTED_RESTART_POLICIES.has(service.restart) && !/^on-failure(?::\d+)?$/.test(service.restart)) {
      findings.push(diagnostic("COMPOSE_INVALID_RESTART_POLICY", "error", `Restart policy "${service.restart}" is not supported.`, `${path}.restart`, "Use no, always, on-failure, or unless-stopped."));
    }
    for (const dependency of Array.isArray(service.depends_on) ? service.depends_on : Object.keys(isRecord(service.depends_on) ? service.depends_on : {})) {
      if (!Object.hasOwn(services, dependency)) {
        findings.push(diagnostic("COMPOSE_UNKNOWN_DEPENDENCY", "error", `Service "${name}" depends on missing service "${dependency}".`, `${path}.depends_on`, "Add the referenced service or remove the dependency."));
      }
    }
    for (const network of Array.isArray(service.networks) ? service.networks : Object.keys(isRecord(service.networks) ? service.networks : {})) {
      if (!Object.hasOwn(document.networks, network) && network !== "default") {
        findings.push(diagnostic("COMPOSE_UNKNOWN_NETWORK", "error", `Service "${name}" references undefined network "${network}".`, `${path}.networks`, "Declare the network at the top level or remove the reference."));
      }
    }

    const declaredSecrets = Array.isArray(service.secrets)
      ? service.secrets.map((entry) => typeof entry === "string" ? entry : entry?.source).filter(Boolean)
      : Object.keys(isRecord(service.secrets) ? service.secrets : {});
    for (const secret of declaredSecrets) {
      if (!Object.hasOwn(document.secrets || {}, secret)) {
        findings.push(diagnostic("COMPOSE_UNKNOWN_SECRET", "error", `Service "${name}" references undefined secret "${secret}".`, `${path}.secrets`, "Declare the secret at the top level or remove the reference."));
      }
    }
    const declaredConfigs = Array.isArray(service.configs)
      ? service.configs.map((entry) => typeof entry === "string" ? entry : entry?.source).filter(Boolean)
      : Object.keys(isRecord(service.configs) ? service.configs : {});
    for (const config of declaredConfigs) {
      if (!Object.hasOwn(document.configs || {}, config)) {
        findings.push(diagnostic("COMPOSE_UNKNOWN_CONFIG", "error", `Service "${name}" references undefined config "${config}".`, `${path}.configs`, "Declare the config at the top level or remove the reference."));
      }
    }
    const ports = Array.isArray(service.ports) ? service.ports : [];
    for (const [index, port] of ports.entries()) {
      const hostPort = typeof port === "string"
        ? (port.includes(":") ? port.split(":").at(-2) : "")
        : port?.published == null ? "" : String(port.published);
      if (hostPort && !/^\d+$/.test(hostPort) && !/^\$\{[^}]+\}$/.test(hostPort)) {
        findings.push(diagnostic("COMPOSE_INVALID_HOST_PORT", "error", `Port mapping "${String(hostPort)}" is not a numeric host port or environment substitution.`, `${path}.ports[${index}]`, "Use a numeric host port or a Compose environment substitution such as ${HOST_PORT}."));
      } else if (/^\d+$/.test(hostPort) && (Number(hostPort) < 1 || Number(hostPort) > 65535)) {
        findings.push(diagnostic("COMPOSE_HOST_PORT_OUT_OF_RANGE", "error", `Host port ${hostPort} is outside the valid range 1–65535.`, `${path}.ports[${index}]`, "Choose a host port between 1 and 65535."));
      }
    }
    if (service.healthcheck != null && !isRecord(service.healthcheck)) {
      findings.push(diagnostic("COMPOSE_INVALID_HEALTHCHECK", "error", "Healthcheck must be a mapping.", `${path}.healthcheck`, "Define healthcheck options such as test, interval, timeout, retries, or start_period."));
    } else if (isRecord(service.healthcheck) && service.healthcheck.test != null &&
      !(Array.isArray(service.healthcheck.test) || typeof service.healthcheck.test === "string")) {
      findings.push(diagnostic("COMPOSE_INVALID_HEALTHCHECK_TEST", "error", "Healthcheck test must be a string or list.", `${path}.healthcheck.test`, "Use a command string or a list such as [CMD, curl, -f, http://localhost]."));
    }
    for (const volume of Array.isArray(service.volumes) ? service.volumes : []) {
      if (typeof volume !== "string") continue;
      const sourceName = volume.split(":")[0];
      if (sourceName && !sourceName.startsWith(".") && !sourceName.startsWith("/") && !sourceName.startsWith("${") && !Object.hasOwn(document.volumes, sourceName)) {
        findings.push(diagnostic("COMPOSE_UNKNOWN_VOLUME", "warning", `Service "${name}" references undeclared named volume "${sourceName}".`, `${path}.volumes`, "Declare the named volume at the top level if it is intended to be persistent."));
      }
    }
  }

  for (const [section, values] of [["volumes", document.volumes], ["networks", document.networks], ["secrets", cloneRecord(input.secrets)], ["configs", cloneRecord(input.configs)]]) {
    for (const [name, definition] of Object.entries(values)) {
      if (!NAME_PATTERN.test(name)) findings.push(diagnostic("COMPOSE_INVALID_RESOURCE_NAME", "error", `Invalid ${section.slice(0, -1)} name "${name}".`, `${section}.${name}`, "Use letters, numbers, underscores, periods, or hyphens."));
      if (!isRecord(definition)) findings.push(diagnostic("COMPOSE_INVALID_RESOURCE", "error", `Top-level ${section} definitions must be objects.`, `${section}.${name}`, "Use an empty object or a mapping of supported options."));
    }
  }
  return { document, findings, valid: !findings.some((item) => item.severity === "error") };
}

export function exportComposeYaml(input) {
  const document = createComposeDocument(input);
  const output = {};
  if (document.name) output.name = document.name;
  output.services = document.services;
  if (Object.keys(document.volumes).length) output.volumes = document.volumes;
  if (Object.keys(document.networks).length) output.networks = document.networks;
  if (Object.keys(source.secrets || {}).length) output.secrets = source.secrets;
  if (Object.keys(source.configs || {}).length) output.configs = source.configs;
  return `# Generated by Sketchizi Docker Compose Studio\n${emitYaml(output)}\n`;
}
