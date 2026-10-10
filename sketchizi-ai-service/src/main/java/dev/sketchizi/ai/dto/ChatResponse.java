package dev.sketchizi.ai.dto;

import java.util.UUID;

public record ChatResponse(UUID requestId, String status, String answer, UsageResponse usage) {}
