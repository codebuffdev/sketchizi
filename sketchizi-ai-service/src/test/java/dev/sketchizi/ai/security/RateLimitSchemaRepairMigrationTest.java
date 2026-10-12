package dev.sketchizi.ai.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class RateLimitSchemaRepairMigrationTest {
    @Test
    void migrationCreatesDedicatedRateLimitTableAndPreservesLegacyCounters() throws IOException {
        String sql;
        try (var input = new ClassPathResource(
                "db/migration/V4__repair_rate_limit_table_schema.sql").getInputStream()) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8).toUpperCase(Locale.ROOT);
        }

        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS SKETCHIZI_AI.AI_RATE_LIMITS"));
        assertTrue(sql.contains("TO_REGCLASS('PUBLIC.AI_RATE_LIMITS')"));
        assertTrue(sql.contains("FROM PUBLIC.AI_RATE_LIMITS"));
        assertTrue(sql.contains("ON CONFLICT (ACCOUNT_ID, WINDOW_START) DO UPDATE"));
        assertTrue(sql.contains("GREATEST(TARGET.REQUEST_COUNT, EXCLUDED.REQUEST_COUNT)"));
        assertTrue(sql.contains("CREATE INDEX IF NOT EXISTS IDX_AI_RATE_LIMITS_EXPIRY"));
        assertFalse(sql.contains("DROP TABLE"));
        assertFalse(sql.contains("TRUNCATE"));
        assertFalse(sql.contains("DELETE FROM PUBLIC.AI_RATE_LIMITS"));
        assertFalse(sql.contains("ALTER TABLE PUBLIC.AI_RATE_LIMITS"));
    }
}
