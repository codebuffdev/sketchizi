package dev.sketchizi.ai.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockFilterChain;

class IdentityAssertionFilterTest {
    @Test
    void identityStoreFailureReturnsCorrelated503WithoutExposingDatabaseDetails() throws Exception {
        IdentityAssertionService assertionService = org.mockito.Mockito.mock(IdentityAssertionService.class);
        ObjectMapper mapper = new ObjectMapper();
        IdentityAssertionFilter filter = new IdentityAssertionFilter(assertionService, mapper);
        String requestId = "123e4567-e89b-42d3-a456-426614174000";
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/ai/usage");
        request.addHeader("X-Request-ID", requestId);
        request.addHeader("X-Sketchizi-Identity", "test-assertion");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        when(assertionService.isConfigured()).thenReturn(true);
        when(assertionService.verifyAndConsume(anyString())).thenThrow(
            new DataAccessResourceFailureException("sensitive database detail must not be returned",
                new SQLException("sensitive database message", "42P01", 0)));

        filter.doFilter(request, response, chain);

        assertEquals(503, response.getStatus());
        assertEquals(requestId, response.getHeader("X-Request-ID"));
        JsonNode body = mapper.readTree(response.getContentAsString());
        assertEquals("identity_store_unavailable", body.path("code").asText());
        assertEquals("AI identity verification is temporarily unavailable.", body.path("error").asText());
        assertFalse(response.getContentAsString().contains("42P01"));
        assertFalse(response.getContentAsString().contains("sensitive database"));
        assertEquals(null, chain.getRequest());
    }
}
