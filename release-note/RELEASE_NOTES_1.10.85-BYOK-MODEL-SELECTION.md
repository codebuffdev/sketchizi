# Sketchizi 1.10.85 — BYOK Model Selection

- Added a Gemini model selector to AI Ask BYOK settings.
- The selected model is paired with the BYOK API key in tab-scoped session storage and sent with each BYOK request.
- Added backend allow-list validation for supported Gemini chat models.
- Retries of an unresolved request retain the model used by that request.
- An unavailable model produces an actionable message instead of a generic provider error.
- Built-in GPT-OSS 120B via Groq remains unchanged.
