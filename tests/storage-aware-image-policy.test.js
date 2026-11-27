import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enforcesImportLimit, resolveCloudLimitBytes, resolveStorageMode } from "../src/features/canvas/imageImport/imageSizePolicy.js";
import { decodedDataUrlBytes, inspectCloudPayload, listEmbeddedImages, planImageShrink } from "../src/features/workspace/cloudPayloadPolicy.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MB = 1024 * 1024;
const dataUrl = (decodedBytes) => `data:image/png;base64,${"A".repeat(Math.ceil((decodedBytes * 4) / 3))}`;
const documentWith = (...sizes) => ({
  elements: [],
  files: Object.fromEntries(sizes.map((size, i) => [`f${i}`, { mimeType: "image/png", dataURL: dataUrl(size) }])),
});
const totalOf = (doc, overhead = 2000) => JSON.stringify(doc).length + overhead;

test("storage mode: only cloud-backed canvases enforce the import limit", () => {
  assert.equal(resolveStorageMode({ cloudActive: false }), "local");
  assert.equal(resolveStorageMode({ cloudActive: true, detached: true }), "local");
  assert.equal(resolveStorageMode({ cloudActive: true }), "cloud");
  assert.equal(enforcesImportLimit("local"), false);
  assert.equal(enforcesImportLimit("cloud"), true);
});

test("import hook skips the size check, user lookup and modal for local canvases", () => {
  const hook = read("src/features/canvas/imageImport/useImageImport.js");
  const local = hook.slice(hook.indexOf("if (!enforcesImportLimit(storageModeRef.current))"), hook.indexOf("const user = await resolveUser();"));
  assert.ok(local.includes("insertImageFile(file, origin, index)"));
  assert.ok(!local.includes("maxBytes") && !local.includes("askToShrink") && !local.includes("resolveUser"));
  // cloud path keeps the existing prompt
  assert.ok(hook.includes("askToShrink(file, maxBytes, isAdminUser(user))"));
  assert.ok(read("src/components/app/SketchiziCanvas.jsx").includes("storageMode })"));
  assert.ok(read("src/App.jsx").includes("storageMode={resolveStorageMode("));
});

test("cloud limit: admin 4 MB, standard plan value or 2 MB", () => {
  assert.equal(resolveCloudLimitBytes({ admin: true }), 4 * MB);
  assert.equal(resolveCloudLimitBytes({ admin: false }), 2 * MB);
  assert.equal(resolveCloudLimitBytes({ admin: false, maxImageSizeBytes: 3 * MB }), 3 * MB);
});

test("data URL size and embedded image listing", () => {
  assert.equal(decodedDataUrlBytes("data:image/png;base64,QUJD"), 3);
  assert.equal(decodedDataUrlBytes("data:image/png;base64,QUI="), 2);
  const images = listEmbeddedImages(documentWith(100_000, 500_000));
  assert.deepEqual(images.map((i) => i.id), ["f1", "f0"]);
});

test("a payload within the limit needs no prompt", () => {
  const doc = documentWith(1 * MB);
  const report = inspectCloudPayload({ document: doc, totalBytes: totalOf(doc), maxBytes: 2 * MB });
  assert.equal(report.exceeds, false);
});

test("an 8 MB image exceeds both limits and is planned to fit the WHOLE payload (base64 overhead included)", () => {
  const doc = documentWith(8 * MB);
  for (const max of [2 * MB, 4 * MB]) {
    const total = totalOf(doc);
    const report = inspectCloudPayload({ document: doc, totalBytes: total, maxBytes: max });
    assert.equal(report.exceeds, true);
    assert.equal(report.plan.feasible, true);
    const [target] = report.plan.targets;
    // shrunk base64 + the untouched remainder must land under the limit
    const shrunkPayload = total - doc.files.f0.dataURL.length + Math.ceil((target.targetBlobBytes * 4) / 3);
    assert.ok(shrunkPayload < max, `${shrunkPayload} < ${max}`);
  }
});

test("only the images that must shrink are targeted; small ones stay untouched", () => {
  const doc = documentWith(7 * MB, 100_000, 50_000);
  const plan = planImageShrink({ totalBytes: totalOf(doc), maxBytes: 4 * MB, images: listEmbeddedImages(doc) });
  assert.deepEqual(plan.targets.map((t) => t.id), ["f0"]);
});

test("several mid-size images are shrunk proportionally when none is oversized alone", () => {
  const doc = documentWith(2 * MB, 2 * MB, 2 * MB);
  const plan = planImageShrink({ totalBytes: totalOf(doc), maxBytes: 4 * MB, images: listEmbeddedImages(doc) });
  assert.equal(plan.feasible, true);
  assert.ok(plan.targets.length >= 2);
});

test("infeasible when non-image content alone is over the limit", () => {
  const doc = documentWith(100_000);
  const plan = planImageShrink({ totalBytes: 5 * MB, maxBytes: 2 * MB, images: listEmbeddedImages(doc) });
  assert.equal(plan.needed, true);
  assert.equal(plan.feasible, false);
});

test("Save to Cloud pauses for the modal, shrinks in place, or keeps the diagram local", () => {
  const hook = read("src/hooks/useDocumentPersistence.js");
  const save = hook.slice(hook.indexOf("const saveDrawingToCloud"), hook.indexOf("const queueSketchSave"));
  assert.ok(save.indexOf("inspectCloudPayload(") < save.indexOf("workspaceClient.createDiagram"));
  assert.ok(save.indexOf("askCloudOptimize(") < save.indexOf("optimizeEmbeddedImages("));
  assert.ok(save.indexOf("optimizeEmbeddedImages(") < save.indexOf("workspaceClient.createDiagram"));
  assert.match(save, /decision !== "shrink"[\s\S]*?return;/); // Keep Local Only: no upload
  const modal = read("src/features/canvas/imageImport/CloudOptimizeModal.jsx");
  assert.ok(modal.includes("Optimize Images to Save to Cloud"));
  assert.ok(modal.includes("Shrink Images &amp; Save to Cloud") || modal.includes("Shrink Images & Save to Cloud"));
  assert.ok(modal.includes("Keep Local Only"));
  assert.ok(modal.includes("exceeds {formatBytes(maxBytes)} {limitLabel}"));
  const optimizer = read("src/features/workspace/cloudImageOptimizer.js");
  assert.ok(optimizer.includes("CaptureUpdateAction.NEVER") && optimizer.includes("fileId: idMap.get(element.fileId)"));
});
