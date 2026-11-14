# Smart Ink recognition integration

Write mode watches for new freehand strokes and, after approximately 1.4 seconds without changes, opens a transcription review. It does **not** replace ink without confirmation.

## Recognition provider

Configure `VITE_SMART_INK_RECOGNITION_URL` to a trusted recognition endpoint. The client sends a rasterized PNG as `POST` with `Content-Type: image/png` and expects JSON `{ "text": "recognized words" }`. The endpoint must be authenticated and secured by your server, with no API keys exposed to the browser. Use same-origin routing or configure CORS.

Without a configured endpoint, the app tries the browser's experimental `TextDetector` API. If unsupported or recognition fails, the review dialog allows manual transcription. This is a fallback, **not** a complete out-of-the-box handwriting recognition service.

## UX

Choose Draw → Write, write new strokes, pause, then review/correct the transcription and Apply handwriting. Keep original cancels without removing strokes. Only ink created after entering Write mode is automatically offered for conversion. The manual Beautify selected ink action remains available.

## Follow-up

Implement a first-party, authenticated recognition backend and end-to-end browser tests with handwritten samples before declaring recognition production-ready.

## First-party OCR service (Google Cloud Vision)

The repository now includes `server/smart-ink-recognition.mjs`. It uses Google Cloud Vision `DOCUMENT_TEXT_DETECTION`, which can recognize handwriting. It is **not** deployed automatically and requires a Google Cloud project with Vision API enabled and billing configured.

Start the service behind an authenticated same-origin reverse proxy:

```bash
export GOOGLE_CLOUD_VISION_API_KEY="<server-only-key>"
export SMART_INK_ALLOWED_ORIGIN="http://localhost:5173"
export SMART_INK_HOST="127.0.0.1"
export SMART_INK_PORT="8791"
npm run smart-ink-server
```

Proxy `/api/smart-ink/recognize` from the frontend origin to `127.0.0.1:8791` and require authenticated sessions and request rate limiting **at the proxy**. Set `VITE_SMART_INK_RECOGNITION_URL=/api/smart-ink/recognize` in the frontend environment. The service is intentionally bound to loopback by default. Do **not** expose it publicly: the Origin check is not authentication and can be forged by non-browser clients. Restrict the Google Cloud API key to Vision API and monitor costs. No API key should be committed or passed to the browser.

The service accepts a maximum 2 MiB PNG and returns `{ "text": "..." }`. It never stores submitted images. Recognition can be imperfect; users must review the result before replacing their strokes.
