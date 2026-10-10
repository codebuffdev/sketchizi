package dev.sketchizi.ai.web;

import dev.sketchizi.ai.dto.ChatRequest;
import dev.sketchizi.ai.dto.ChatResponse;
import dev.sketchizi.ai.dto.ConversationResponse;
import dev.sketchizi.ai.dto.RequestStatusResponse;
import dev.sketchizi.ai.dto.UsageResponse;
import dev.sketchizi.ai.security.AiAccountPrincipal;
import dev.sketchizi.ai.service.AiChatService;
import dev.sketchizi.ai.service.AiChatService.ChatOutcome;
import dev.sketchizi.ai.service.AiUsageService;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ai")
public class AiController {
    private final AiUsageService usageService;
    private final AiChatService chatService;

    public AiController(AiUsageService usageService, AiChatService chatService) {
        this.usageService = usageService;
        this.chatService = chatService;
    }

    @PostMapping("/conversations")
    public ResponseEntity<ConversationResponse> createConversation(@AuthenticationPrincipal AiAccountPrincipal account) {
        UUID id = usageService.createConversation(account.accountId());
        return noStore(ResponseEntity.ok(new ConversationResponse(id)));
    }

    @PostMapping("/chat")
    public ResponseEntity<?> ask(@AuthenticationPrincipal AiAccountPrincipal account, @RequestBody ChatRequest request) {
        ChatOutcome outcome = chatService.ask(account.accountId(), request);
        if (outcome.httpStatus() == 202) {
            return noStore(ResponseEntity.accepted().body(Map.of("requestId", outcome.requestId(), "status", outcome.status())));
        }
        return noStore(ResponseEntity.ok(outcome.response()));
    }

    @GetMapping("/usage")
    public ResponseEntity<UsageResponse> usage(@AuthenticationPrincipal AiAccountPrincipal account,
            @RequestParam UUID conversationId) {
        return noStore(ResponseEntity.ok(usageService.usage(account.accountId(), conversationId)));
    }

    @GetMapping("/requests/{requestId}")
    public ResponseEntity<RequestStatusResponse> requestStatus(@AuthenticationPrincipal AiAccountPrincipal account,
            @PathVariable UUID requestId) {
        return noStore(ResponseEntity.ok(chatService.requestStatus(account.accountId(), requestId)));
    }

    private <T> ResponseEntity<T> noStore(ResponseEntity<T> response) {
        return response.cacheControl(CacheControl.noStore().cachePrivate()).header("Pragma", "no-cache");
    }
}
