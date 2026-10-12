# Sketchizi 1.10.14 — Auto-open on Selection Fix

- Fixed the Auto-open on selection preference synchronization so the selection callback sees the newly selected ON/OFF value immediately.
- The synchronized setter now resolves against the current preference ref before scheduling the React state update, updates the ref immediately, then updates React state.
- Preserved the existing `sketchizi-properties-auto-open` persistence key and single `activePanel` architecture.
- Manual Properties access remains unchanged.
- No diagnostic logging is retained.
