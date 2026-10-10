package dev.sketchizi.ai.service;

import dev.sketchizi.ai.dto.UsageResponse;
import dev.sketchizi.ai.persistence.AiUsageRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class AiUsageService {
    private final AiUsageRepository repository;
    public AiUsageService(AiUsageRepository repository) { this.repository = repository; }
    public UUID createConversation(String accountId) { return repository.createConversation(accountId); }
    public UsageResponse usage(String accountId, UUID conversationId) { return repository.getUsage(accountId, conversationId); }
}
