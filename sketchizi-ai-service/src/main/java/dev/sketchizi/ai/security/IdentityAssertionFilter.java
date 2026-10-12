package dev.sketchizi.ai.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class IdentityAssertionFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(IdentityAssertionFilter.class);
    private static final String REQUEST_ID_HEADER = "X-Request-ID";
    private final IdentityAssertionService assertions;
    private final ObjectMapper mapper;

    public IdentityAssertionFilter(IdentityAssertionService assertions, ObjectMapper mapper) {
        this.assertions = assertions;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/ai/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        response.setHeader("X-Content-Type-Options", "nosniff");
        String requestId = safeRequestId(request.getHeader(REQUEST_ID_HEADER));
        response.setHeader(REQUEST_ID_HEADER, requestId);
        if (!assertions.isConfigured()) {
            writeError(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "identity_not_configured", "AI identity verification is not configured.");
            return;
        }
        AiAccountPrincipal principal;
        try {
            principal = assertions.verifyAndConsume(request.getHeader("X-Sketchizi-Identity"));
        } catch (org.springframework.dao.DataAccessException unavailable) {
            SQLException sqlException = findSqlException(unavailable);
            log.error("AI identity assertion store write failed; requestId={} sqlState={} vendorCode={} causeType={}",
                requestId,
                sqlException == null ? "unknown" : safeSqlState(sqlException.getSQLState()),
                sqlException == null ? "unknown" : sqlException.getErrorCode(),
                unavailable.getClass().getSimpleName());
            writeError(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "identity_store_unavailable", "AI identity verification is temporarily unavailable.");
            return;
        }
        if (principal == null) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "authentication_required", "A verified Sketchizi sign-in session is required.");
            return;
        }
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, java.util.List.of()));
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }


    private String safeRequestId(String value) {
        if (value != null && value.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            return value;
        }
        return UUID.randomUUID().toString();
    }

    private SQLException findSqlException(Throwable error) {
        Throwable current = error;
        int depth = 0;
        while (current != null && depth++ < 12) {
            if (current instanceof SQLException sqlException) return sqlException;
            current = current.getCause();
        }
        return null;
    }

    private String safeSqlState(String value) {
        return value != null && value.matches("[0-9A-Z]{5}") ? value : "unknown";
    }

    private void writeError(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), Map.of("error", message, "code", code));
    }
}
