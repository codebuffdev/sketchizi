package dev.sketchizi.ai.service;

import dev.sketchizi.ai.dto.ChatResponse;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Holds only a small, short-lived retry cache in process memory; transcript data is never written to PostgreSQL. */
@Component
public class ChatResultCache {
    private static final int MAX_ENTRIES = 2000;
    private static final long TTL_SECONDS = 900;
    private final Map<UUID, CachedResult> results = new ConcurrentHashMap<>();

    public ChatResponse get(UUID requestId) {
        CachedResult cached = results.get(requestId);
        if (cached == null) return null;
        if (cached.expiresAt.isBefore(Instant.now())) {
            results.remove(requestId, cached);
            return null;
        }
        return cached.response;
    }

    public void put(ChatResponse response) {
        Instant now = Instant.now();
        if (results.size() >= MAX_ENTRIES) {
            results.entrySet().removeIf(entry -> entry.getValue().expiresAt.isBefore(now));
            if (results.size() >= MAX_ENTRIES) {
                results.entrySet().stream().min(Comparator.comparing(entry -> entry.getValue().expiresAt))
                    .ifPresent(entry -> results.remove(entry.getKey(), entry.getValue()));
            }
        }
        results.put(response.requestId(), new CachedResult(response, now.plusSeconds(TTL_SECONDS)));
    }

    private record CachedResult(ChatResponse response, Instant expiresAt) {}
}
