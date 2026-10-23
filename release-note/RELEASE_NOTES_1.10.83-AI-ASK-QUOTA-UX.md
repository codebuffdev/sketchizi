# Sketchizi 1.10.83 — AI Ask quota UX

- Identify the built-in provider as GPT-OSS 120B via Groq, while retaining Gemini naming for BYOK.
- When the rolling account allowance is exhausted, explain that the account-wide limit takes precedence over remaining conversation questions.
- Show the expected next-available time when supplied by the backend.
- Disable built-in starter prompts and hide built-in retry actions while the account allowance is exhausted.
- Label assistant responses with the provider used for that response.
- No quota limits, database records, authentication, or usage-accounting rules are changed.
