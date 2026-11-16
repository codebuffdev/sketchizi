// The client collaboration characterization tests replace the application logger
// only so the source class can run under Node without browser/Vite-only imports.
export const logger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});
