package dev.sketchizi.ai.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class IdentityAssertionService {
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;
    private final String secret;
    private final String audience;

    public IdentityAssertionService(ObjectMapper mapper, JdbcTemplate jdbc,
            @Value("${app.identity.hmac-secret:}") String secret,
            @Value("${app.identity.audience:sketchizi-ai}") String audience) {
        this.mapper = mapper;
        this.jdbc = jdbc;
        this.secret = secret == null ? "" : secret;
        this.audience = audience;
    }

    public boolean isConfigured() {
        return secret.getBytes(StandardCharsets.UTF_8).length >= 32;
    }

    public AiAccountPrincipal verifyAndConsume(String token) {
        if (!isConfigured() || token == null || token.length() > 4096) return null;
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) return null;
        try {
            JsonNode header = mapper.readTree(Base64.getUrlDecoder().decode(parts[0]));
            if (!"HS256".equals(header.path("alg").asText()) || !"JWT".equals(header.path("typ").asText())) return null;
            byte[] suppliedSignature = Base64.getUrlDecoder().decode(parts[2]);
            byte[] expectedSignature = sign(parts[0] + "." + parts[1]);
            if (!MessageDigest.isEqual(expectedSignature, suppliedSignature)) return null;

            JsonNode claims = mapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
            String subject = claims.path("sub").asText("");
            String claimAudience = claims.path("aud").asText("");
            long issuedAt = claims.path("iat").asLong(0L);
            long expiresAt = claims.path("exp").asLong(0L);
            UUID jti = UUID.fromString(claims.path("jti").asText(""));
            long now = Instant.now().getEpochSecond();
            if (subject.isBlank() || subject.length() > 255 || !audience.equals(claimAudience)) return null;
            if (issuedAt > now + 5 || expiresAt <= now || expiresAt <= issuedAt || expiresAt - issuedAt > 90) return null;

            try {
                jdbc.update("INSERT INTO ai_identity_assertions (jti, account_id, expires_at) VALUES (?, ?, ?)",
                    jti, subject, OffsetDateTime.ofInstant(Instant.ofEpochSecond(expiresAt), ZoneOffset.UTC));
            } catch (DuplicateKeyException replay) {
                return null;
            }
            return new AiAccountPrincipal(subject);
        } catch (org.springframework.dao.DataAccessException unavailable) {
            throw unavailable;
        } catch (Exception invalid) {
            return null;
        }
    }

    private byte[] sign(String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
    }
}
