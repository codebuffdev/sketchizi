/**
 * The Chromium Handwriting Recognition API reads original pen coordinates
 * rather than an OCR image. It can recognize text locally on supported
 * operating systems; unavailable/rejected models fail without losing ink.
 *
 * Do not call it on every pointermove: recognize after a completed stroke.
 */
export function supportsOnlineInk(navigatorApi = typeof navigator === "undefined" ? null : navigator,
                                   StrokeCtor = globalThis.HandwritingStroke) {
  return typeof navigatorApi?.createHandwritingRecognizer === "function" &&
    typeof StrokeCtor === "function";
}

export async function recognizeOnlineInk(elements, {
  navigatorApi = typeof navigator === "undefined" ? null : navigator,
  StrokeCtor = globalThis.HandwritingStroke,
} = {}) {
  if (!supportsOnlineInk(navigatorApi, StrokeCtor)) return { text: "", available: false };
  let recognizer = null;
  let drawing = null;
  try {
    recognizer = await navigatorApi.createHandwritingRecognizer({ languages: ["en"] });
    if (!recognizer) return { text: "", available: false };
    drawing = recognizer.startDrawing({ recognitionType: "text", alternatives: 1 });
    let totalPoints = 0;
    for (const element of elements) {
      if (element?.type !== "freedraw" || !Array.isArray(element.points)) continue;
      const stroke = new StrokeCtor();
      let added = 0;
      for (const [x, y] of element.points) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        stroke.addPoint({ x: element.x + x, y: element.y + y });
        added++;
        totalPoints++;
        if (totalPoints >= 20000) break;
      }
      if (added) drawing.addStroke(stroke);
      if (totalPoints >= 20000) break;
    }
    if (!totalPoints) return { text: "", available: true, provider: "online" };
    const predictions = await drawing.getPrediction();
    return {
      text: typeof predictions?.[0]?.text === "string" ? predictions[0].text.trim() : "",
      available: true,
      provider: "online",
    };
  } catch {
    return { text: "", available: false };
  } finally {
    drawing?.clear?.();
    recognizer?.finish?.();
  }
}
