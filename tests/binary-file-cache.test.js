import test from "node:test";
import assert from "node:assert/strict";
import { hydrateFilesSync, putCachedFiles, contentFileId, getCachedFiles } from "../src/features/workspace/binaryFileCache.js";

const svg = (n) => `data:image/svg+xml;base64,${Buffer.from(`<svg id="${n}"/>`).toString("base64")}`;

test("contentFileId is deterministic and content-sensitive", () => {
  assert.equal(contentFileId("icon", "<svg/>"), contentFileId("icon", "<svg/>"));
  assert.notEqual(contentFileId("icon", "<svg a/>"), contentFileId("icon", "<svg b/>"));
});

test("hydrateFilesSync registers files before scene and marks images saved", () => {
  const calls = [];
  const api = { addFiles: (f) => calls.push(f) };
  const elements = [{ id: "e1", type: "image", fileId: "f1", status: "pending" }, { id: "e2", type: "rectangle" }];
  const out = hydrateFilesSync(api, elements, { f1: { id: "f1", dataURL: svg(1) } });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0][0]).sort(), ["created", "dataURL", "id", "lastRetrieved", "mimeType"]);
  assert.equal(calls[0][0].mimeType, "image/svg+xml");
  assert.equal(out.elements[0].status, "saved");
  assert.deepEqual(out.missing, []);
});

test("missing files fall back to the cache and stay pending when absent", async () => {
  await putCachedFiles({ cached1: { id: "cached1", dataURL: svg(2) } });
  const api = { addFiles() {} };
  const out = hydrateFilesSync(api, [
    { id: "a", type: "image", fileId: "cached1", status: "pending" },
    { id: "b", type: "image", fileId: "nowhere", status: "pending" },
  ], {});
  assert.equal(out.elements[0].status, "saved");
  assert.equal(out.elements[1].status, "pending");
  assert.deepEqual(out.missing, ["nowhere"]);
  assert.deepEqual(Object.keys(await getCachedFiles(["cached1"])), ["cached1"]);
});
