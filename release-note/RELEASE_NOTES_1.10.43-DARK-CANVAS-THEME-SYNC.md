# Sketchizi 1.10.43 — Dark canvas theme synchronization fix

- Fixed legacy scenes that incorrectly persisted Excalidraw's default gray canvas background as a custom background.
- Such default-gray scenes now migrate to theme-following canvas mode and use the application's effective light/dark theme.
- Explicitly selected custom colors remain untouched.
- Canvas changes continue to use Excalidraw scene app state and `CaptureUpdateAction.NEVER`; persistence implementation is unchanged.
