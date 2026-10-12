package dev.sketchizi.ai.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import dev.sketchizi.ai.dto.ChatRequest;
import dev.sketchizi.ai.dto.ChatResponse;
import dev.sketchizi.ai.dto.UsageResponse;
import dev.sketchizi.ai.persistence.AiUsageRepository;
import dev.sketchizi.ai.persistence.AiUsageRepository.Reservation;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AiChatServiceTest {
    private static final String ACCOUNT = "oidc-account-123";
    private AiRequestValidator validator;
    private AiUsageRepository repository;
    private AiUsageService usageService;
    private GeminiGenerationService generationService;
    private ChatResultCache resultCache;
    private AiChatService service;
    private UUID conversationId;
    private UUID requestId;
    private ChatRequest input;
    private AiRequestValidator.ValidatedChatRequest validated;

    @BeforeEach
    void setUp() {
        validator = mock(AiRequestValidator.class);
        repository = mock(AiUsageRepository.class);
        usageService = mock(AiUsageService.class);
        generationService = mock(GeminiGenerationService.class);
        resultCache = new ChatResultCache();
        service = new AiChatService(validator, repository, usageService, generationService, resultCache);
        conversationId = UUID.randomUUID();
        requestId = UUID.randomUUID();
        input = new ChatRequest(conversationId, requestId, "builtin", "Explain the diagram", null, null, List.of());
        validated = new AiRequestValidator.ValidatedChatRequest(conversationId, requestId, "builtin", "Explain the diagram", "", null, List.of());
        when(validator.validate(input)).thenReturn(validated);
    }

    @Test
    void recordsSuccessfulUsageBeforeReturningTheAnswer() {
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "pending", true, null));
        when(generationService.generate(validated)).thenReturn("A client sends requests to the API.");
        when(repository.markSucceeded(requestId, ACCOUNT)).thenReturn(true);
        when(usageService.usage(ACCOUNT, conversationId)).thenReturn(new UsageResponse(1, 4, 1, 9, null));

        AiChatService.ChatOutcome outcome = service.ask(ACCOUNT, input);

        assertEquals(200, outcome.httpStatus());
        assertEquals("succeeded", outcome.response().status());
        assertEquals("A client sends requests to the API.", outcome.response().answer());
        assertEquals(9, outcome.response().usage().accountRemaining());
        verify(repository).markSucceeded(requestId, ACCOUNT);
        verify(repository, never()).markFailed(any(), anyString(), anyString());
    }

    @Test
    void answerIsCachedImmediatelyAfterDurableSuccessBeforeUsageRefresh() {
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "pending", true, null));
        when(generationService.generate(validated)).thenReturn("A client sends requests to the API.");
        when(repository.markSucceeded(requestId, ACCOUNT)).thenReturn(true);
        when(usageService.usage(ACCOUNT, conversationId)).thenAnswer(invocation -> {
            ChatResponse cached = resultCache.get(requestId);
            assertNotNull(cached, "the answer cache must be populated before usage refresh begins");
            assertEquals("A client sends requests to the API.", cached.answer());
            return new UsageResponse(1, 4, 1, 9, null);
        });

        AiChatService.ChatOutcome outcome = service.ask(ACCOUNT, input);

        assertEquals("A client sends requests to the API.", outcome.response().answer());
        assertEquals(9, outcome.response().usage().accountRemaining());
    }

    @Test
    void providerFailureMarksTheReservationFailedWithoutRecordingSuccess() {
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "pending", true, null));
        when(generationService.generate(validated)).thenThrow(new GeminiGenerationService.ProviderFailure("provider_error"));

        AiApiException failure = assertThrows(AiApiException.class, () -> service.ask(ACCOUNT, input));

        assertEquals("provider_unavailable", failure.code());
        verify(repository).markFailed(requestId, ACCOUNT, "provider_error");
        verify(repository, never()).markSucceeded(any(), anyString());
        verifyNoInteractions(usageService);
    }

    @Test
    void duplicatePendingRequestReturnsProcessingWithoutStartingAnotherGeneration() {
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "pending", false, null));

        AiChatService.ChatOutcome outcome = service.ask(ACCOUNT, input);

        assertEquals(202, outcome.httpStatus());
        assertEquals("processing", outcome.status());
        verifyNoInteractions(generationService);
        verify(repository, never()).markSucceeded(any(), anyString());
    }

    @Test
    void duplicateSuccessfulRequestReturnsCachedAnswerWithoutRegenerationOrUsageCharge() {
        ChatResponse original = new ChatResponse(requestId, "succeeded", "Previously completed answer.", new UsageResponse(1, 4, 1, 9, null));
        resultCache.put(original);
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "succeeded", false, null));

        AiChatService.ChatOutcome outcome = service.ask(ACCOUNT, input);

        assertEquals(original, outcome.response());
        verifyNoInteractions(generationService);
        verify(repository, never()).markSucceeded(any(), anyString());
        verifyNoInteractions(usageService);
    }

    @Test
    void successfulByokRequestDoesNotConsultOrConsumeBuiltInUsageAllowance() {
        AiRequestValidator.ValidatedChatRequest byok = new AiRequestValidator.ValidatedChatRequest(
            conversationId, requestId, "byok", "Explain the diagram", "test-byok-key-value-123456", null, List.of());
        ChatRequest byokInput = new ChatRequest(conversationId, requestId, "byok", "Explain the diagram", "test-byok-key-value-123456", null, List.of());
        when(validator.validate(byokInput)).thenReturn(byok);
        when(repository.reserve(byok, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "byok", "pending", true, null));
        when(generationService.generate(byok)).thenReturn("BYOK answer.");
        when(repository.markSucceeded(requestId, ACCOUNT)).thenReturn(true);

        AiChatService.ChatOutcome outcome = service.ask(ACCOUNT, byokInput);

        assertEquals("BYOK answer.", outcome.response().answer());
        assertNull(outcome.response().usage());
        verifyNoInteractions(usageService);
        verify(repository).markSucceeded(requestId, ACCOUNT);
    }
    @Test
    void succeededRequestWithoutCachedAnswerIsNotRegeneratedAndStatusRemainsDurablySucceeded() {
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "succeeded", false, null));
        AiApiException failure = assertThrows(AiApiException.class, () -> service.ask(ACCOUNT, input));
        assertEquals("completed_result_not_retained", failure.code());
        verifyNoInteractions(generationService);

        when(repository.getRequest(requestId, ACCOUNT)).thenReturn(Optional.of(
            new AiUsageRepository.StoredRequest(requestId, ACCOUNT, conversationId, "builtin", "succeeded", null)));
        var status = service.requestStatus(ACCOUNT, requestId);
        assertEquals("succeeded", status.status());
        assertNull(status.answer());
        verifyNoInteractions(generationService);
    }

    @Test
    void expiredReservationDoesNotMasqueradeAsConfirmedProviderFailure() {
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "failed", false, "reservation_expired"));
        AiApiException failure = assertThrows(AiApiException.class, () -> service.ask(ACCOUNT, input));
        assertEquals("reservation_lost", failure.code());
        verifyNoInteractions(generationService);
        verify(repository, never()).markSucceeded(any(), anyString());
    }

    @Test
    void aConfirmedFailedRequestCannotBeGeneratedAgainUnderTheSameRequestId() {
        when(repository.reserve(validated, ACCOUNT)).thenReturn(new Reservation(requestId, conversationId, "builtin", "failed", false, "provider_error"));
        AiApiException failure = assertThrows(AiApiException.class, () -> service.ask(ACCOUNT, input));
        assertEquals("request_already_failed", failure.code());
        verifyNoInteractions(generationService);
    }

}
