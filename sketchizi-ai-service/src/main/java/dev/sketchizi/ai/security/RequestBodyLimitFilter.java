package dev.sketchizi.ai.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestBodyLimitFilter extends OncePerRequestFilter {
    private final int maxRequestBodyBytes;
    private final ObjectMapper mapper;

    public RequestBodyLimitFilter(@Value("${app.limits.max-request-body-bytes:921600}") int maxRequestBodyBytes, ObjectMapper mapper) {
        this.maxRequestBodyBytes = Math.max(1024, maxRequestBodyBytes);
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !"POST".equalsIgnoreCase(request.getMethod())
            || !(path.equals("/api/v1/ai/chat") || path.equals("/api/v1/ai/conversations"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getContentLengthLong() > maxRequestBodyBytes) {
            writeTooLarge(response);
            return;
        }
        byte[] bytes = request.getInputStream().readNBytes(maxRequestBodyBytes + 1);
        if (bytes.length > maxRequestBodyBytes) {
            writeTooLarge(response);
            return;
        }
        chain.doFilter(new ReplayableBodyRequest(request, bytes), response);
    }

    private void writeTooLarge(HttpServletResponse response) throws IOException {
        response.setStatus(413);
        response.setHeader("Cache-Control", "no-store");
        response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(), Map.of("error", "The AI request is too large.", "code", "request_too_large"));
    }

    private static final class ReplayableBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        private ReplayableBodyRequest(HttpServletRequest request, byte[] body) { super(request); this.body = body; }
        @Override public int getContentLength() { return body.length; }
        @Override public long getContentLengthLong() { return body.length; }
        @Override public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public int read(byte[] buffer, int offset, int length) { return input.read(buffer, offset, length); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) {
                    if (listener == null) return;
                    try { if (isFinished()) listener.onAllDataRead(); else listener.onDataAvailable(); }
                    catch (IOException error) { listener.onError(error); }
                }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8)); }
    }
}
