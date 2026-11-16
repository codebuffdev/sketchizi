function id(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function elementBase(elementId, type, x, y, width, height, customData = {}) {
  return {
    id: elementId,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed: Math.floor(Math.random() * 2147483647),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    customData: { design: customData },
  };
}

function makeNode({ role, label, type = "rectangle", x, y, width = 180, height = 86 }) {
  const shapeId = id(role);
  const textId = id("label");
  const shape = elementBase(shapeId, type, x, y, width, height, { role });
  shape.boundElements = [{ id: textId, type: "text" }];
  const text = {
    ...elementBase(textId, "text", x + 8, y + 27, width - 16, 32, { labelFor: role }),
    text: label,
    originalText: label,
    fontSize: 20,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    baseline: 18,
    containerId: shapeId,
    lineHeight: 1.25,
    autoResize: false,
    originalBaseline: 18,
  };
  return { shape, text };
}

function makeBoundary({ role, label, x, y, width, height }) {
  const node = makeNode({ role, label, x, y, width, height });
  node.shape.strokeColor = "#6b8fb5";
  node.shape.strokeStyle = "dashed";
  node.shape.strokeWidth = 1;
  node.shape.backgroundColor = "transparent";
  node.text.x = x + 12;
  node.text.y = y + 8;
  node.text.width = width - 24;
  node.text.height = 24;
  node.text.fontSize = 18;
  node.text.textAlign = "left";
  node.text.verticalAlign = "top";
  node.text.baseline = 18;
  return node;
}

function makeArrow(source, target, sourceRole, targetRole) {
  const arrowId = id("connector");
  const startX = source.x + source.width;
  const endX = target.x;
  const startY = source.y + source.height / 2;
  const endY = target.y + target.height / 2;
  const width = endX - startX;
  const height = endY - startY;
  const arrow = {
    ...elementBase(arrowId, "arrow", startX, startY, width, height, { sourceRole, targetRole, relationshipType: "connects-to" }),
    points: [[0, 0], [width, height]],
    lastCommittedPoint: null,
    startBinding: { elementId: source.id, focus: 0, gap: 1 },
    endBinding: { elementId: target.id, focus: 0, gap: 1 },
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
  };
  source.boundElements = [...(source.boundElements || []), { id: arrowId, type: "arrow" }];
  target.boundElements = [...(target.boundElements || []), { id: arrowId, type: "arrow" }];
  return arrow;
}

export function createStarterElements(kind, options = {}) {
  let nodes;
  let backgroundNodes = [];
  let connectionNodes = null;
  if (kind === "aws-three-tier-webapp") {
    nodes = [
      makeNode({ role: "client", label: "Web / Mobile Clients", type: "rectangle", x: 90, y: 270, width: 190, height: 92 }),
      makeNode({ role: "load-balancer", label: "Application Load Balancer", type: "rectangle", x: 370, y: 270, width: 220, height: 92 }),
      makeNode({ role: "compute", label: "EC2 Auto Scaling Tier", type: "rectangle", x: 680, y: 270, width: 220, height: 92 }),
      makeNode({ role: "database", label: "Amazon RDS", type: "rectangle", x: 990, y: 270, width: 190, height: 92 }),
    ];
  } else if (kind === "aws-serverless-api") {
    nodes = [
      makeNode({ role: "api-gateway", label: "Amazon API Gateway", type: "rectangle", x: 150, y: 270, width: 220, height: 92 }),
      makeNode({ role: "lambda", label: "AWS Lambda", type: "rectangle", x: 500, y: 270, width: 210, height: 92 }),
      makeNode({ role: "dynamodb", label: "Amazon DynamoDB", type: "rectangle", x: 850, y: 270, width: 220, height: 92 }),
    ];
  } else if (kind === "aws-event-driven-processing") {
    nodes = [
      makeNode({ role: "eventbridge", label: "Amazon EventBridge", type: "rectangle", x: 70, y: 270, width: 210, height: 92 }),
      makeNode({ role: "sqs", label: "Amazon SQS Queue", type: "rectangle", x: 365, y: 270, width: 210, height: 92 }),
      makeNode({ role: "lambda", label: "AWS Lambda Worker", type: "rectangle", x: 660, y: 270, width: 210, height: 92 }),
      makeNode({ role: "dynamodb", label: "Amazon DynamoDB", type: "rectangle", x: 955, y: 270, width: 210, height: 92 }),
    ];
  } else if (kind === "aws-vpc-networking") {
    // Boundary shapes are deliberately not part of the connector chain. They
    // communicate network scope while the arrows represent the traffic path.
    backgroundNodes = [
      makeBoundary({ role: "vpc-boundary", label: "Amazon VPC", x: 230, y: 125, width: 1030, height: 365 }),
      makeBoundary({ role: "public-subnet", label: "Public Subnet", x: 430, y: 180, width: 300, height: 270 }),
      makeBoundary({ role: "private-subnet", label: "Private Subnet", x: 750, y: 180, width: 480, height: 270 }),
    ];
    nodes = [
      makeNode({ role: "client", label: "Internet Clients", x: 20, y: 275, width: 175, height: 86 }),
      makeNode({ role: "internet-gateway", label: "Internet Gateway", x: 245, y: 275, width: 175, height: 86 }),
      makeNode({ role: "load-balancer", label: "Application Load Balancer", x: 475, y: 275, width: 205, height: 86 }),
      makeNode({ role: "compute", label: "EC2 Instances", x: 790, y: 275, width: 175, height: 86 }),
      makeNode({ role: "database", label: "Amazon RDS", x: 1020, y: 365, width: 175, height: 86 }),
    ];
    connectionNodes = nodes;
  } else if (kind === "system-architecture") {
    nodes = [
      makeNode({ role: "client", label: "Client", type: "rectangle", x: 120, y: 260 }),
      makeNode({ role: "service", label: "API Service", type: "rectangle", x: options.includeCache ? 390 : 470, y: 260 }),
      ...(options.includeCache ? [makeNode({ role: "cache", label: "Cache", type: "rectangle", x: 660, y: 260 })] : []),
      makeNode({ role: "database", label: "Database", type: "rectangle", x: options.includeCache ? 930 : 820, y: 260 }),
    ];
  } else if (kind === "system-scalable-webapp") {
    nodes = [
      makeNode({ role: "client", label: "Web / Mobile Clients", x: 30, y: 255, width: 170 }),
      makeNode({ role: "cdn", label: "CDN / Edge", x: 250, y: 255, width: 170 }),
      makeNode({ role: "load-balancer", label: "Load Balancer", x: 470, y: 255, width: 170 }),
      makeNode({ role: "service", label: "Stateless API", x: 690, y: 255, width: 170 }),
      makeNode({ role: "cache", label: "Distributed Cache", x: 910, y: 165, width: 175 }),
      makeNode({ role: "database", label: "Primary Database", x: 910, y: 355, width: 175 }),
    ];
    connectionNodes = [nodes[0], nodes[1], nodes[2], nodes[3], nodes[5]];
    // Cache is connected explicitly after the linear request path is assembled below.
  } else if (kind === "system-url-shortener") {
    nodes = [
      makeNode({ role: "client", label: "Browser / Client", x: 40, y: 270, width: 175 }),
      makeNode({ role: "api", label: "Redirect / Create API", x: 275, y: 270, width: 190 }),
      makeNode({ role: "key-service", label: "Short Code Service", x: 525, y: 270, width: 190 }),
      makeNode({ role: "cache", label: "Hot URL Cache", x: 775, y: 165, width: 175 }),
      makeNode({ role: "database", label: "URL Mapping Store", x: 775, y: 365, width: 175 }),
    ];
    connectionNodes = [nodes[0], nodes[1], nodes[2], nodes[4]];
  } else if (kind === "system-media-processing") {
    nodes = [
      makeNode({ role: "client", label: "Uploader / Client", x: 25, y: 260, width: 175 }),
      makeNode({ role: "api", label: "Upload API", x: 245, y: 260, width: 170 }),
      makeNode({ role: "object-storage", label: "Object Storage", x: 470, y: 145, width: 175 }),
      makeNode({ role: "queue", label: "Work Queue", x: 470, y: 365, width: 175 }),
      makeNode({ role: "worker", label: "Media Workers", x: 710, y: 365, width: 175 }),
      makeNode({ role: "metadata-store", label: "Metadata Database", x: 950, y: 365, width: 185 }),
    ];
    connectionNodes = [nodes[0], nodes[1], nodes[3], nodes[4], nodes[5]];
  } else if (kind === "system-microservices") {
    nodes = [
      makeNode({ role: "client", label: "Clients", x: 20, y: 270, width: 150 }),
      makeNode({ role: "gateway", label: "API Gateway", x: 215, y: 270, width: 165 }),
      makeNode({ role: "user-service", label: "User Service", x: 435, y: 145, width: 170 }),
      makeNode({ role: "order-service", label: "Order Service", x: 435, y: 395, width: 170 }),
      makeNode({ role: "user-database", label: "User Database", x: 690, y: 145, width: 170 }),
      makeNode({ role: "order-database", label: "Order Database", x: 690, y: 395, width: 170 }),
      makeNode({ role: "event-broker", label: "Event Broker", x: 930, y: 395, width: 170 }),
    ];
    connectionNodes = [nodes[0], nodes[1], nodes[3], nodes[5], nodes[6]];
  } else if (kind === "process-flow") {
    nodes = [
      makeNode({ role: "start", label: "Start", type: "ellipse", x: 120, y: 260 }),
      makeNode({ role: "task", label: "Task", type: "rectangle", x: 470, y: 260 }),
      makeNode({ role: "end", label: "End", type: "ellipse", x: 820, y: 260 }),
    ];
  } else if (kind === "database-erd") {
    nodes = [
      makeNode({ role: "entity", label: "Entity A", type: "rectangle", x: 260, y: 240, width: 210, height: 100 }),
      makeNode({ role: "entity", label: "Entity B", type: "rectangle", x: 650, y: 240, width: 210, height: 100 }),
    ];
  } else if (kind === "layered-architecture") {
    nodes = [
      makeNode({ role: "presentation", label: "Presentation", type: "rectangle", x: 120, y: 260, width: 190 }),
      makeNode({ role: "application", label: "Application", type: "rectangle", x: 390, y: 260, width: 190 }),
      makeNode({ role: "domain", label: "Domain", type: "rectangle", x: 660, y: 260, width: 190 }),
      makeNode({ role: "infrastructure", label: "Infrastructure", type: "rectangle", x: 930, y: 260, width: 190 }),
    ];
  } else if (kind === "event-driven") {
    nodes = [
      makeNode({ role: "producer", label: "Producer", type: "rectangle", x: 120, y: 260, width: 190 }),
      makeNode({ role: "queue", label: "Event Broker", type: "rectangle", x: 470, y: 260, width: 190 }),
      makeNode({ role: "consumer", label: "Consumer", type: "rectangle", x: 820, y: 260, width: 190 }),
    ];
  } else return [];

  const allNodes = [...backgroundNodes, ...nodes];
  const shapes = allNodes.map((node) => node.shape);
  const texts = allNodes.map((node) => node.text);
  const arrowNodes = connectionNodes || nodes;
  const arrows = [];
  for (let index = 0; index < arrowNodes.length - 1; index += 1) {
    arrows.push(makeArrow(arrowNodes[index].shape, arrowNodes[index + 1].shape, arrowNodes[index].shape.customData.design.role, arrowNodes[index + 1].shape.customData.design.role));
  }
  const addConnection = (sourceRole, targetRole) => {
    const source = nodes.find((node) => node.shape.customData.design.role === sourceRole);
    const target = nodes.find((node) => node.shape.customData.design.role === targetRole);
    if (source && target) arrows.push(makeArrow(source.shape, target.shape, sourceRole, targetRole));
  };
  if (kind === "system-scalable-webapp") addConnection("service", "cache");
  if (kind === "system-url-shortener") addConnection("api", "cache");
  if (kind === "system-media-processing") addConnection("api", "object-storage");
  if (kind === "system-microservices") {
    addConnection("gateway", "user-service");
    addConnection("user-service", "user-database");
    addConnection("order-service", "order-database");
  }
  return [...shapes, ...arrows, ...texts];
}
