import packageJson from "../../package.json";
import { reportLogEvent, sanitizeLogContext, errorReporter } from "./errorReporter";

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const isDevelopment = Boolean(import.meta.env?.DEV);
const configuredLevel = String(import.meta.env?.VITE_LOG_LEVEL || (isDevelopment ? "debug" : "warn")).toLowerCase();
const minimumLevel = LEVELS[configuredLevel] ?? (isDevelopment ? LEVELS.debug : LEVELS.warn);
const applicationVersion = packageJson.version || "unknown";
const environment = import.meta.env?.MODE || (isDevelopment ? "development" : "production");
const emittedErrorObjects = typeof WeakSet === "function" ? new WeakSet() : null;

function safeContext(context) {
  if (!context || typeof context !== "object") return {};
  if (context.error) {
    const { error, ...rest } = context;
    return rest;
  }
  return context;
}

function emit(level, message, context = {}, error) {
  try {
    const normalizedLevel = LEVELS[level] ? level : "info";
    if (LEVELS[normalizedLevel] < minimumLevel) return;

    if (normalizedLevel === "error" && error && typeof error === "object" && emittedErrorObjects) {
      if (emittedErrorObjects.has(error)) return;
      emittedErrorObjects.add(error);
    }

    const normalizedMessage = typeof message === "string" ? message : String(message ?? "");
    const structuredContext = sanitizeLogContext({
      applicationVersion,
      environment,
      ...safeContext(context),
    });
    const normalizedError = error !== undefined ? errorReporter.normalizeError(error) : undefined;

    if (isDevelopment) {
      const prefix = `[Sketchizi] [${normalizedLevel.toUpperCase()}]`;
      const consoleMethod = console[normalizedLevel] || console.log;
      if (Object.keys(structuredContext).length) {
        consoleMethod(prefix, normalizedMessage, structuredContext, ...(normalizedError !== undefined ? [normalizedError] : []));
      } else if (normalizedError !== undefined) {
        consoleMethod(prefix, normalizedMessage, normalizedError);
      } else {
        consoleMethod(prefix, normalizedMessage);
      }
      return;
    }

    // Browser console output is intentionally not used as the production
    // logging destination. A configured provider behind errorReporter can
    // receive structured events without coupling the application to a vendor.
    if (normalizedLevel === "error") {
      reportLogEvent({ level: normalizedLevel, message: normalizedMessage, context: structuredContext, error });
    } else {
      reportLogEvent({ level: normalizedLevel, message: normalizedMessage, context: structuredContext });
    }
  } catch {
    // Logging must never become an application failure source.
  }
}

function debug(message, context) {
  emit("debug", message, context);
}

function info(message, context) {
  emit("info", message, context);
}

function warn(message, context) {
  emit("warn", message, context);
}

function error(message, errorValue, context) {
  emit("error", message, context, errorValue);
}

export const logger = Object.freeze({ debug, info, warn, error });

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};

  const handleError = (event) => {
    logger.error("Unhandled window error", event?.error || event?.message, {
      category: "error",
      source: "window",
      filename: event?.filename || undefined,
      lineNumber: event?.lineno || undefined,
      columnNumber: event?.colno || undefined,
    });
  };

  const handleRejection = (event) => {
    logger.error("Unhandled promise rejection", event?.reason, {
      category: "error",
      source: "unhandledrejection",
    });
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
}
