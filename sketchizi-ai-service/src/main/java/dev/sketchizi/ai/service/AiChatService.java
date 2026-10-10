package dev.sketchizi.ai.service;

import dev.sketchizi.ai.dto.ChatRequest;
import dev.sketchizi.ai.dto.ChatResponse;
import dev.sketchizi.ai.dto.RequestStatusResponse;
import dev.sketchizi.ai.dto.UsageResponse;
import dev.sketchizi.ai.persistence.AiUsageRepository;
import dev.sketchizi.ai.persistence.AiUsageRepository.Reservation;
import dev.sketchizi.ai.persistence.AiUsageRepository.StoredRequest;
import dev.sketchizi.ai.service.AiRequestValidator.ValidatedChatRequest;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AiChatService {
    private static final Logger log = LoggerFactory.getLogger(AiChatService.class);
    private final AiRequestValidator validator;
    private final AiUsageRepository repository;
    private final AiUsageService usageService;
    private final GeminiGenerationService generationService;
    private final ChatResultCache resultCache;

    public AiChatService(AiRequestValidator validator, AiUsageRepository repository, AiUsageService usageService,
            GeminiGenerationService generationService, ChatResultCache resultCache) {
        this.validator = validator;
        this.repository = repository;
        this.usageService = usageService;
        this.generationService = generationService;
        this.resultCache = resultCache;
    }

    public ChatOutcome ask(String accountId, ChatRequest input) {
        ValidatedChatRequest request = validator.validate(input);
        Reservation reservation = repository.reserve(request, accountId);
        if (!reservation.newlyReserved()) {
            if (reservation.status().equals("pending")) return ChatOutcome.processing(request.requestId());
            if (reservation.status().equals("succeeded")) {
                ChatResponse cached = resultCache.get(request.requestId());
                if (cached != null) return ChatOutcome.completed(cached);
                throw AiApiException.conflict("completed_result_not_retained", "This request already succeeded. Its response is no longer in the short-lived retry cache, so it was not generated or charged again.");
            }
            throw AiApiException.conflict("request_already_failed", "This request already failed. Submit a new question attempt to retry generation.");
        }

        String answer;
        try {
            answer = generationService.generate(request);
        } catch (GeminiGenerationService.ProviderFailure failure) {
            repository.markFailed(request.requestId(), accountId, failure.code().equals("provider_timeout") ? "provider_timeout"
                : failure.code().equals("empty_generation") ? "empty_generation" : "provider_error");
            log.warn("AI provider request failed; requestId={} provider={} category={}", request.requestId(), request.provider(), failure.code());
            throw AiApiException.providerUnavailable(
                failure.code().equals("provider_timeout") ? "provider_timeout" : "provider_unavailable",
                failure.code().equals("provider_timeout") ? "Gemini did not respond before the configured timeout. No successful-question allowance was consumed." :
                    "Gemini could not complete this request. No successful-question allowance was consumed.");
        } catch (RuntimeException failure) {
            repository.markFailed(request.requestId(), accountId, "internal_failure");
            log.warn("AI generation failed before a successful response was recorded; requestId={} provider={}", request.requestId(), request.provider());
            throw AiApiException.providerUnavailable("generation_failed", "The AI request could not be completed. No successful-question allowance was consumed.");
        }

        if (!repository.markSucceeded(request.requestId(), accountId)) {
            log.warn("AI generation completed after its reservation was no longer active; requestId={}", request.requestId());
            throw AiApiException.conflict("reservation_lost", "The request reservation expired before success could be recorded. Check usage before submitting another question.");
        }

        UsageResponse usage = null;
        if (request.provider().equals("builtin")) {
            try { usage = usageService.usage(accountId, request.conversationId()); }
            catch (RuntimeException ignored) { log.warn("AI answer was recorded but refreshed usage could not be loaded; requestId={}", request.requestId()); }
        }
        ChatResponse response = new ChatResponse(request.requestId(), "succeeded", answer, usage);
        resultCache.put(response);
        return ChatOutcome.completed(response);
    }

    public RequestStatusResponse requestStatus(String accountId, UUID requestId) {
        StoredRequest stored = repository.getRequest(requestId, accountId)
            .orElseThrow(() -> AiApiException.notFound("request_not_found", "That AI request was not found for this account."));
        ChatResponse cached = resultCache.get(requestId);
        if (cached != null) return new RequestStatusResponse(requestId, stored.status(), cached.answer(), cached.usage(), stored.errorCode());
        return new RequestStatusResponse(requestId, stored.status(), null, null, stored.errorCode());
    }

    public record ChatOutcome(int httpStatus, ChatResponse response, UUID requestId, String status) {
        public static ChatOutcome completed(ChatResponse response) { return new ChatOutcome(200, response, response.requestId(), "succeeded"); }
        public static ChatOutcome processing(UUID requestId) { return new ChatOutcome(202, null, requestId, "processing"); }
    }
}
