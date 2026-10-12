package dev.sketchizi.ai.service;

import dev.sketchizi.ai.persistence.AiUsageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class AiDataMaintenance {
    private static final Logger log = LoggerFactory.getLogger(AiDataMaintenance.class);
    private final AiUsageRepository repository;
    public AiDataMaintenance(AiUsageRepository repository) { this.repository = repository; }

    @Scheduled(fixedDelayString = "${AI_METADATA_CLEANUP_DELAY_MS:600000}")
    public void cleanup() {
        try { repository.cleanupOperationalMetadata(); }
        catch (Exception ignored) { log.warn("AI operational metadata cleanup was deferred."); }
    }
}
