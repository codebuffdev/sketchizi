package dev.sketchizi.ai.web;

import dev.sketchizi.ai.service.AiApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final String REQUEST_ID_HEADER = "X-Request-ID";

    @ExceptionHandler(AiApiException.class)
    public ResponseEntity<Map<String, String>> aiException(AiApiException exception) {
        return error(exception.status(), exception.code(), exception.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    public ResponseEntity<Map<String, String>> invalidRequest(Exception ignored) {
        return error(HttpStatus.BAD_REQUEST, "invalid_request", "The AI request is malformed or missing required fields.");
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> databaseUnavailable(DataAccessException exception, HttpServletRequest request) {
        logFailure("AI database operation failed", exception, request);
        return error(HttpStatus.SERVICE_UNAVAILABLE, "storage_unavailable", "AI usage storage is temporarily unavailable. Try again shortly.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception exception, HttpServletRequest request) {
        logFailure("Unhandled AI API failure", exception, request);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "The AI service could not complete this request.");
    }

    /**
     * Emits enough correlation and exception metadata to diagnose production failures,
     * without logging exception messages, SQL text/parameters, request bodies, prompts,
     * diagram context, credentials, or identity assertions.
     */
    private void logFailure(String category, Throwable failure, HttpServletRequest request) {
        Throwable root = rootCause(failure);
        SQLException sql = findSqlException(failure);
        String requestId = safeRequestId(request.getHeader(REQUEST_ID_HEADER));
        String method = safeMethod(request.getMethod());
        String path = safePath(request.getRequestURI());
        String frames = applicationFrames(failure);
        log.error("{}; requestId={} method={} path={} exceptionType={} rootCauseType={} sqlState={} vendorCode={} appFrames={}",
            category,
            requestId,
            method,
            path,
            failure.getClass().getName(),
            root.getClass().getName(),
            sql == null ? "none" : safeSqlState(sql.getSQLState()),
            sql == null ? "none" : sql.getErrorCode(),
            frames);
    }

    private Throwable rootCause(Throwable error) {
        Throwable current = error;
        Set<Throwable> seen = new HashSet<>();
        for (int depth = 0; current.getCause() != null && depth < 16; depth++) {
            if (!seen.add(current) || current.getCause() == current) break;
            current = current.getCause();
        }
        return current;
    }

    private SQLException findSqlException(Throwable error) {
        Throwable current = error;
        Set<Throwable> seen = new HashSet<>();
        for (int depth = 0; current != null && depth < 16 && seen.add(current); depth++) {
            if (current instanceof SQLException sqlException) return sqlException;
            current = current.getCause();
        }
        return null;
    }

    private String applicationFrames(Throwable failure) {
        ArrayList<String> frames = new ArrayList<>();
        Throwable current = failure;
        Set<Throwable> seen = new HashSet<>();
        for (int depth = 0; current != null && depth < 16 && seen.add(current) && frames.size() < 8; depth++) {
            for (StackTraceElement frame : current.getStackTrace()) {
                if (frame.getClassName().startsWith("dev.sketchizi.ai.") && frames.size() < 8) {
                    frames.add(frame.getClassName() + "#" + frame.getMethodName() + ":" + frame.getLineNumber());
                }
            }
            current = current.getCause();
        }
        return frames.isEmpty() ? "none" : String.join(",", frames);
    }

    private String safeRequestId(String value) {
        if (value == null) return "missing";
        try { return UUID.fromString(value).toString(); }
        catch (IllegalArgumentException ignored) { return "invalid"; }
    }

    private String safeMethod(String value) {
        return value != null && value.matches("[A-Z]{1,12}") ? value : "UNKNOWN";
    }

    private String safePath(String value) {
        if (value == null) return "unknown";
        String normalized = value.replaceAll("[^A-Za-z0-9/_{}.-]", "_");
        return normalized.length() <= 160 ? normalized : normalized.substring(0, 160);
    }

    private String safeSqlState(String value) {
        return value != null && value.matches("[0-9A-Z]{5}") ? value : "unknown";
    }

    private ResponseEntity<Map<String, String>> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store, no-cache, must-revalidate, private")
            .header("Pragma", "no-cache").body(Map.of("error", message, "code", code));
    }
}
