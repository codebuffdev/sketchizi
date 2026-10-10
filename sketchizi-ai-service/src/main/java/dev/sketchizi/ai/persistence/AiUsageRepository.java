package dev.sketchizi.ai.persistence;

import dev.sketchizi.ai.dto.UsageResponse;
import dev.sketchizi.ai.service.AiApiException;
import dev.sketchizi.ai.service.AiRequestValidator.ValidatedChatRequest;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AiUsageRepository {
    private final JdbcTemplate jdbc;
    private final int conversationLimit;
    private final int accountLimit;
    private final int windowHours;
    private final int maxSubmissionsPerMinute;
    private final int maxConcurrentRequests;
    private final int leaseSeconds;

    public AiUsageRepository(JdbcTemplate jdbc,
            @Value("${app.limits.conversation-question-limit:5}") int conversationLimit,
            @Value("${app.limits.account-question-limit:10}") int accountLimit,
            @Value("${app.limits.account-window-hours:12}") int windowHours,
            @Value("${app.limits.max-submissions-per-minute:10}") int maxSubmissionsPerMinute,
            @Value("${app.limits.max-concurrent-requests:2}") int maxConcurrentRequests,
            @Value("${app.limits.reservation-lease-seconds:120}") int leaseSeconds) {
        this.jdbc = jdbc;
        this.conversationLimit = Math.max(1, conversationLimit);
        this.accountLimit = Math.max(1, accountLimit);
        this.windowHours = Math.max(1, windowHours);
        this.maxSubmissionsPerMinute = Math.max(1, maxSubmissionsPerMinute);
        this.maxConcurrentRequests = Math.max(1, maxConcurrentRequests);
        this.leaseSeconds = Math.max(30, leaseSeconds);
    }

    @Transactional
    public UUID createConversation(String accountId) {
        lockAccount(accountId);
        UUID conversationId = UUID.randomUUID();
        jdbc.update("INSERT INTO sketchizi_ai.ai_conversations (conversation_id, account_id) VALUES (?, ?)", conversationId, accountId);
        return conversationId;
    }

    @Transactional
    public Reservation reserve(ValidatedChatRequest request, String accountId) {
        lockAccount(accountId);
        lockAndVerifyConversation(request.conversationId(), accountId);
        releaseExpiredForAccount(accountId);

        Optional<StoredRequest> already = findRequest(request.requestId());
        if (already.isPresent()) return existingReservation(already.get(), request, accountId);

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        long recentSubmissions = count("SELECT COUNT(*) FROM sketchizi_ai.ai_requests WHERE account_id = ? AND created_at >= ?", accountId, now.minusMinutes(1));
        if (recentSubmissions >= maxSubmissionsPerMinute) {
            throw AiApiException.rateLimited("submission_rate_limited", "Too many AI questions were submitted recently. Wait a minute and try again.");
        }
        long activeRequests = count("SELECT COUNT(*) FROM sketchizi_ai.ai_requests WHERE account_id = ? AND status = 'pending' AND lease_expires_at > ?", accountId, now);
        if (activeRequests >= maxConcurrentRequests) {
            throw AiApiException.rateLimited("concurrency_limit", "You already have the maximum number of AI requests in progress. Wait for one to finish.");
        }

        if (request.provider().equals("builtin")) {
            QuotaCounts counts = quotaCounts(accountId, request.conversationId(), now);
            if (counts.accountSucceeded + counts.accountPending >= accountLimit) {
                throw AiApiException.rateLimited("account_quota_exceeded", "The Built-in Gemini allowance is exhausted for the current rolling 12-hour window.");
            }
            if (counts.conversationSucceeded + counts.conversationPending >= conversationLimit) {
                throw AiApiException.rateLimited("conversation_quota_exceeded", "This conversation has reached its Built-in Gemini question limit. Start a new conversation if account allowance remains.");
            }
        }

        OffsetDateTime leaseUntil = now.plusSeconds(leaseSeconds);
        int inserted = jdbc.update("""
            INSERT INTO sketchizi_ai.ai_requests (request_id, account_id, conversation_id, provider, status, reserved_at, lease_expires_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?)
            ON CONFLICT (request_id) DO NOTHING
            """, request.requestId(), accountId, request.conversationId(), request.provider(), now, leaseUntil);
        if (inserted == 1) return new Reservation(request.requestId(), request.conversationId(), request.provider(), "pending", true, null);

        StoredRequest concurrent = findRequest(request.requestId()).orElseThrow(() -> AiApiException.conflict("request_id_conflict", "This request ID is already in use."));
        return existingReservation(concurrent, request, accountId);
    }

    private Reservation existingReservation(StoredRequest existing, ValidatedChatRequest request, String accountId) {
        if (!existing.accountId.equals(accountId) || !existing.conversationId.equals(request.conversationId()) || !existing.provider.equals(request.provider())) {
            throw AiApiException.conflict("request_id_conflict", "This request ID is already in use by another request.");
        }
        return new Reservation(existing.requestId, existing.conversationId, existing.provider, existing.status, false, existing.errorCode);
    }

    @Transactional
    public boolean markSucceeded(UUID requestId, String accountId) {
        int changed = jdbc.update("UPDATE sketchizi_ai.ai_requests SET status = 'succeeded', completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, error_code = NULL WHERE request_id = ? AND account_id = ? AND status = 'pending'", requestId, accountId);
        if (changed == 1) jdbc.update("UPDATE sketchizi_ai.ai_conversations SET last_activity_at = CURRENT_TIMESTAMP WHERE conversation_id = (SELECT conversation_id FROM sketchizi_ai.ai_requests WHERE request_id = ?)", requestId);
        return changed == 1;
    }

    @Transactional
    public void markFailed(UUID requestId, String accountId, String safeCode) {
        String code = List.of("provider_error", "provider_timeout", "empty_generation", "reservation_lost", "internal_failure").contains(safeCode) ? safeCode : "provider_error";
        jdbc.update("UPDATE sketchizi_ai.ai_requests SET status = 'failed', error_code = ?, lease_expires_at = NULL WHERE request_id = ? AND account_id = ? AND status = 'pending'", code, requestId, accountId);
        jdbc.update("UPDATE sketchizi_ai.ai_conversations SET last_activity_at = CURRENT_TIMESTAMP WHERE conversation_id = (SELECT conversation_id FROM sketchizi_ai.ai_requests WHERE request_id = ?)", requestId);
    }

    @Transactional
    public UsageResponse getUsage(String accountId, UUID conversationId) {
        lockAccount(accountId);
        lockAndVerifyConversation(conversationId, accountId);
        releaseExpiredForAccount(accountId);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        QuotaCounts counts = quotaCounts(accountId, conversationId, now);
        int accountUsed = counts.accountSucceeded + counts.accountPending;
        int conversationUsed = counts.conversationSucceeded + counts.conversationPending;
        OffsetDateTime nextAvailable = null;
        if (accountUsed >= accountLimit && counts.oldestSuccess != null) nextAvailable = counts.oldestSuccess.plusHours(windowHours);
        return new UsageResponse(conversationUsed, Math.max(0, conversationLimit - conversationUsed), accountUsed,
                Math.max(0, accountLimit - accountUsed), nextAvailable);
    }

    public Optional<StoredRequest> getRequest(UUID requestId, String accountId) {
        Optional<StoredRequest> stored = findRequest(requestId);
        if (stored.isEmpty() || !stored.get().accountId.equals(accountId)) return Optional.empty();
        return stored;
    }

    @Transactional
    public void cleanupOperationalMetadata() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        jdbc.update("UPDATE sketchizi_ai.ai_requests SET status = 'failed', error_code = 'reservation_expired', lease_expires_at = NULL WHERE status = 'pending' AND lease_expires_at < ?", now);
        jdbc.update("DELETE FROM sketchizi_ai.ai_identity_assertions WHERE expires_at < ?", now);
        jdbc.update("DELETE FROM sketchizi_ai.ai_rate_limits WHERE window_start < ?", now.minusDays(2));
    }

    private void lockAccount(String accountId) {
        jdbc.update("INSERT INTO sketchizi_ai.ai_account_locks (account_id) VALUES (?) ON CONFLICT (account_id) DO NOTHING", accountId);
        jdbc.queryForObject("SELECT account_id FROM sketchizi_ai.ai_account_locks WHERE account_id = ? FOR UPDATE", String.class, accountId);
    }

    private void lockAndVerifyConversation(UUID conversationId, String accountId) {
        List<String> owners = jdbc.query("SELECT account_id FROM sketchizi_ai.ai_conversations WHERE conversation_id = ? FOR UPDATE", (rs, row) -> rs.getString(1), conversationId);
        if (owners.isEmpty() || !owners.get(0).equals(accountId)) {
            throw AiApiException.notFound("conversation_not_found", "That AI conversation was not found for this account.");
        }
    }

    private void releaseExpiredForAccount(String accountId) {
        jdbc.update("UPDATE sketchizi_ai.ai_requests SET status = 'failed', error_code = 'reservation_expired', lease_expires_at = NULL WHERE account_id = ? AND status = 'pending' AND lease_expires_at < CURRENT_TIMESTAMP", accountId);
    }

    private QuotaCounts quotaCounts(String accountId, UUID conversationId, OffsetDateTime now) {
        OffsetDateTime cutoff = now.minusHours(windowHours);
        int accountSucceeded = (int) count("SELECT COUNT(*) FROM sketchizi_ai.ai_requests WHERE account_id = ? AND provider = 'builtin' AND status = 'succeeded' AND completed_at >= ?", accountId, cutoff);
        int accountPending = (int) count("SELECT COUNT(*) FROM sketchizi_ai.ai_requests WHERE account_id = ? AND provider = 'builtin' AND status = 'pending' AND lease_expires_at > ?", accountId, now);
        // Conversation quota is lifetime-scoped; only the account allowance rolls over after 12 hours.
        int conversationSucceeded = (int) count("SELECT COUNT(*) FROM sketchizi_ai.ai_requests WHERE conversation_id = ? AND provider = 'builtin' AND status = 'succeeded'", conversationId);
        int conversationPending = (int) count("SELECT COUNT(*) FROM sketchizi_ai.ai_requests WHERE conversation_id = ? AND provider = 'builtin' AND status = 'pending' AND lease_expires_at > ?", conversationId, now);
        List<OffsetDateTime> oldest = jdbc.query("SELECT MIN(completed_at) FROM sketchizi_ai.ai_requests WHERE account_id = ? AND provider = 'builtin' AND status = 'succeeded' AND completed_at >= ?", (rs, row) -> {
            var value = rs.getObject(1, java.time.OffsetDateTime.class);
            return value;
        }, accountId, cutoff);
        return new QuotaCounts(accountSucceeded, accountPending, conversationSucceeded, conversationPending, oldest.isEmpty() ? null : oldest.get(0));
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0L : value;
    }

    private Optional<StoredRequest> findRequest(UUID requestId) {
        List<StoredRequest> values = jdbc.query("SELECT request_id, account_id, conversation_id, provider, status, error_code FROM sketchizi_ai.ai_requests WHERE request_id = ?", (rs, row) -> new StoredRequest(
            rs.getObject("request_id", UUID.class), rs.getString("account_id"), rs.getObject("conversation_id", UUID.class),
            rs.getString("provider"), rs.getString("status"), rs.getString("error_code")), requestId);
        return values.stream().findFirst();
    }

    public record Reservation(UUID requestId, UUID conversationId, String provider, String status, boolean newlyReserved, String errorCode) {}
    public record StoredRequest(UUID requestId, String accountId, UUID conversationId, String provider, String status, String errorCode) {}
    private record QuotaCounts(int accountSucceeded, int accountPending, int conversationSucceeded, int conversationPending, OffsetDateTime oldestSuccess) {}
}
