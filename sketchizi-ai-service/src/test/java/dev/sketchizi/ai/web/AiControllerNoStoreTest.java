package dev.sketchizi.ai.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import dev.sketchizi.ai.dto.ConversationResponse;
import dev.sketchizi.ai.security.AiAccountPrincipal;
import dev.sketchizi.ai.service.AiChatService;
import dev.sketchizi.ai.service.AiUsageService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class AiControllerNoStoreTest {

    @Test
    void createConversationAppliesNoStoreHeadersWithoutMutatingBuiltResponse() {
        AiUsageService usageService = mock(AiUsageService.class);
        AiChatService chatService = mock(AiChatService.class);
        UUID conversationId = UUID.randomUUID();
        when(usageService.createConversation("account-123")).thenReturn(conversationId);

        ResponseEntity<ConversationResponse> response = new AiController(usageService, chatService)
                .createConversation(new AiAccountPrincipal("account-123"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(conversationId, response.getBody().conversationId());
        assertTrue(response.getHeaders().getCacheControl().contains("no-store"));
        assertTrue(response.getHeaders().getCacheControl().contains("private"));
        assertEquals("no-cache", response.getHeaders().getFirst("Pragma"));
    }
}
