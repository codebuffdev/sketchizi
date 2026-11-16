# Sketchizi 1.10.4 — Layout Button Tool-Mode Fix

## Root cause

The Layout button is injected into Excalidraw's native menu by `useNativeSketchiziMenu`. That hook observes `document.body` with a `MutationObserver`. On every observer pass it unconditionally executed:

```js
layoutMenuSection.parentElement.appendChild(layoutMenuSection);
```

Appending an element that is already the last child still creates a DOM child-list mutation. The observer therefore observed and scheduled cleanup for its own DOM mutation continuously. When Excalidraw changed tool/mode state and rebuilt/mutated its menu DOM, this self-triggered DOM churn was also active around the Layout control. The Layout control could remain visible but become unreliable for a real pointer click.

The keyboard shortcut bypasses this DOM path and calls the application Layout action directly, which is why it continued to work.

## Fix

The smallest fix is to append the Layout section only when it is not already the last child of its parent:

```js
const parent = layoutMenuSection.parentElement;
if (parent.lastElementChild !== layoutMenuSection) {
  parent.appendChild(layoutMenuSection);
}
```

This removes the MutationObserver self-mutation loop without changing the Layout state, panel, portal, positioning, CSS, or keyboard shortcut.

## Scope

Changed only the native-menu DOM synchronization and version/release notes. No collaboration, viewer permissions, undo/redo, file management, canvas tool behavior, Layout panel CSS, portal architecture, or keyboard path changes.

## Validation

Static source validation can be performed in this environment. Full runtime/browser and `npm run build` validation remain dependent on installing project dependencies; the current environment previously could not install the uncached Excalidraw dependency because external npm DNS/network access is unavailable.
