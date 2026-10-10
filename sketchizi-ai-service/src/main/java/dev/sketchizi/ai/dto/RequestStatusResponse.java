package dev.sketchizi.ai.dto;

import java.util.UUID;

public record RequestStatusResponse(UUID requestId, String status, String answer, UsageResponse usage, String code) {}
