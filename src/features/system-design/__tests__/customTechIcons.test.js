import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CUSTOM_KEY, createNodeSkeleton, metaPatch, readNode, serializeSystemDesign, deserializeSystemDesign } from "../sceneModel.js";
import { inferTechnologyIconQuery, toCustomNodeIcon } from "../techIconMapping.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("technology labels and primitive kinds produce useful Icon Library search hints", () => {
  assert.equal(inferTechnologyIconQuery("Redis Cache", "redis"), "redis");
  assert.equal(inferTechnologyIconQuery("Message Queue", "queue"), "kafka");
  assert.equal(inferTechnologyIconQuery("SQL Database", "sql"), "postgres");
  assert.equal(inferTechnologyIconQuery("Document Store", "nosql"), "mongodb");
  assert.equal(inferTechnologyIconQuery("Media Bucket", "object-storage"), "s3");
  assert.equal(inferTechnologyIconQuery("Payment Provider", "external-api"), "stripe");
  assert.equal(inferTechnologyIconQuery("Notification Service", "microservice"), "Notification Service");
});

test("catalog selection is reduced to a serializable customIcon payload", () => {
  const icon = toCustomNodeIcon({ id: "redis", name: "Redis", src: "https://icons.example/redis.svg", source: "eraser", category: "Database", path: "M1 1" });
  assert.deepEqual(icon, {
    id: "redis", name: "Redis", src: "https://icons.example/redis.svg",
    source: "eraser", category: "Database", svgPath: "M1 1",
  });
  assert.equal(toCustomNodeIcon({ id: "bad", name: "Bad" }), null);
});

test("custom icon survives node metadata patching and IndexedDB JSON serialization", () => {
  const element = { id: "redis-node", isDeleted: false, version: 1, ...createNodeSkeleton("redis", { x: 40, y: 60 }) };
  const customIcon = { id: "redis", name: "Redis", src: "https://icons.example/redis.svg", source: "eraser", category: "Database" };
  const patched = { ...element, ...metaPatch(element, { customIcon }) };
  assert.deepEqual(readNode(patched).customIcon, customIcon);
  assert.equal(patched.customData[CUSTOM_KEY].meta.customIcon.name, "Redis");

  const serialized = serializeSystemDesign([patched]);
  const restored = deserializeSystemDesign(serialized);
  assert.deepEqual(restored.nodes[0].customIcon, customIcon);
});

test("resetting a custom icon restores the primitive slot without changing node identity or kind", () => {
  const element = { id: "service-node", isDeleted: false, version: 1, ...createNodeSkeleton("microservice", { x: 0, y: 0 }) };
  const custom = { ...element, ...metaPatch(element, { customIcon: { id: "nginx", name: "Nginx", src: "https://icons.example/nginx.svg" } }) };
  const reset = { ...custom, ...metaPatch(custom, { customIcon: null }) };
  assert.equal(readNode(reset).customIcon, null);
  assert.equal(readNode(reset).id, "service-node");
  assert.equal(readNode(reset).kind, "microservice");
});

test("node slot and contextual controls open the library in assignment mode, and selection assigns rather than inserts", () => {
  const overlay = read("features/system-design/SystemDesignNodeOverlay.jsx");
  const drawer = read("features/system-design/ContextualInspectorDrawer.jsx");
  const studio = read("features/system-design/SystemDesignStudio.jsx");
  const app = read("App.jsx");
  const panel = read("IconLibraryPanel.jsx");
  const assignment = read("features/system-design/useSystemDesignIconAssignment.js");

  assert.match(overlay, /title="Insert or change tech icon"/);
  assert.match(overlay, /onOpenIconLibrary\?\.\(node\)/);
  assert.match(drawer, /onOpenIconLibrary\?\.\(item\)/);
  assert.match(drawer, /Reset icon/);
  assert.match(studio, /onOpenIconLibrary=\{onOpenIconLibrary\}/);
  assert.match(assignment, /setTarget\(\{ nodeId: node\.id, nodeLabel: node\.label \}\)/);
  assert.match(assignment, /systemDesign\.actions\.updateNodeMeta\(target\.nodeId, \{ customIcon \}\)/);
  assert.match(app, /assignmentMode=\{Boolean\(iconAssignment\)\}/);
  assert.match(panel, /assignmentMode \? "Assign Icon to Node" : "Icon Library"/);
  assert.match(panel, /assignmentMode \? `Assign \$\{icon\.name\} to \$\{assignmentTargetLabel\}`/);
  assert.match(panel, /draggable=\{!assignmentMode\}/);
});
