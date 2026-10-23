# Icon insertion path

This 1.1.0 build restores the icon insertion pipeline from the last deployed
stable Sketchizi build. The stable implementation was used as the reference:
the icon SVG URL is registered with Excalidraw via addFiles(), then an image
element is produced with convertToExcalidrawElements() and committed with
updateScene(). The modern drag controller remains unchanged.
