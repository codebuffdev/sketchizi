import { createServer } from "node:http";

export const MAX_INK_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 12000;

export function extractVisionText(payload) {
  const response = payload?.responses?.[0];
  if (response?.error) throw new Error("OCR provider rejected image");
  return typeof response?.fullTextAnnotation?.text === "string"
    ? response.fullTextAnnotation.text.trim()
    : typeof response?.textAnnotations?.[0]?.description === "string"
      ? response.textAnnotations[0].description.trim() : "";
}

export async function recognizeWithVision(png, { apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("Vision API key not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({ requests: [{
        image: { content: png.toString("base64") },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["en"] },
      }] }),
    });
    if (!response.ok) throw new Error("OCR provider unavailable");
    return extractVisionText(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export function createInkRecognitionServer({
  apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY,
  allowedOrigin = process.env.SMART_INK_ALLOWED_ORIGIN,
  recognize = recognizeWithVision,
} = {}) {
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const reply = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(data));
    };
    if (req.url !== "/api/smart-ink/recognize" || req.method !== "POST") {
      reply(404, { error: "Not found" }); return;
    }
    // Browser-origin requests must match the explicitly configured frontend origin.
    // A reverse proxy must enforce application authentication before forwarding.
    if (!allowedOrigin || origin !== allowedOrigin) {
      reply(403, { error: "Origin not allowed" }); return;
    }
    if (req.headers["content-type"]?.split(";")[0] !== "image/png") {
      reply(415, { error: "Expected image/png" }); return;
    }
    if (Number(req.headers["content-length"] || 0) > MAX_INK_BYTES) {
      reply(413, { error: "Image too large" }); return;
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_INK_BYTES) {
          reply(413, { error: "Image too large" }); return;
        }
        chunks.push(chunk);
      }
      const png = Buffer.concat(chunks);
      if (png.length < 8 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        reply(400, { error: "Invalid PNG" }); return;
      }
      if (!apiKey) { reply(503, { error: "Recognition not configured" }); return; }
      const text = await recognize(png, { apiKey });
      reply(200, { text });
    } catch {
      if (!res.headersSent) reply(502, { error: "Recognition unavailable" });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const host = process.env.SMART_INK_HOST || "127.0.0.1";
  const port = Number(process.env.SMART_INK_PORT || 8791);
  createInkRecognitionServer().listen(port, host, () => {
    process.stdout.write(`Smart Ink recognition listening on ${host}:${port}\n`);
  });
}
