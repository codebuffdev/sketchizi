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

export function createStarterElements(kind) {
  let nodes;
  if (kind === "system-architecture") {
    nodes = [
      makeNode({ role: "client", label: "Client", type: "rectangle", x: 120, y: 260 }),
      makeNode({ role: "service", label: "API Service", type: "rectangle", x: 470, y: 260 }),
      makeNode({ role: "database", label: "Database", type: "rectangle", x: 820, y: 260 }),
    ];
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

  const shapes = nodes.map((node) => node.shape);
  const texts = nodes.map((node) => node.text);
  const arrows = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    arrows.push(makeArrow(nodes[index].shape, nodes[index + 1].shape, nodes[index].shape.customData.design.role, nodes[index + 1].shape.customData.design.role));
  }
  return [...shapes, ...arrows, ...texts];
}
