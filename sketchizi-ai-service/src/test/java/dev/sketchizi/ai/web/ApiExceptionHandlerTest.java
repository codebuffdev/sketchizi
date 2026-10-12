package dev.sketchizi.ai.web;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.SQLException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.mock.web.MockHttpServletRequest;

@ExtendWith(OutputCaptureExtension.class)
class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void unexpectedFailureLogsCorrelationAndApplicationFrameWithoutExceptionMessage(CapturedOutput output) {
        String requestId = "2a72e3eb-9968-4986-b121-19a33fc7408f";
        MockHttpServletRequest request = request("GET", "/api/v1/ai/usage", requestId);
        IllegalStateException failure = new IllegalStateException("DO_NOT_LOG_SENSITIVE_REQUEST_CONTENT");
        failure.setStackTrace(new StackTraceElement[] {
            new StackTraceElement("dev.sketchizi.ai.persistence.AiUsageRepository", "getUsage", "AiUsageRepository.java", 118)
        });

        ResponseEntity<?> response = handler.unexpected(failure, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().toString()).contains("internal_error").doesNotContain("DO_NOT_LOG_SENSITIVE_REQUEST_CONTENT");
        assertThat(output.getOut() + output.getErr())
            .contains(requestId)
            .contains("method=GET")
            .contains("path=/api/v1/ai/usage")
            .contains("java.lang.IllegalStateException")
            .contains("AiUsageRepository#getUsage:118")
            .doesNotContain("DO_NOT_LOG_SENSITIVE_REQUEST_CONTENT");
    }

    @Test
    void databaseFailureLogsSqlStateWithoutSqlExceptionMessage(CapturedOutput output) {
        String requestId = UUID.randomUUID().toString();
        MockHttpServletRequest request = request("POST", "/api/v1/ai/chat", requestId);
        SQLException sql = new SQLException("SENSITIVE_SQL_PARAMETER_OR_PROMPT", "42P01", 0);
        UncategorizedSQLException failure = new UncategorizedSQLException("database operation", "select ?", sql);

        ResponseEntity<?> response = handler.databaseUnavailable(failure, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(output.getOut() + output.getErr())
            .contains(requestId)
            .contains("sqlState=42P01")
            .contains("UncategorizedSQLException")
            .doesNotContain("SENSITIVE_SQL_PARAMETER_OR_PROMPT")
            .doesNotContain("select ?");
    }

    private MockHttpServletRequest request(String method, String path, String requestId) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.addHeader("X-Request-ID", requestId);
        return request;
    }
}
