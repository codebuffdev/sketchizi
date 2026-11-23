import { parseAllDocuments } from "yaml";
import { createComposeDocument, exportComposeYaml } from "./composeDocumentService.js";
import { planComposeDiagram } from "./composeDiagramLayout.js";
import { formatYamlError } from "../studio-validation/yamlErrors.js";

/**
 * Pure pipeline for Docker Compose Studio:
 *
 *   YAML text -> parseComposeYaml -> document
 *             -> buildComposeCanvasState -> canvas state (service/network/volume nodes + edges)
 *             -> composeCanvasStateToYaml -> YAML text
 *
 * Nodes carry the *complete* source definition of each service, network and
 * volume, and the state keeps every other top-level key (x-* extensions,
 * secrets, configs, include, ...), so nothing is lost on the way back.
 */

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const MAX_REPORTED_ERRORS = 10;

function fail(code, message, extra = {}) {
  return { document: null, error: message, errors: [{ code, message, line: null, column: null, ...extra }], warnings: [] };
}

/**
 * Parse Compose YAML. Never throws. Returns `{ document, error, errors, warnings }`
 * where `error` is a single actionable sentence (empty string when parsing succeeded).
 */
export function parseComposeYaml(yamlText) {
  if (typeof yamlText !== "string") {
    return fail("COMPOSE_INPUT_NOT_TEXT", "Compose YAML must be provided as text. Re-import the file or paste its contents into the editor.");
  }
  const text = yamlText.replace(/^\uFEFF/, "");
  if (!text.trim()) {
    return fail("COMPOSE_EMPTY", "The Compose file is empty. Add a top-level services mapping with at least one service.");
  }

  let documents;
  try {
    // merge: true expands `<<: *anchor` merge keys, which Compose files use heavily.
    documents = parseAllDocuments(text, { prettyErrors: true, uniqueKeys: true, merge: true });
  } catch (cause) {
    return fail("COMPOSE_YAML_UNREADABLE", `The YAML could not be read: ${cause?.message || "unknown error"}. Check that the file is plain-text YAML.`);
  }

  const syntax = [];
  documents.forEach((document, index) => {
    for (const error of document.errors) syntax.push(formatYamlError(error, documents.length > 1 ? `Document ${index + 1} YAML` : "YAML"));
  });
  if (syntax.length) {
    return { document: null, error: syntax[0].message, errors: syntax.slice(0, MAX_REPORTED_ERRORS), warnings: [] };
  }

  const populated = documents.filter((document) => document.contents != null);
  if (populated.length > 1) {
    return fail("COMPOSE_MULTIPLE_DOCUMENTS", `This file contains ${populated.length} YAML documents separated by "---". A Compose file must be a single document; split it into separate files.`);
  }

  let value;
  try {
    value = populated[0]?.toJSON();
  } catch (cause) {
    return fail("COMPOSE_DOCUMENT_UNREADABLE", `The Compose document could not be read: ${cause?.message || "unknown error"}. Check anchors (&name), aliases (*name) and merge keys (<<): an anchor can only be used inside the document that defines it, not across \"---\" separators.`);
  }
  if (value == null) {
    return fail("COMPOSE_EMPTY", "The Compose file has no content. Add a top-level services mapping with at least one service.");
  }
  if (!isRecord(value)) {
    return fail("COMPOSE_NOT_A_MAPPING", `A Compose file must be a mapping with a top-level "services" key, but this file contains ${Array.isArray(value) ? "a list" : "a single value"}.`);
  }
  if (typeof value.kind === "string" && typeof value.apiVersion === "string") {
    return fail("COMPOSE_LOOKS_LIKE_KUBERNETES", `This looks like a Kubernetes ${value.kind} manifest (it has apiVersion and kind), not a Compose file. Open it in Kubernetes Studio instead.`);
  }
  if (!("services" in value)) {
    return fail("COMPOSE_MISSING_SERVICES", 'Add a top-level "services" mapping. Each service needs an "image" or a "build" section.');
  }
  if (value.services === null) {
    return fail("COMPOSE_EMPTY_SERVICES", 'The "services" key is empty. Define at least one service beneath it, indented by two spaces.');
  }
  if (!isRecord(value.services)) {
    return fail("COMPOSE_SERVICES_NOT_A_MAPPING", `"services" must be a mapping of service names to definitions, but it is ${Array.isArray(value.services) ? "a list" : "a single value"}. Write "services:" followed by indented "name:" entries.`);
  }

  const warnings = [];
  if ("version" in value) {
    warnings.push({ code: "COMPOSE_VERSION_OBSOLETE", message: 'The top-level "version" key is obsolete in the Compose Specification and is ignored by Docker Compose v2. It is kept in the exported YAML.' });
  }
  for (const [name, service] of Object.entries(value.services)) {
    if (service === null) {
      warnings.push({ code: "COMPOSE_EMPTY_SERVICE", message: `Service "${name}" has no definition. Add an image or build section.` });
    }
  }
  return { document: value, error: "", errors: [], warnings };
}

/* ------------------------------------------------------------------ */
/* Canvas state                                                        */
/* ------------------------------------------------------------------ */

const TOP_LEVEL_MANAGED = new Set(["name", "services", "networks", "volumes"]);

/**
 * Build the canvas state for a Compose document: positioned service/network/volume
 * nodes holding full definitions, plus dependency and membership edges.
 */
export function buildComposeCanvasState(input) {
  const document = createComposeDocument(input);
  const plan = planComposeDiagram(document);
  const nodes = [];
  const declaredOrder = { network: Object.keys(document.networks), volume: Object.keys(document.volumes) };
  for (const [name, definition] of Object.entries(document.services)) {
    const position = plan.positions.get(name) || { x: 0, y: 0 };
    nodes.push({ id: `service:${name}`, type: "service", name, x: position.x, y: position.y, definition: structuredClone(definition) });
  }
  const declared = { network: document.networks, volume: document.volumes };
  const seen = new Set();
  for (const resource of plan.resources) {
    const type = resource.kind === "NETWORK" ? "network" : "volume";
    const position = plan.resourcePositions.get(`${resource.kind}:${resource.name}`) || { x: 0, y: 0 };
    seen.add(`${type}:${resource.name}`);
    nodes.push({
      id: `${type}:${resource.name}`, type, name: resource.name, x: position.x, y: position.y,
      members: [...resource.members], declaredIndex: declaredOrder[type].indexOf(resource.name),
      definition: Object.hasOwn(declared[type], resource.name) ? structuredClone(declared[type][resource.name]) : undefined,
    });
  }
  // Declared-but-unused networks and volumes still need to survive an export.
  for (const type of ["network", "volume"]) {
    for (const [name, definition] of Object.entries(declared[type])) {
      if (seen.has(`${type}:${name}`)) continue;
      nodes.push({ id: `${type}:${name}`, type, name, x: 0, y: 0, members: [], declaredIndex: declaredOrder[type].indexOf(name), definition: structuredClone(definition) });
    }
  }
  const extras = Object.fromEntries(Object.entries(document).filter(([key]) => !TOP_LEVEL_MANAGED.has(key)).map(([key, value]) => [key, structuredClone(value)]));
  const memberships = nodes.filter((node) => node.type !== "service").flatMap((node) => node.members.map((service) => ({ from: `service:${service}`, to: node.id, kind: node.type })));
  return {
    project: document.name || "",
    nodes,
    edges: plan.edges.map(({ from, to }) => ({ from: `service:${from}`, to: `service:${to}`, kind: "depends_on" })),
    memberships,
    topLevel: extras, topLevelOrder: Object.keys(document),
    layout: { width: plan.width, height: plan.height },
  };
}

/** Rebuild a Compose document from canvas state, restoring the original top-level key order. */
export function composeCanvasStateToDocument(state) {
  const services = {};
  const networks = {};
  const volumes = {};
  const nodes = Array.isArray(state?.nodes) ? state.nodes : [];
  for (const node of nodes) if (node.type === "service") services[node.name] = structuredClone(node.definition ?? {});
  for (const node of nodes.filter((item) => item.type !== "service" && item.definition !== undefined).sort((a, b) => (a.declaredIndex ?? 0) - (b.declaredIndex ?? 0))) {
    (node.type === "network" ? networks : volumes)[node.name] = structuredClone(node.definition);
  }
  const managed = { services, ...(state?.project ? { name: state.project } : {}), ...(Object.keys(volumes).length ? { volumes } : {}), ...(Object.keys(networks).length ? { networks } : {}) };
  const extras = structuredClone(state?.topLevel || {});
  const document = {};
  for (const key of Array.isArray(state?.topLevelOrder) ? state.topLevelOrder : []) {
    if (Object.hasOwn(managed, key)) document[key] = managed[key];
    else if (Object.hasOwn(extras, key)) document[key] = extras[key];
  }
  for (const [key, value] of Object.entries({ ...extras, ...managed })) if (!Object.hasOwn(document, key)) document[key] = value;
  return document;
}

export function composeCanvasStateToYaml(state) {
  return exportComposeYaml(composeCanvasStateToDocument(state));
}

/** Convenience: YAML -> canvas state -> YAML. Throws only if the input fails to parse. */
export function roundTripComposeYaml(yamlText) {
  const parsed = parseComposeYaml(yamlText);
  if (!parsed.document) throw new Error(parsed.error);
  const state = buildComposeCanvasState(parsed.document);
  return { parsed, state, yaml: composeCanvasStateToYaml(state) };
}
