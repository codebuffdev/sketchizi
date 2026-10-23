const FLOW_DOMAINS = new Set(["process-flow", "database"]);

export function categoryForTemplate(template) {
  if (!template) return "system";
  if (template.domain === "cloud-infrastructure" || template.id?.startsWith("aws.")) return "aws";
  if (template.creationMode === "pattern") return "patterns";
  if (FLOW_DOMAINS.has(template.domain)) return "flows";
  return "system";
}

export function filterDesignTemplates(templates, { category = "all", query = "" } = {}) {
  const normalizedQuery = String(query).trim().toLowerCase();
  return (Array.isArray(templates) ? templates : []).filter((template) => {
    if (template.creationMode === "blank") return false;
    if (category !== "all" && categoryForTemplate(template) !== category) return false;
    if (!normalizedQuery) return true;
    const searchable = [template.name, template.description, template.category, template.domain]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export function previewLayoutForTemplate(template) {
  const id = template?.id || "";
  if (id === "aws.webapp.three-tier") return { kind: "cloud", nodes: ["Clients", "Load Balancer", "EC2", "RDS"] };
  if (id === "aws.serverless.api") return { kind: "cloud", nodes: ["API Gateway", "Lambda", "DynamoDB"] };
  if (id === "aws.event-driven.processing") return { kind: "event-cloud", nodes: ["EventBridge", "SQS", "Lambda", "DynamoDB"] };
  if (id === "aws.vpc.networking") return { kind: "network-cloud", nodes: ["Internet Gateway", "Load Balancer", "EC2", "RDS"], boundaries: ["VPC", "Public Subnet", "Private Subnet"] };
  if (id === "system-design.scalable-webapp") return { kind: "system", nodes: ["Clients", "CDN", "Load Balancer", "API", "Cache", "Database"] };
  if (id === "system-design.url-shortener") return { kind: "system", nodes: ["Client", "API", "Short Code", "Cache", "URL Store"] };
  if (id === "system-design.media-processing") return { kind: "event", nodes: ["Upload API", "Object Storage", "Queue", "Workers", "Metadata DB"] };
  if (id === "system-design.microservices") return { kind: "layered", nodes: ["API Gateway", "User Service", "Order Service", "Separate Databases"] };
  if (id.includes("event-driven")) return { kind: "event", nodes: ["Producer", "Broker", "Consumer"] };
  if (id.includes("layered")) return { kind: "layered", nodes: ["Presentation", "Application", "Domain", "Infrastructure"] };
  if (id.includes("database") || template?.domain === "database") return { kind: "data", nodes: ["Entity A", "Entity B"] };
  if (id.includes("process") || template?.domain === "process-flow") return { kind: "flow", nodes: ["Start", "Task", "End"] };
  if (id.startsWith("aws.")) return { kind: "cloud", nodes: ["Entry", "Compute", "Data"] };
  return { kind: "system", nodes: ["Client", "Service", "Database"] };
}
