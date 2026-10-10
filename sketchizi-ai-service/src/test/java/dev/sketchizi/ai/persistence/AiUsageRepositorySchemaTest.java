package dev.sketchizi.ai.persistence;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AiUsageRepositorySchemaTest {
    @Test
    void conversationCreationUsesExplicitAiSchema() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(
            eq("SELECT account_id FROM sketchizi_ai.ai_account_locks WHERE account_id = ? FOR UPDATE"),
            eq(String.class), eq("account-123"))).thenReturn("account-123");
        when(jdbc.update(startsWith("INSERT INTO sketchizi_ai.ai_account_locks"), eq("account-123"))).thenReturn(1);
        when(jdbc.update(startsWith("INSERT INTO sketchizi_ai.ai_conversations"), any(UUID.class), eq("account-123"))).thenReturn(1);

        AiUsageRepository repository = new AiUsageRepository(jdbc, 5, 10, 12, 10, 2, 120);
        UUID conversationId = repository.createConversation("account-123");

        verify(jdbc).update(
            eq("INSERT INTO sketchizi_ai.ai_conversations (conversation_id, account_id) VALUES (?, ?)"),
            eq(conversationId), eq("account-123"));
        verify(jdbc).queryForObject(
            eq("SELECT account_id FROM sketchizi_ai.ai_account_locks WHERE account_id = ? FOR UPDATE"),
            eq(String.class), eq("account-123"));
    }

    @Test
    void operationalCleanupUsesExplicitAiSchemaForAllTables() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        AiUsageRepository repository = new AiUsageRepository(jdbc, 5, 10, 12, 10, 2, 120);

        repository.cleanupOperationalMetadata();

        verify(jdbc).update(startsWith("UPDATE sketchizi_ai.ai_requests"), any(OffsetDateTime.class));
        verify(jdbc).update(startsWith("DELETE FROM sketchizi_ai.ai_identity_assertions"), any(OffsetDateTime.class));
        verify(jdbc).update(startsWith("DELETE FROM sketchizi_ai.ai_rate_limits"), any(OffsetDateTime.class));
    }
}
