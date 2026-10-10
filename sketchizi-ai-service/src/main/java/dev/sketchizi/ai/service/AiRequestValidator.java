package dev.sketchizi.ai.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.sketchizi.ai.dto.ChatMessage;
import dev.sketchizi.ai.dto.ChatRequest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AiRequestValidator {
    private static final Pattern SECRET_LIKE_KEY = Pattern.compile("(?i).*(secret|password|credential|token|api.?key|private.?key|session|cookie|auth).*");
    private static final Set<String> ELEMENT_KEYS = Set.of("id", "type", "label", "geometry", "groupIds", "frameId", "containerElementId", "connector", "architectureRelationship", "architectureResource", "diagramIcon", "iconCategory", "iconSource");
    private static final Set<String> RELATIONSHIP_KEYS = Set.of("provider", "relationshipId", "relationshipType", "sourceResourceId", "targetResourceId");
    private static final Set<String> RESOURCE_KEYS = Set.of("provider", "resourceId", "definitionId", "resourceType", "service", "catalog", "iconId", "properties");
    private static final Set<String> CONNECTOR_KEYS = Set.of("sourceElementId", "targetElementId", "relationshipExplicit", "startArrowhead", "endArrowhead", "label");
    private final ObjectMapper mapper;
    private final int maxElements;
    private final int maxDiagramChars;
    private final int maxQuestionChars;
    private final int maxHistoryMessages;
    private final int maxHistoryChars;

    public AiRequestValidator(ObjectMapper mapper,
            @Value("${app.limits.max-elements:1500}") int maxElements,
            @Value("${app.limits.max-diagram-context-chars:180000}") int maxDiagramChars,
            @Value("${app.limits.max-question-chars:4000}") int maxQuestionChars,
            @Value("${app.limits.max-history-messages:12}") int maxHistoryMessages,
            @Value("${app.limits.max-history-chars:48000}") int maxHistoryChars) {
        this.mapper = mapper;
        this.maxElements = maxElements;
        this.maxDiagramChars = maxDiagramChars;
        this.maxQuestionChars = maxQuestionChars;
        this.maxHistoryMessages = maxHistoryMessages;
        this.maxHistoryChars = maxHistoryChars;
    }

    public ValidatedChatRequest validate(ChatRequest request) {
        if (request == null || request.conversationId() == null || request.requestId() == null) {
            throw AiApiException.badRequest("invalid_request", "A conversation ID and unique request ID are required.");
        }
        String provider = request.provider() == null ? "" : request.provider().toLowerCase(Locale.ROOT);
        if (!provider.equals("builtin") && !provider.equals("byok")) {
            throw AiApiException.badRequest("invalid_provider", "Select Built-in Gemini or BYOK.");
        }
        String question = request.question() == null ? "" : request.question().trim();
        if (question.isEmpty() || question.length() > maxQuestionChars) {
            throw AiApiException.badRequest("invalid_question", "Question text must contain 1 to " + maxQuestionChars + " characters.");
        }
        String apiKey = request.apiKey() == null ? "" : request.apiKey().trim();
        if (provider.equals("byok")) {
            if (apiKey.length() < 20 || apiKey.length() > 512 || apiKey.chars().anyMatch(Character::isISOControl)) {
                throw AiApiException.badRequest("invalid_byok_key", "Enter a valid Gemini API key. The key is not stored by Sketchizi.");
            }
        } else if (!apiKey.isEmpty()) {
            throw AiApiException.badRequest("unexpected_api_key", "An API key is accepted only for BYOK requests.");
        }
        JsonNode diagram = sanitizeDiagram(request.diagramContext());
        List<ChatMessage> history = sanitizeHistory(request.history());
        int aggregate = question.length() + history.stream().mapToInt(message -> message.text().length()).sum();
        if (aggregate > maxHistoryChars) {
            throw AiApiException.badRequest("conversation_context_too_large", "Recent conversation history is too large. Clear some messages or start a new conversation.");
        }
        return new ValidatedChatRequest(request.conversationId(), request.requestId(), provider, question, apiKey, diagram, history);
    }

    private JsonNode sanitizeDiagram(JsonNode input) {
        if (input == null || !input.isObject() || input.path("schemaVersion").asInt(-1) != 1 || !input.path("elements").isArray()) {
            throw AiApiException.badRequest("invalid_diagram_context", "The diagram context is missing or uses an unsupported schema version.");
        }
        ArrayNode sourceElements = (ArrayNode) input.path("elements");
        if (sourceElements.size() > maxElements) {
            throw AiApiException.badRequest("diagram_too_large", "This diagram exceeds the supported element count. No partial analysis was performed.");
        }
        if (input.has("elementCount") && input.path("elementCount").asInt(-1) != sourceElements.size()) {
            throw AiApiException.badRequest("inconsistent_diagram_context", "The diagram snapshot is incomplete or inconsistent. Capture a fresh snapshot and retry.");
        }
        Set<String> ids = new HashSet<>();
        for (JsonNode item : sourceElements) {
            if (!item.isObject() || !item.path("id").isTextual() || !item.path("type").isTextual()) {
                throw AiApiException.badRequest("invalid_diagram_element", "Every diagram element must have an ID and type.");
            }
            String id = item.path("id").asText();
            String type = item.path("type").asText();
            if (id.isBlank() || id.length() > 200 || type.isBlank() || type.length() > 80 || !ids.add(id)) {
                throw AiApiException.badRequest("invalid_diagram_element", "The diagram contains a duplicate or invalid element ID/type.");
            }
        }
        ObjectNode result = mapper.createObjectNode();
        result.put("schemaVersion", 1);
        putOptionalText(result, "snapshotId", input, 120);
        putOptionalText(result, "capturedAt", input, 80);
        result.put("scope", "complete-current-canvas");
        result.put("elementCount", sourceElements.size());
        ArrayNode elements = result.putArray("elements");
        for (JsonNode item : sourceElements) elements.add(sanitizeElement(item, ids));
        String serialized = serialize(result);
        if (serialized.length() > maxDiagramChars) {
            throw AiApiException.badRequest("diagram_context_too_large", "The complete diagram context exceeds the configured size limit. No arbitrary elements were dropped; reduce or simplify the diagram and try again.");
        }
        return result;
    }

    private ObjectNode sanitizeElement(JsonNode item, Set<String> ids) {
        ObjectNode result = mapper.createObjectNode();
        result.put("id", requiredText(item, "id", 200));
        result.put("type", requiredText(item, "type", 80));
        putOptionalText(result, "label", item, 1500);
        if (item.has("geometry")) {
            JsonNode geometry = item.path("geometry");
            if (!geometry.isObject()) throw AiApiException.badRequest("invalid_geometry", "A diagram element has invalid geometry.");
            ObjectNode safeGeometry = mapper.createObjectNode();
            for (String key : List.of("x", "y", "width", "height")) {
                JsonNode value = geometry.get(key);
                if (value == null || value.isNull()) continue;
                if (!value.isNumber() || !Double.isFinite(value.asDouble()) || Math.abs(value.asDouble()) > 10_000_000) {
                    throw AiApiException.badRequest("invalid_geometry", "A diagram element has out-of-range geometry.");
                }
                safeGeometry.put(key, value.asDouble());
            }
            result.set("geometry", safeGeometry);
        }
        if (item.has("groupIds")) {
            JsonNode values = item.path("groupIds");
            if (!values.isArray() || values.size() > 20) throw AiApiException.badRequest("invalid_groups", "A diagram element has invalid group metadata.");
            ArrayNode safe = result.putArray("groupIds");
            for (JsonNode value : values) safe.add(requireTextNode(value, 160, "invalid_groups"));
        }
        putOptionalReference(result, "frameId", item, ids);
        putOptionalReference(result, "containerElementId", item, ids);
        if (item.has("connector")) result.set("connector", sanitizeConnector(item.path("connector"), ids));
        if (item.has("architectureRelationship")) result.set("architectureRelationship", sanitizeRelationship(item.path("architectureRelationship")));
        if (item.has("architectureResource")) result.set("architectureResource", sanitizeResource(item.path("architectureResource")));
        if (item.path("diagramIcon").isBoolean()) result.put("diagramIcon", item.path("diagramIcon").asBoolean());
        putOptionalText(result, "iconCategory", item, 120);
        putOptionalText(result, "iconSource", item, 80);
        return result;
    }

    private ObjectNode sanitizeConnector(JsonNode source, Set<String> ids) {
        if (!source.isObject()) throw AiApiException.badRequest("invalid_connector", "A connector has invalid metadata.");
        ObjectNode result = mapper.createObjectNode();
        String from = nullableReference(source.path("sourceElementId"), ids);
        String to = nullableReference(source.path("targetElementId"), ids);
        if (from != null) result.put("sourceElementId", from); else result.putNull("sourceElementId");
        if (to != null) result.put("targetElementId", to); else result.putNull("targetElementId");
        result.put("relationshipExplicit", from != null && to != null);
        putOptionalText(result, "startArrowhead", source, 40);
        putOptionalText(result, "endArrowhead", source, 40);
        putOptionalText(result, "label", source, 800);
        return result;
    }

    private ObjectNode sanitizeRelationship(JsonNode source) {
        if (!source.isObject()) throw AiApiException.badRequest("invalid_relationship", "A relationship has invalid metadata.");
        ObjectNode result = mapper.createObjectNode();
        String provider = source.path("provider").asText("");
        if (!Set.of("aws", "kubernetes", "networking").contains(provider)) throw AiApiException.badRequest("invalid_relationship", "A relationship provider is invalid.");
        result.put("provider", provider);
        putOptionalText(result, "relationshipId", source, 200);
        putOptionalText(result, "relationshipType", source, 120);
        putOptionalText(result, "sourceResourceId", source, 200);
        putOptionalText(result, "targetResourceId", source, 200);
        return result;
    }

    private ObjectNode sanitizeResource(JsonNode source) {
        if (!source.isObject()) throw AiApiException.badRequest("invalid_resource", "An architecture resource has invalid metadata.");
        ObjectNode result = mapper.createObjectNode();
        String provider = source.path("provider").asText("");
        if (!Set.of("aws", "kubernetes", "networking").contains(provider)) throw AiApiException.badRequest("invalid_resource", "An architecture resource provider is invalid.");
        result.put("provider", provider);
        putOptionalText(result, "resourceId", source, 200);
        for (String field : List.of("definitionId", "resourceType", "service", "catalog", "iconId")) putOptionalText(result, field, source, 160);
        if (source.has("properties")) result.set("properties", sanitizeProperties(source.path("properties"), 0, new int[] {0}));
        return result;
    }

    private JsonNode sanitizeProperties(JsonNode source, int depth, int[] count) {
        if (depth > 2 || count[0] > 200 || source == null || !source.isObject()) {
            if (source == null || source.isNull()) return mapper.createObjectNode();
            if (depth > 2 || count[0] > 200 || !source.isObject()) throw AiApiException.badRequest("invalid_resource_properties", "Architecture resource properties exceed supported limits.");
        }
        ObjectNode result = mapper.createObjectNode();
        Iterator<String> names = source.fieldNames();
        while (names.hasNext()) {
            String key = names.next();
            count[0]++;
            if (count[0] > 200) throw AiApiException.badRequest("invalid_resource_properties", "Architecture resource properties exceed supported limits.");
            if (SECRET_LIKE_KEY.matcher(key).matches()) continue;
            if (key.length() > 80) throw AiApiException.badRequest("invalid_resource_properties", "An architecture property name is too long.");
            JsonNode value = source.get(key);
            if (value.isTextual()) {
                if (value.asText().length() > 500) throw AiApiException.badRequest("invalid_resource_properties", "An architecture property value is too long.");
                result.put(key, value.asText());
            } else if (value.isNumber() && Double.isFinite(value.asDouble())) result.set(key, value.deepCopy());
            else if (value.isBoolean() || value.isNull()) result.set(key, value.deepCopy());
            else if (value.isObject()) result.set(key, sanitizeProperties(value, depth + 1, count));
            else if (value.isArray()) {
                if (value.size() > 30) throw AiApiException.badRequest("invalid_resource_properties", "An architecture property list is too large.");
                ArrayNode safeItems = mapper.createArrayNode();
                for (JsonNode child : value) {
                    if (child.isTextual()) {
                        if (child.asText().length() > 500) throw AiApiException.badRequest("invalid_resource_properties", "An architecture property value is too long.");
                        safeItems.add(child.asText());
                    } else if (child.isNumber() || child.isBoolean() || child.isNull()) safeItems.add(child);
                    else if (child.isObject()) safeItems.add(sanitizeProperties(child, depth + 1, count));
                }
                result.set(key, safeItems);
            }
        }
        return result;
    }

    private void putOptionalReference(ObjectNode target, String field, JsonNode source, Set<String> ids) {
        String reference = nullableReference(source.path(field), ids);
        if (reference != null) target.put(field, reference);
    }

    private String nullableReference(JsonNode value, Set<String> ids) {
        if (value == null || value.isNull() || !value.isTextual()) return null;
        String text = value.asText();
        return text.length() <= 200 && ids.contains(text) ? text : null;
    }

    private void putOptionalText(ObjectNode target, String field, JsonNode source, int maxLength) {
        JsonNode value = source.get(field);
        if (value == null || value.isNull()) return;
        if (!value.isTextual() || value.asText().length() > maxLength) throw AiApiException.badRequest("invalid_diagram_text", "A diagram metadata field is invalid or too long.");
        target.put(field, value.asText());
    }

    private String requiredText(JsonNode source, String field, int maxLength) {
        JsonNode value = source.path(field);
        if (!value.isTextual() || value.asText().isBlank() || value.asText().length() > maxLength) throw AiApiException.badRequest("invalid_diagram_element", "A diagram element has invalid text metadata.");
        return value.asText();
    }

    private String requireTextNode(JsonNode value, int maxLength, String code) {
        if (!value.isTextual() || value.asText().isBlank() || value.asText().length() > maxLength) throw AiApiException.badRequest(code, "A diagram element has invalid group metadata.");
        return value.asText();
    }

    private List<ChatMessage> sanitizeHistory(List<ChatMessage> history) {
        if (history == null || history.isEmpty()) return List.of();
        if (history.size() > maxHistoryMessages) throw AiApiException.badRequest("too_much_history", "Too many recent messages were included. Start a new conversation or retry.");
        List<ChatMessage> result = new ArrayList<>();
        int chars = 0;
        for (ChatMessage message : history) {
            if (message == null || message.role() == null || !Set.of("user", "assistant").contains(message.role()) || message.text() == null || message.text().isBlank() || message.text().length() > 16000) {
                throw AiApiException.badRequest("invalid_history", "Recent conversation history contains an invalid message.");
            }
            chars += message.text().length();
            if (chars > maxHistoryChars) throw AiApiException.badRequest("conversation_context_too_large", "Recent conversation history is too large. Start a new conversation or clear some messages.");
            result.add(new ChatMessage(message.role(), message.text()));
        }
        return List.copyOf(result);
    }

    private String serialize(JsonNode node) {
        try { return mapper.writeValueAsString(node); }
        catch (JsonProcessingException ex) { throw AiApiException.badRequest("invalid_diagram_context", "The diagram context could not be validated."); }
    }

    public record ValidatedChatRequest(java.util.UUID conversationId, java.util.UUID requestId, String provider,
            String question, String apiKey, JsonNode diagramContext, List<ChatMessage> history) {}
}
