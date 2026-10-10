package dev.sketchizi.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class CollaborationHostTokenService {
    private final String secret;
    private final ObjectMapper mapper;

    public CollaborationHostTokenService(
            @Value("${COLLAB_HOST_TOKEN_SECRET:}") String secret,
            ObjectMapper mapper) {
        this.secret = secret;
        this.mapper = mapper;
    }

    public String issue(String subject, String name, String roomId) {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("Collaboration hosting is not configured securely.");
        }
        try {
            String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(Map.of(
                    "aud", "sketchizi-collaboration-host",
                    "sub", subject,
                    "name", name,
                    "roomId", roomId,
                    "exp", (System.currentTimeMillis() / 1000L) + 300L)));
            return payload + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sign(payload));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not authorize collaboration hosting.", exception);
        }
    }

    private byte[] sign(String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return mac.doFinal(payload.getBytes(StandardCharsets.US_ASCII));
    }
}
