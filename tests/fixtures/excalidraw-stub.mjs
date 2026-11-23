// Minimal stand-in for @excalidraw/excalidraw so extracted hooks can be imported in Node.
export const CaptureUpdateAction = Object.freeze({ IMMEDIATELY: "IMMEDIATELY", NEVER: "NEVER", EVENTUALLY: "EVENTUALLY" });
export const restoreElements = (elements) => elements || [];
export const convertToExcalidrawElements = (elements) => elements || [];
export const getCommonBounds = () => [0, 0, 0, 0];
export const exportToBlob = async () => new Blob([]);
export const serializeAsJSON = () => "{}";
