package dev.sketchizi.ai.dto;

import java.time.OffsetDateTime;

public record UsageResponse(
    int conversationUsed,
    int conversationRemaining,
    int accountUsed,
    int accountRemaining,
    OffsetDateTime nextAvailableAt
) {}
