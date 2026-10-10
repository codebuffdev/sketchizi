package dev.sketchizi.ai.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class IdentityAssertionFilter extends OncePerRequestFilter {
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
        if (!assertions.isConfigured()) {
            writeError(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "identity_not_configured", "AI identity verification is not configured.");
            return;
        }
        AiAccountPrincipal principal;
        try {
            principal = assertions.verifyAndConsume(request.getHeader("X-Sketchizi-Identity"));
        } catch (org.springframework.dao.DataAccessException unavailable) {
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

    private void writeError(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), Map.of("error", message, "code", code));
    }
}
