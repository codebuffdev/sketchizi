package dev.sketchizi.ai.security;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import org.junit.jupiter.api.Test;

class RequestRateLimitSchemaTest {
    @Test
    void rateLimitUpsertTargetsTheDedicatedAiSchema() throws Exception {
        Field field = RequestRateLimitFilter.class.getDeclaredField("UPSERT");
        field.setAccessible(true);
        String sql = (String) field.get(null);

        assertTrue(sql.contains("INSERT INTO sketchizi_ai.ai_rate_limits AS current_limit"));
        assertTrue(sql.contains("ON CONFLICT (account_id, window_start) DO UPDATE"));
        assertTrue(sql.contains("WHERE current_limit.request_count < ?"));
        assertTrue(sql.contains("RETURNING request_count"));
    }
}
