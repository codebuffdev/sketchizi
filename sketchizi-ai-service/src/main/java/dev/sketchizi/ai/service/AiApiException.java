package dev.sketchizi.ai.service;

import org.springframework.http.HttpStatus;

public class AiApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public AiApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }

    public static AiApiException badRequest(String code, String message) { return new AiApiException(HttpStatus.BAD_REQUEST, code, message); }
    public static AiApiException unauthorized(String code, String message) { return new AiApiException(HttpStatus.UNAUTHORIZED, code, message); }
    public static AiApiException notFound(String code, String message) { return new AiApiException(HttpStatus.NOT_FOUND, code, message); }
    public static AiApiException conflict(String code, String message) { return new AiApiException(HttpStatus.CONFLICT, code, message); }
    public static AiApiException rateLimited(String code, String message) { return new AiApiException(HttpStatus.TOO_MANY_REQUESTS, code, message); }
    public static AiApiException providerUnavailable(String code, String message) { return new AiApiException(HttpStatus.BAD_GATEWAY, code, message); }
}
