import test from "node:test";
import assert from "node:assert/strict";
import { displayName, ensureExtension, getDrawingFormat, isSupportedDrawingName, parseDrawing, serializeDrawing, DrawingFileError } from "../src/fileSystem.js";

const elements = [
  {
    id: "aws-vpc-1",
    type: "rectangle",
    x: 10,
    y: 20,
    width: 180,
    height: 90,
    version: 3,
    versionNonce: 123,
    customData: {
      sketchizi: {
        resourceType: "aws.vpc",
        resourceId: "vpc-main",
        properties: { cidr: "10.0.0.0/16", enableDnsSupport: true },
        validation: { status: "valid", rulesetVersion: 1 },
      },
      thirdParty: { vendor: "example", opaquePayload: [1, "keep", { enabled: true }] },
    },
  },
  {
    id: "service-label",
    type: "text",
    x: 28,
    y: 48,
    width: 112,
    height: 24,
    text: "Application VPC",
    originalText: "Application VPC",
    fontSize: 20,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: "aws-vpc-1",
    lineHeight: 1.25,
    version: 2,
    versionNonce: 789,
    customData: { sketchizi: { role: "architecture-label" } },
  },
  {
    id: "vpc-to-service",
    type: "arrow",
    x: 190,
    y: 60,
    width: 110,
    height: 0,
    points: [[0, 0], [110, 0]],
    startBinding: null,
    endBinding: { elementId: "service-label", focus: 0, gap: 6 },
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
    version: 4,
    versionNonce: 999,
    customData: { sketchizi: { connectorKind: "architecture-flow" } },
  },
];
const sceneElements = [...elements, { id: "image-element", type: "image", fileId: "image-1", x: 0, y: 0, width: 20, height: 20, version: 1, versionNonce: 456, status: "saved", scale: [1, 1], crop: null, customData: { sketchizi: { assetRole: "reference-image" } } }];
const files = {
  "image-1": { id: "image-1", mimeType: "image/png", dataURL: "data:image/png;base64,AA==", created: 1 },
};

 test(".sketchizi serialization wraps an Excalidraw-compatible scene and round-trips metadata", () => {
  const text = serializeDrawing({
    elements: [...sceneElements, { id: "deleted", type: "rectangle", isDeleted: true }],
    appState: { viewBackgroundColor: "#ffffff", scrollX: 10, scrollY: -5, zoom: { value: 1.25 }, currentItemFontFamily: 8 },
    files,
    format: "architecture.sketchizi",
    metadata: { title: "Architecture", description: "Network design" },
    extensions: { "com.example.review": { status: "approved" } },
  });
  const json = JSON.parse(text);
  assert.equal(json.type, "sketchizi");
  assert.equal(json.formatVersion, 1);
  assert.equal(json.diagram.type, "excalidraw");
  assert.equal(json.diagram.elements.length, 4);
  assert.deepEqual(json.metadata, { title: "Architecture", description: "Network design" });
  assert.deepEqual(json.extensions, { "com.example.review": { status: "approved" } });

  const restored = parseDrawing(text);
  assert.equal(restored.format, "sketchizi");
  assert.deepEqual(restored.elements, sceneElements);
  assert.equal(restored.elements[0].customData.sketchizi.properties.cidr, "10.0.0.0/16");
  assert.deepEqual(restored.elements[0].customData.thirdParty.opaquePayload, [1, "keep", { enabled: true }]);
  assert.deepEqual(restored.elements[2].endBinding, { elementId: "service-label", focus: 0, gap: 6 });
  assert.equal(restored.elements[2].endArrowhead, "arrow");
  assert.equal(restored.appState.currentItemFontFamily, 8);
  assert.deepEqual(restored.files, files);
  assert.deepEqual(restored.metadata, json.metadata);
  assert.deepEqual(restored.extensions, json.extensions);

  // A parse -> serialize cycle must retain the wrapper metadata and scene fields.
  const rewritten = JSON.parse(serializeDrawing({
    ...restored,
    format: restored.format,
  }));
  assert.deepEqual(rewritten.metadata, json.metadata);
  assert.deepEqual(rewritten.extensions, json.extensions);
  assert.deepEqual(rewritten.diagram.elements, sceneElements);
  assert.deepEqual(rewritten.diagram.files, files);
});

test("existing .excalidraw serialization remains in the standard Excalidraw shape", () => {
  const text = serializeDrawing({ elements: sceneElements, appState: {}, files });
  const json = JSON.parse(text);
  assert.equal(json.type, "excalidraw");
  assert.equal(json.formatVersion, undefined);
  const restored = parseDrawing(text);
  assert.equal(restored.format, "excalidraw");
  assert.deepEqual(restored.elements, sceneElements);
  assert.deepEqual(restored.files, files);
});

test("file extension helpers recognize both supported diagram formats", () => {
  assert.equal(ensureExtension("architecture"), "architecture.sketchizi");
  assert.equal(ensureExtension("architecture.sketchizi"), "architecture.sketchizi");
  assert.equal(ensureExtension("architecture.excalidraw"), "architecture.excalidraw");
  assert.equal(displayName("architecture.sketchizi"), "architecture");
  assert.equal(getDrawingFormat("architecture.sketchizi"), "sketchizi");
  assert.equal(getDrawingFormat("architecture.excalidraw"), "excalidraw");
  assert.equal(isSupportedDrawingName("nested/architecture.sketchizi"), true);
  assert.equal(isSupportedDrawingName("architecture.json"), false);
});

test("malformed Sketchizi envelopes are rejected rather than treated as plain Excalidraw", () => {
  assert.throws(
    () => parseDrawing(JSON.stringify({ type: "sketchizi", formatVersion: 1, diagram: { type: "not-excalidraw", elements: [] } })),
    (error) => error instanceof DrawingFileError && error.kind === "invalid",
  );
  assert.throws(
    () => parseDrawing(JSON.stringify({ type: "sketchizi", formatVersion: 1, diagram: { type: "excalidraw", elements: "not-an-array" } })),
    (error) => error instanceof DrawingFileError && error.kind === "invalid",
  );
});

test("unknown Sketchizi format versions are rejected without attempting to load the scene", () => {
  assert.throws(
    () => parseDrawing(JSON.stringify({ type: "sketchizi", formatVersion: 2, diagram: { type: "excalidraw", elements: [] } })),
    (error) => error instanceof DrawingFileError && error.kind === "unsupported" && /version: 2/.test(error.message),
  );
});
