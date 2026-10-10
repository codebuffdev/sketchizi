package dev.sketchizi.ai.web;

import dev.sketchizi.ai.service.AiApiException;
import java.util.Map;
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
    public ResponseEntity<Map<String, String>> databaseUnavailable(DataAccessException ignored) {
        log.error("AI database operation failed; request content was not logged.");
        return error(HttpStatus.SERVICE_UNAVAILABLE, "storage_unavailable", "AI usage storage is temporarily unavailable. Try again shortly.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception ignored) {
        log.error("Unhandled AI API failure; exception details and request content were suppressed.");
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "The AI service could not complete this request.");
    }

    private ResponseEntity<Map<String, String>> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store, no-cache, must-revalidate, private")
            .header("Pragma", "no-cache").body(Map.of("error", message, "code", code));
    }
}
