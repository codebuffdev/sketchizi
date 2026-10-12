package dev.sketchizi.ai.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.UUID;

public record ChatRequest(
    UUID conversationId,
    UUID requestId,
    String provider,
    String question,
    String apiKey,
    JsonNode diagramContext,
    List<ChatMessage> history
) {}
