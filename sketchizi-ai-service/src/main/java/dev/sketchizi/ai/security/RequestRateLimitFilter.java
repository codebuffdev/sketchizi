package dev.sketchizi.ai.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestRateLimitFilter extends OncePerRequestFilter {
    private static final String UPSERT = """
        INSERT INTO ai_rate_limits (account_id, window_start, request_count) VALUES (?, ?, 1)
        ON CONFLICT (account_id, window_start) DO UPDATE
        SET request_count = ai_rate_limits.request_count + 1
        WHERE ai_rate_limits.request_count < ?
        RETURNING request_count
        """;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final int maxRequestsPerMinute;

    public RequestRateLimitFilter(JdbcTemplate jdbc, ObjectMapper mapper,
            @Value("${app.limits.max-requests-per-minute:60}") int maxRequestsPerMinute) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.maxRequestsPerMinute = Math.max(1, maxRequestsPerMinute);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/ai/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AiAccountPrincipal principal)) {
            chain.doFilter(request, response);
            return;
        }
        long epochMinute = Instant.now().getEpochSecond() / 60 * 60;
        OffsetDateTime windowStart = OffsetDateTime.ofInstant(Instant.ofEpochSecond(epochMinute), ZoneOffset.UTC);
        try {
            boolean[] returnedRow = {false};
            RowCallbackHandler callback = resultSet -> returnedRow[0] = true;
            jdbc.query(UPSERT, callback, principal.accountId(), windowStart, maxRequestsPerMinute);
            if (!returnedRow[0]) {
                response.setStatus(429);
                response.setHeader("Retry-After", "60");
                response.setHeader("Cache-Control", "no-store");
                response.setContentType("application/json");
                mapper.writeValue(response.getOutputStream(), Map.of("error", "Too many AI API requests. Wait a minute and try again.", "code", "request_rate_limited"));
                return;
            }
        } catch (Exception unavailable) {
            response.setStatus(503);
            response.setHeader("Cache-Control", "no-store");
            response.setContentType("application/json");
            mapper.writeValue(response.getOutputStream(), Map.of("error", "AI request protection is temporarily unavailable.", "code", "rate_limit_unavailable"));
            return;
        }
        chain.doFilter(request, response);
    }
}
