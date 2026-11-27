import { contentFileId } from "../../workspace/binaryFileCache.js";
import { DEFAULT_CODE_FILENAME, languageForFilename, sanitizeFilename } from "./codeLanguages.js";
import { normalizeCodeTheme } from "./codeSyntaxTheme.js";

export const CODE_BLOCK_DATA_KEY = "codeBlock";
export const CODE_BLOCK_SCHEMA = 1;
/** Hard cap so a runaway paste cannot produce an unrenderable bitmap. */
export const MAX_CODE_LENGTH = 60_000;

/** True for a live Excalidraw image element that carries code block data. */
export function isCodeBlockElement(element) {
  const data = element?.customData?.[CODE_BLOCK_DATA_KEY];
  return Boolean(element) && element.type === "image" && !element.isDeleted && Boolean(data) && typeof data.code === "string";
}

export function normalizeCodeBlockData(data = {}) {
  return {
    v: CODE_BLOCK_SCHEMA,
    code: String(data.code ?? "").replace(/\r\n?/g, "\n").slice(0, MAX_CODE_LENGTH),
    filename: sanitizeFilename(data.filename ?? DEFAULT_CODE_FILENAME),
    theme: normalizeCodeTheme(data.theme),
  };
}

export function readCodeBlock(element) {
  return isCodeBlockElement(element) ? normalizeCodeBlockData(element.customData[CODE_BLOCK_DATA_KEY]) : null;
}

/** Raw code string the Copy action puts on the clipboard. */
export const codeToCopy = (data) => String(data?.code ?? "");

export function codeBlockFileId({ code, filename, theme }) {
  return contentFileId("code", `${normalizeCodeTheme(theme)}\u0000${filename}\u0000${code}`);
}

export const codeBlockLanguage = (data) => languageForFilename(data?.filename);

/** The scene elements that are code blocks. */
export const findCodeBlocks = (elements) => (elements || []).filter(isCodeBlockElement);

/** Topmost code block whose bounds contain the scene point. */
export function hitTestCodeBlock(elements, point, tolerance = 0) {
  const list = findCodeBlocks(elements);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const el = list[i];
    if (point.x >= el.x - tolerance && point.x <= el.x + el.width + tolerance && point.y >= el.y - tolerance && point.y <= el.y + el.height + tolerance) return el;
  }
  return null;
}
