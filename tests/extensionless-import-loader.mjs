// Test-only resolution shim for this Vite app's extensionless relative imports.
// It also substitutes the logger dependency in src/collaboration.js so the test
// exercises the actual collaboration class without importing Vite's JSON/env layer.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "./logging/logger" && context.parentURL?.endsWith("/src/collaboration.js")) {
    return { url: new URL("./fixtures/noop-logger.mjs", import.meta.url).href, shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier)) {
      for (const extension of [".js", ".mjs"]) {
        try {
          return await nextResolve(`${specifier}${extension}`, context);
        } catch {}
      }
    }
    throw error;
  }
}
