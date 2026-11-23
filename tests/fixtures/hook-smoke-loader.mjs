// Test-only loader for hook render smoke tests: stubs the browser-only Excalidraw package and
// the Vite-env logger, then falls back to the repo's extensionless-import shim.
import { resolve as extensionlessResolve } from "../extensionless-import-loader.mjs";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@excalidraw/excalidraw") {
    return { url: new URL("./excalidraw-stub.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (/(^|\/)logging\/logger(\.js)?$/.test(specifier)) {
    return { url: new URL("./noop-logger.mjs", import.meta.url).href, shortCircuit: true };
  }
  return extensionlessResolve(specifier, context, nextResolve);
}
