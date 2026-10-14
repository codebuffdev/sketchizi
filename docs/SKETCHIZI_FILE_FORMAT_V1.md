# Sketchizi File Format — Version 1 (Draft)

Status: Phase 1 implementation draft. The schema is intentionally a thin, versioned wrapper around the Excalidraw scene format used by Sketchizi 1.10.85. It is not yet a public long-term stability guarantee.

## Goals

- Keep `.excalidraw` files in the standard Excalidraw JSON shape.
- Prefer `.sketchizi` as the default extension for newly saved drawings while retaining `.excalidraw` when editing an existing file in that format.
- Add `.sketchizi` as a Sketchizi-owned, versioned document format.
- Preserve supported scene elements and their properties, including `customData`, connectors, and Sketchizi architecture-resource metadata.
- Keep image file data referenced by live image elements in the document.
- Reject unknown `.sketchizi` format versions instead of interpreting them as version 1.

## `.sketchizi` top-level schema

```json
{
  "type": "sketchizi",
  "formatVersion": 1,
  "generator": { "name": "Sketchizi" },
  "diagram": {
    "type": "excalidraw",
    "version": 2,
    "source": "https://sketchizi.pages.dev",
    "elements": [],
    "appState": {},
    "files": {}
  },
  "metadata": {
    "title": "Optional title",
    "description": "Optional description"
  },
  "extensions": {}
}
```

`diagram` uses the scene representation already consumed by Sketchizi's pinned Excalidraw 0.18.0 build. The example is abbreviated; actual serialized scenes include the fields needed by the current application.

## Fields

| Field | Rule |
|---|---|
| `type` | Required literal `sketchizi`. |
| `formatVersion` | Required integer. Version 1 is the only version currently supported. |
| `generator` | Identifies the writer. Consumers should not use this field to determine compatibility. |
| `diagram` | Required Excalidraw-compatible scene object. |
| `metadata` | Optional object for document-level title/description and future documented metadata. |
| `extensions` | Optional object for namespaced extension data. Consumers should preserve unknown extension data when editing and re-saving a document. |

### Format contract

- The top-level `type` and `formatVersion` determine the document format. File extensions alone never override the payload.
- Version 1 requires `diagram.type === "excalidraw"` and `diagram.elements` to be an array. Invalid envelopes must be rejected before the canvas is modified.
- `diagram.elements` are stored as Excalidraw-compatible element objects. Sketchizi-specific data should use the element's existing `customData` extension point rather than redefining standard element properties.
- `diagram.files` carries Excalidraw file records referenced by image elements. A writer may omit unreferenced records, but must not omit a record still referenced by a live image element.
- `metadata` and `extensions` are JSON objects. Their values may contain nested JSON values; implementations must not normalize away fields they do not understand.
- Serialization should use UTF-8 JSON and stable field/value ordering where practical. Consumers must not rely on object key order for semantics.
- The parser must validate the entire envelope before replacing the current canvas. A failed parse must leave the existing canvas unchanged.
- Unknown `formatVersion` values must fail with an actionable unsupported-version error. A version-1 parser must not guess how to load a future version.

## `.excalidraw` compatibility

A `.excalidraw` file remains a plain Excalidraw JSON scene (`type: "excalidraw"`). It is not wrapped in the Sketchizi envelope. Existing open/save behavior remains available. Both extensions are accepted by the file open picker and folder browser.

## Asset handling

The `diagram.files` object retains image file records referenced by live image elements. Unreferenced file records and deleted elements are omitted during serialization, matching the current Sketchizi `.excalidraw` save behavior.

## Compatibility and safety rules

1. Validate JSON and required scene fields before updating the canvas.
2. Reject unsupported `formatVersion` values with an explicit error.
3. Do not silently migrate a `.sketchizi` document to a different version.
4. Keep `customData` and other element fields intact when serializing elements.
5. Do not treat an extension or filename as proof that file contents are valid; validate the document payload.
6. Keep `.excalidraw` serialization unchanged in shape.

## Current limitations

- This is an initial format draft, not yet a public long-term stability guarantee.
- Schema validation is currently structural and does not yet validate every Excalidraw element subtype.
- Current parser/serializer normalization of `appState` is intentionally limited to fields Sketchizi currently persists. The format contract must be revisited if future app-state fields become document-critical.
- Cross-version migration, formal JSON Schema publication, and repository commit workflows are out of scope for this phase.
