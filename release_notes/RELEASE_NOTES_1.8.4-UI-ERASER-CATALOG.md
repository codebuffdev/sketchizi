# Sketchizi 1.8.4 — Properties Menu, Eraser Catalog, Collaboration Capacity

- Moved the collaboration entry to the top of the native Sketchizi/Excalidraw menu under Properties and removed the old large Collaborate button from the file-management section.
- Moved Auto-open on selection to the bottom, after Theme.
- Replaced the missing `/api/eraser-catalog` dependency with the project's generated static manifest path plus a direct public Google Cloud Storage fallback.
- Eraser icons use generated local `/eraser-icons/` assets when the sync manifest exists, otherwise public storage URLs.
- Removed the outdated `Sketchizi 1.4.0 · Editable Mind Maps + UML + Eraser` UI branding.
- Documented that the collaboration server currently has no explicit per-room participant limit.
- Existing collaboration synchronization/lifecycle code is otherwise unchanged.
