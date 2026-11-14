# Smart Ink recognition integration

Write mode watches for new freehand strokes and, after approximately 1.4 seconds without changes, opens a transcription review. It does **not** replace ink without confirmation.

## Recognition provider

Configure `VITE_SMART_INK_RECOGNITION_URL` to a trusted recognition endpoint. The client sends a rasterized PNG as `POST` with `Content-Type: image/png` and expects JSON `{ "text": "recognized words" }`. The endpoint must be authenticated and secured by your server, with no API keys exposed to the browser. Use same-origin routing or configure CORS.

Without a configured endpoint, the app tries the browser's experimental `TextDetector` API. If unsupported or recognition fails, the review dialog allows manual transcription. This is a fallback, **not** a complete out-of-the-box handwriting recognition service.

## UX

Choose Draw → Write, write new strokes, pause, then review/correct the transcription and Apply handwriting. Keep original cancels without removing strokes. Only ink created after entering Write mode is automatically offered for conversion. The manual Beautify selected ink action remains available.

## Follow-up

Implement a first-party, authenticated recognition backend and end-to-end browser tests with handwritten samples before declaring recognition production-ready.
