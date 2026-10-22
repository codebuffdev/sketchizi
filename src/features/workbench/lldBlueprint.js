/** Deterministic, reviewable LLD starter blueprint; suggestions never mutate the model. */
export function proposeLldBlueprint(service) {
  if (!service || !service.id || !["backend.rest-service", "backend.worker", "frontend.react-app"].includes(service.kind)) {
    return { valid: false, message: "Select a supported HLD service or application before proposing an LLD blueprint.", elements: [], relationships: [], decisions: [] };
  }
  const name = String(service.name || "Service").trim() || "Service";
  const safe = name.replace(/\b(service|application|api)\b/ig, "").trim() || "Core";
  const elements = [
    { kind: "backend.rest-controller", name: `${safe}Controller`, responsibility: "Expose transport endpoints and validate request shape." },
    { kind: "backend.java-class", name: `${safe}ApplicationService`, responsibility: "Coordinate the use case and enforce application workflow." },
    { kind: "backend.repository", name: `${safe}Repository`, responsibility: "Abstract persistence operations required by the use case." },
    { kind: "design.domain-entity", name: `${safe}Entity`, responsibility: "Represent the core business concept and its invariants." },
  ];
  const relationships = [
    { source: `${safe}Controller`, kind: "uses", target: `${safe}ApplicationService`, reason: "The controller delegates business workflow to the application layer." },
    { source: `${safe}ApplicationService`, kind: "uses", target: `${safe}Repository`, reason: "The application layer requests persistence through an abstraction." },
    { source: `${safe}Repository`, kind: "uses", target: `${safe}Entity`, reason: "Persistence maps the domain concept to stored data." },
  ];
  return {
    valid: true,
    parentId: service.id,
    parentName: name,
    elements,
    relationships,
    decisions: [
      "Confirm the use cases and endpoint operations before defining API contracts.",
      "Choose domain fields, identifiers, invariants, and validation rules.",
      "Choose persistence technology and map domain entities to tables only when the data model is understood.",
      "Define error handling, authorization, transaction boundaries, observability, and retry behavior where applicable.",
    ],
    notice: "Starter blueprint only. These names and responsibilities are proposals, not inferred business requirements or production-ready design.",
  };
}
