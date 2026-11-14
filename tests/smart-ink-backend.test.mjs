import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createInkRecognitionServer, extractVisionText, recognizeWithVision } from "../server/smart-ink-recognition.mjs";

const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
test("Vision text extraction handles recognized handwriting and empty results", () => {
  assert.equal(extractVisionText({ responses: [{ fullTextAnnotation: { text: "Hello Sketchizi\n" } }] }), "Hello Sketchizi");
  assert.equal(extractVisionText({ responses: [{}] }), "");
  assert.throws(() => extractVisionText({ responses: [{ error: { code: 403 } }] }));
});
test("Vision adapter keeps API key server-side and submits document text detection", async () => {
  const result = await recognizeWithVision(PNG, {
    apiKey: "server-secret",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://vision.googleapis.com/v1/images:annotate");
      assert.equal(options.headers["X-goog-api-key"], "server-secret");
      assert.equal(JSON.parse(options.body).requests[0].features[0].type, "DOCUMENT_TEXT_DETECTION");
      return { ok: true, json: async () => ({ responses: [{ fullTextAnnotation: { text: "Hi!" } }] }) };
    },
  });
  assert.equal(result, "Hi!");
});
test("HTTP route rejects wrong origins and content types and returns recognized text", async (t) => {
  const server = createInkRecognitionServer({
    apiKey: "test-key", allowedOrigin: "http://localhost:5173",
    recognize: async () => "A handwritten sentence",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/smart-ink/recognize`;
  const request = (origin, type, body) => fetch(url, {
    method: "POST", headers: { Origin: origin, "Content-Type": type }, body,
  });
  assert.equal((await request("https://evil.example", "image/png", PNG)).status, 403);
  assert.equal((await request("http://localhost:5173", "text/plain", "x")).status, 415);
  assert.equal((await request("http://localhost:5173", "image/png", Buffer.from("not png"))).status, 400);
  const response = await request("http://localhost:5173", "image/png", PNG);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: "A handwritten sentence" });
});
