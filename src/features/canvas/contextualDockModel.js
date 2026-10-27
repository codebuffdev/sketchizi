const SHAPE_TYPES = new Set(["rectangle", "diamond", "ellipse", "frame"]);
const CONNECTOR_TYPES = new Set(["line", "arrow"]);

function isLibraryImage(element) {
  return element?.type === "image" && Boolean(
    element.customData?.iconId || element.customData?.diagramIcon,
  );
}

/**
 * Derive the contextual dock mode from the current Excalidraw selection.
 * This module intentionally contains no UI or mutation logic.
 */
export function getContextualDockModel(selectedElements = [], { canEdit = true } = {}) {
  const elements = selectedElements.filter(
    (element) => element && !element.isDeleted && !element.deleted,
  );

  if (!canEdit) {
    return {
      mode: "read-only",
      selectedCount: elements.length,
      canEdit: false,
      showToolControls: true,
      showFormatting: false,
      showTextControls: false,
      showShapeControls: false,
      showConnectorControls: false,
      showStrokeControls: false,
      showLayerControls: false,
      showSpecializedProperties: elements.length > 0,
      preserveImageArtwork: elements.some(isLibraryImage),
    };
  }

  if (elements.length === 0) {
    return {
      mode: "tools",
      selectedCount: 0,
      canEdit: true,
      showToolControls: true,
      showFormatting: false,
      showTextControls: false,
      showShapeControls: false,
      showConnectorControls: false,
      showStrokeControls: false,
      showLayerControls: false,
      showSpecializedProperties: false,
      preserveImageArtwork: false,
    };
  }

  const types = new Set(elements.map((element) => element.type));
  const onlyText = types.size === 1 && types.has("text");
  const onlyShapes = [...types].every((type) => SHAPE_TYPES.has(type));
  const onlyConnectors = [...types].every((type) => CONNECTOR_TYPES.has(type));
  const strokeCompatible = [...types].every((type) => SHAPE_TYPES.has(type) || CONNECTOR_TYPES.has(type));
  const hasLibraryImage = elements.some(isLibraryImage);
  const hasMixedTypes = types.size > 1;
  const mode = hasMixedTypes
    ? "mixed-selection"
    : onlyText
      ? "text"
      : onlyShapes
        ? "shape"
        : onlyConnectors
          ? "connector"
          : hasLibraryImage
            ? "library-image"
            : "element";

  return {
    mode,
    selectedCount: elements.length,
    canEdit: true,
    showToolControls: true,
    showFormatting: true,
    showTextControls: onlyText,
    showShapeControls: onlyShapes,
    showConnectorControls: onlyConnectors,
    showStrokeControls: onlyShapes || onlyConnectors || strokeCompatible,
    showLayerControls: true,
    // Specialized architecture/resource properties remain available to the
    // dock even when the selection is not a standard Excalidraw shape.
    showSpecializedProperties: true,
    preserveImageArtwork: hasLibraryImage,
  };
}
