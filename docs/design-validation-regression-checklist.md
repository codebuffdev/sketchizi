# Design Validation Regression Checklist

Run the automated design framework tests first:

```bash
node --test tests/design-framework.test.js
```

## Template rules
- [ ] Blank/freeform designs do not invent template constraints.
- [ ] Each built-in template reports its required roles.
- [ ] Duplicate required roles are counted as a quantity, not a boolean.
- [ ] Relationship direction is respected where the template defines direction.
- [ ] Guided mode reports missing requirements as warnings.
- [ ] Strict mode reports missing requirements as errors.
- [ ] Existing connectors are not rejected merely because they already exist.

## Quality score
- [ ] Clean input scores 100.
- [ ] Each error deducts 15 points and each warning deducts 5 points.
- [ ] Total deduction is capped at 60.
- [ ] Informational findings and advisory recommendations do not deduct points.
- [ ] Score and counts refresh after a diagram change.

## Completeness report
- [ ] Deleted elements do not satisfy a required role.
- [ ] Missing required roles show an explicit action.
- [ ] User confirmation is required before adding a component.
- [ ] Added component is selected and placed outside existing visible elements.
- [ ] No connectors are created automatically by the component action.
- [ ] A relationship is labelled not assessed if either role is absent.
- [ ] The report does not describe the absence of a diagnostic as independent proof of correctness.

## Persistence and collaboration
- [ ] Save and reload a `.sketchizi` file and verify diagram elements and design profile.
- [ ] Open and export `.excalidraw` without losing core diagram elements.
- [ ] Confirm the quality/completeness UI does not mutate scene data just by opening.
- [ ] Confirm host and joinee can still join and leave a collaboration session.
- [ ] Confirm the editor remains usable at full width and half-screen width.

## Build and browser checks
- [ ] Run the production build in an environment with project dependencies installed.
- [ ] Open the app and validate one complete and one incomplete template.
- [ ] Test the confirmation and cancellation paths in the browser.
- [ ] Inspect browser console for runtime errors.
