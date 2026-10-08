# Sketchizi 1.10.20 — Collaboration Creation Status

## Scope

This release makes the existing asynchronous collaboration creation lifecycle visible without changing the collaboration architecture, WebSocket server, or collaboration protocol.

## Changes

- Added an explicit frontend collaboration creation lifecycle: `idle`, `creating`, `success`, and `failed`.
- Kept the existing collaboration creation function and connection flow; the new state is layered onto that flow rather than replacing it.
- Kept the creation dialog visible while a collaboration is being created and shows `Creating collaboration…` with a loading indicator.
- On actual `connected` status, the creating state transitions to the existing successful collaboration UI. The existing status bar and collaboration controls remain unchanged.
- Creation failures are presented as `Collaboration failed` with a user-friendly message and `Try again` action. Raw connection/server errors are not exposed by the creation-failure UI.
- `Try again` calls the existing collaboration creation function; no duplicate creation implementation was introduced.
- Repeated creation clicks are blocked while an initial creation attempt is active.
- Added a 15-second frontend timeout for an initial creation attempt so the UI cannot remain in `Creating collaboration…` indefinitely. The collaboration protocol/server is unchanged.
- Closing the creating state cancels the active frontend creation attempt and closes the existing collaboration client.
- Light and dark themes use the existing collaboration dialog/theme surfaces.

## Intentionally unchanged

- Collaboration server and WebSocket architecture
- Collaboration protocol
- HOST / JOINEE roles and permissions
- Room/session URL generation
- Joining existing collaborations
- Participant/presence handling
- Share, Details, End Collaboration, and Leave controls
- Existing successful collaboration status bar
- Icon Library and its accepted UI
- Floating-button cleanup from 1.10.19
- Other Sketchizi features and architecture
