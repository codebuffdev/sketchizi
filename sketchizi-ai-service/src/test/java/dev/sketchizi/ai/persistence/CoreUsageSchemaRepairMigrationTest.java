package dev.sketchizi.ai.persistence;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class CoreUsageSchemaRepairMigrationTest {
    @Test
    void migrationCreatesCoreTablesInAiSchemaAndPreservesPublicData() throws IOException {
        String sql;
        try (var input = new ClassPathResource(
                "db/migration/V5__repair_core_usage_tables_schema.sql").getInputStream()) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8).toUpperCase(Locale.ROOT);
        }

        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS SKETCHIZI_AI.AI_ACCOUNT_LOCKS"));
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS SKETCHIZI_AI.AI_CONVERSATIONS"));
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS SKETCHIZI_AI.AI_REQUESTS"));
        assertTrue(sql.contains("REFERENCES SKETCHIZI_AI.AI_CONVERSATIONS(CONVERSATION_ID) ON DELETE CASCADE"));
        assertTrue(sql.contains("FROM PUBLIC.AI_ACCOUNT_LOCKS"));
        assertTrue(sql.contains("FROM PUBLIC.AI_CONVERSATIONS"));
        assertTrue(sql.contains("FROM PUBLIC.AI_REQUESTS"));
        assertTrue(sql.contains("ON CONFLICT (REQUEST_ID) DO NOTHING"));
        assertTrue(sql.contains("IDX_AI_CONVERSATIONS_ACCOUNT_CREATED"));
        assertTrue(sql.contains("IDX_AI_REQUESTS_ACCOUNT_SUCCESS"));
        assertTrue(sql.contains("IDX_AI_REQUESTS_CONVERSATION_SUCCESS"));
        assertTrue(sql.contains("IDX_AI_REQUESTS_ACCOUNT_PENDING"));
        assertTrue(sql.contains("IDX_AI_REQUESTS_ACCOUNT_CREATED"));
        assertFalse(sql.contains("DROP TABLE"));
        assertFalse(sql.contains("TRUNCATE"));
        assertFalse(sql.contains("DELETE FROM PUBLIC.AI_"));
        assertFalse(sql.contains("ALTER TABLE PUBLIC.AI_"));
    }
}
