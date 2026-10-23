# Sketchizi 1.10.44 — Canvas dark-theme synchronization fix

- Re-run canvas background synchronization when the saved scene hydrates, not only when the API first becomes available.
- Migrate legacy default-gray canvas backgrounds to theme-following mode and immediately apply the effective theme color.
- Preserve explicit custom canvas colors.
- Use Excalidraw scene app state with `CaptureUpdateAction.NEVER`; persistence implementation remains unchanged.
