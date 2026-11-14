import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { recognizeOnlineInk } from "./smartInkOnlineRecognition.js";

/** Draw selected ink into an isolated white canvas for native OCR.
 * Browser TextDetector is experimental; callers must provide a correction path.
 */
export function inkBounds(elements) {
  if (!elements.length) return null;
  const left = Math.min(...elements.map((el) => el.x));
  const top = Math.min(...elements.map((el) => el.y));
  const right = Math.max(...elements.map((el) => el.x + el.width));
  const bottom = Math.max(...elements.map((el) => el.y + el.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function renderInkForRecognition(elements) {
  const bounds = inkBounds(elements);
  if (!bounds) return null;
  const padding = 30;
  const scale = Math.min(3, 1600 / Math.max(bounds.width, bounds.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width * scale + padding * 2);
  canvas.height = Math.ceil(bounds.height * scale + padding * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#111111";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const el of elements) {
    if (!Array.isArray(el.points) || !el.points.length) continue;
    ctx.beginPath();
    ctx.lineWidth = Math.max(2, (el.strokeWidth || 2) * scale);
    el.points.forEach((point, index) => {
      const x = (el.x + point[0] - bounds.x) * scale + padding;
      const y = (el.y + point[1] - bounds.y) * scale + padding;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  return canvas;
}

/**
 * Optional recognition service contract:
 * POST image/png to VITE_SMART_INK_RECOGNITION_URL, returns { text: string }.
 * Never embed service secrets in client configuration. The endpoint must be
 * same-origin or explicitly CORS-enabled and authenticate server-side.
 */
export async function recognizeInk(elements) {
  // Prefer pen-stroke recognition when the local operating system provides it.
  const online = await recognizeOnlineInk(elements);
  if (online.text) return online;
  const canvas = renderInkForRecognition(elements);
  if (!canvas) return { text: "", available: false };
  const endpoint = import.meta.env?.VITE_SMART_INK_RECOGNITION_URL || "/api/smart-ink/recognize";
  if (endpoint) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Unable to render ink");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: blob,
        signal: controller.signal,
        credentials: "same-origin",
      });
      if (!response.ok) return recognizeInBrowser(canvas);
      const data = await response.json();
      if (typeof data.text !== "string") throw new Error("Invalid recognition response");
      return { text: data.text.trim(), available: true, provider: "service" };
    } finally {
      clearTimeout(timeout);
    }
  }
  return recognizeInBrowser(canvas);
}

async function recognizeInBrowser(canvas) {
  if (typeof globalThis.TextDetector !== "function") return { text: "", available: false };
  const detector = new globalThis.TextDetector();
  const blocks = await detector.detect(canvas);
  const text = (blocks || []).map((block) => block.rawValue || "").filter(Boolean).join("\\n");
  return { text, available: true, provider: "browser" };
}

export function beautifyInk(api, elements, text) {
  const content = text.trim();
  const bounds = inkBounds(elements);
  if (!api || !bounds || !content) return false;
  const scene = api.getSceneElements?.() || [];
  const converted = convertToExcalidrawElements([{
    type: "text",
    x: bounds.x,
    y: bounds.y,
    text: content,
    fontSize: Math.max(18, Math.min(48, bounds.height / Math.max(1, content.split("\n").length) * 0.85)),
    fontFamily: 1,
    strokeColor: elements[0]?.strokeColor || "#ffffff",
  }]);
  if (!converted.length) return false;
  const removed = new Set(elements.map((el) => el.id));
  api.updateScene({ elements: [...scene.filter((el) => !removed.has(el.id)), ...converted] });
  return true;
}
