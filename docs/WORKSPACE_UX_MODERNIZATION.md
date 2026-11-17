# Sketchizi Workspace UX Modernization

## Product direction

Borrow JojoPen's focused scratch-board experience without copying its reduced feature set. Sketchizi should feel immediately usable as a drawing surface while keeping architecture, DevOps, collaboration, AI, validation, and cloud capabilities available on demand.

## UX principles

- Canvas first: drawing space is the primary surface; persistent controls stay compact.
- Context over chrome: formatting controls appear for a selected object or active drawing tool, not as an idle panel.
- Progressive disclosure: advanced tools remain available through existing menus, panels, and command search rather than competing with drawing.
- Quiet persistence: local autosave, cloud save, and export remain distinct and understandable.
- Consistency: shared control sizing, restrained surfaces, clear active/focus states, and equal light/dark quality.

## Phased delivery

### Phase 1 — Canvas-first interaction (this change)

- Mount the existing contextual formatting toolbar in the standard workspace, not only Zen Mode.
- Preserve its own visibility guard: it renders only for an editable selection or supported active drawing tool.
- Refine the contextual rail and popovers with compact dimensions, neutral surfaces, and the existing Sketchizi teal accent.
- Preserve all Excalidraw actions, formatting handlers, shortcuts, document state, and persistence behavior.

### Phase 2 — Workspace hierarchy

- Audit the header, drawing dock, panels, and command palette as one interaction system.
- Reduce always-visible secondary actions and remove duplicate routes to the same action.
- Keep the canvas title and local-save status understandable while keeping advanced capabilities discoverable.
- Validate narrow-desktop and split-screen layouts before changing the default arrangement.

### Phase 3 — Everyday workflow

- Improve tool discovery and shortcut discoverability.
- Make local save, cloud save, and export feedback consistent without merging their meanings.
- Add lightweight first-use guidance for drawing, templates, and DevOps workflows.
- Verify the complete Day/Night and responsive interaction matrix.

## Non-goals

- Do not remove AWS, Kubernetes, Docker, AI, collaboration, validation, templates, pages, or Cloud Workspace.
- Do not add new canvas types or change Sketch/Clean/Chalkboard semantics.
- Do not change persistence formats, backend contracts, or cloud-save policy as part of visual modernization.
- Do not redesign phone layouts in this desktop-focused initiative.
