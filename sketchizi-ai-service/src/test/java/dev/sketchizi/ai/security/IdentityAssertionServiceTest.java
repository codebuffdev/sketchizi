package dev.sketchizi.ai.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

class IdentityAssertionServiceTest {
    private static final String SECRET = "test-only-shared-secret-with-at-least-32-bytes";
    private JdbcTemplate jdbc;
    private IdentityAssertionService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new IdentityAssertionService(new ObjectMapper(), jdbc, SECRET, "sketchizi-ai");
    }

    @Test
    void acceptsValidAudienceAndConsumesAssertionIdOnce() throws Exception {
        String jti = UUID.randomUUID().toString();
        String token = token("account-123", "sketchizi-ai", Instant.now().getEpochSecond(), Instant.now().getEpochSecond() + 60, jti);
        when(jdbc.update(anyString(), any(), any(), any())).thenReturn(1);
        assertEquals("account-123", service.verifyAndConsume(token).accountId());
        verify(jdbc).update(
            eq("INSERT INTO sketchizi_ai.ai_identity_assertions (jti, account_id, expires_at) VALUES (?, ?, ?)"),
            eq(UUID.fromString(jti)), eq("account-123"), any());
        when(jdbc.update(anyString(), any(), any(), any())).thenThrow(new DuplicateKeyException("replay"));
        assertNull(service.verifyAndConsume(token));
    }

    @Test
    void propagatesDatabaseFailureInsteadOfAcceptingAnUnconsumedAssertion() throws Exception {
        long now = Instant.now().getEpochSecond();
        String token = token("account-123", "sketchizi-ai", now, now + 60, UUID.randomUUID().toString());
        when(jdbc.update(anyString(), any(), any(), any()))
            .thenThrow(new DataAccessResourceFailureException("database unavailable"));

        assertThrows(DataAccessResourceFailureException.class, () -> service.verifyAndConsume(token));
        verify(jdbc).update(
            eq("INSERT INTO sketchizi_ai.ai_identity_assertions (jti, account_id, expires_at) VALUES (?, ?, ?)"),
            any(), eq("account-123"), any());
    }

    @Test
    void rejectsExpiredOrWrongAudienceAssertions() throws Exception {
        long now = Instant.now().getEpochSecond();
        assertNull(service.verifyAndConsume(token("account-123", "sketchizi-ai", now - 120, now - 60, UUID.randomUUID().toString())));
        assertNull(service.verifyAndConsume(token("account-123", "other-service", now, now + 60, UUID.randomUUID().toString())));
        verifyNoInteractions(jdbc);
    }

    private String token(String subject, String audience, long iat, long exp, String jti) throws Exception {
        String header = encode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        String claims = encode(new ObjectMapper().writeValueAsString(java.util.Map.of("sub", subject, "aud", audience, "iat", iat, "exp", exp, "jti", jti)));
        String signingInput = header + "." + claims;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));
        return signingInput + "." + signature;
    }

    private String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
