package dev.sketchizi.ai.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class IdentityAssertionSchemaMigrationTest {
    @Test
    void v3RepairsTheReplayStoreInTheExplicitAiSchemaWithoutDestructiveDdl() throws IOException {
        String sql;
        try (var input = new ClassPathResource("db/migration/V3__qualify_identity_assertion_store.sql").getInputStream()) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8).toUpperCase(java.util.Locale.ROOT);
        }

        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS SKETCHIZI_AI.AI_IDENTITY_ASSERTIONS"));
        assertTrue(sql.contains("ON SKETCHIZI_AI.AI_IDENTITY_ASSERTIONS (EXPIRES_AT)"));
        assertFalse(sql.contains("DROP TABLE"));
        assertFalse(sql.contains("TRUNCATE"));
    }
}
