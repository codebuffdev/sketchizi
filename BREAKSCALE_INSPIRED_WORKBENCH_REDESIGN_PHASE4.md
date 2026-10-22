# Breakscale-inspired Workbench redesign — Phase 4

## Change
Added a selected-component context card to the Design tab. When a model component is selected, the panel now surfaces its name and component type and provides a direct action to open its properties in the inspector. This reduces the navigation gap between selecting an item on the canvas and editing it. The card is responsive and supports light/dark themes.

## Scope and preservation
- Preserves package version `1.10.86`.
- Reuses the existing `selectedEntity`, component registry, and tab navigation.
- Does not change semantic-model shape, persistence, validation, collaboration, or generated artifacts.

## Verification
Run the focused regression suite listed in the delivery notes. Browser visual verification and production build are not claimed by this patch.
