package dev.sketchizi.ai.service;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.sketchizi.ai.dto.ChatRequest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AiRequestValidatorTest {
    private ObjectMapper mapper;
    private AiRequestValidator validator;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper();
        validator = new AiRequestValidator(mapper, 1500, 180000, 4000, 12, 48000);
    }

    @Test
    void allowListsDiagramFieldsAndStripsSecretLikeResourceProperties() throws Exception {
        var diagram = mapper.readTree("""
            {"schemaVersion":1,"snapshotId":"snap-1","scope":"complete-current-canvas","elementCount":2,"elements":[
              {"id":"client","type":"rectangle","label":"Client","geometry":{"x":1,"y":2,"width":30,"height":40},"unexpectedInternalState":"do not pass"},
              {"id":"db","type":"rectangle","architectureResource":{"provider":"aws","definitionId":"aws.rds","properties":{"engine":"postgres","apiKey":"never-send"}}}
            ]}
            """);
        var request = new ChatRequest(UUID.randomUUID(), UUID.randomUUID(), "builtin", "Explain this diagram", null, diagram, List.of());
        var validated = validator.validate(request);
        String normalized = mapper.writeValueAsString(validated.diagramContext());
        assertTrue(normalized.contains("Client"));
        assertTrue(normalized.contains("postgres"));
        assertFalse(normalized.contains("unexpectedInternalState"));
        assertFalse(normalized.contains("never-send"));
    }

    @Test
    void rejectsIncompleteOrOversizedDiagramInsteadOfSilentlyTruncating() throws Exception {
        var inconsistent = mapper.readTree("""
            {"schemaVersion":1,"elementCount":2,"elements":[{"id":"only-one","type":"rectangle"}]}
            """);
        var request = new ChatRequest(UUID.randomUUID(), UUID.randomUUID(), "builtin", "Explain", null, inconsistent, List.of());
        AiApiException exception = assertThrows(AiApiException.class, () -> validator.validate(request));
        assertEquals("inconsistent_diagram_context", exception.code());
    }

    @Test
    void preservesNetworkingResourceIdsAndArchitectureRelationships() throws Exception {
        var diagram = mapper.readTree("""
            {"schemaVersion":1,"elementCount":3,"elements":[
              {"id":"vpc","type":"rectangle","architectureResource":{"provider":"networking","resourceId":"network-vpc-1","definitionId":"net.vpc","resourceType":"VPC","properties":{"name":"Production VPC"}}},
              {"id":"subnet","type":"rectangle","architectureResource":{"provider":"networking","resourceId":"network-subnet-1","definitionId":"net.subnet","resourceType":"Subnet","properties":{"name":"Private Subnet"}}},
              {"id":"edge","type":"arrow","connector":{"sourceElementId":"vpc","targetElementId":"subnet","relationshipExplicit":true},"architectureRelationship":{"provider":"networking","relationshipId":"network-link-1","relationshipType":"contains","sourceResourceId":"network-vpc-1","targetResourceId":"network-subnet-1"}}
            ]}
            """);
        var request = new ChatRequest(UUID.randomUUID(), UUID.randomUUID(), "builtin", "Explain the networking", null, diagram, List.of());
        var validated = validator.validate(request);
        var resources = mapper.writeValueAsString(validated.diagramContext());
        assertTrue(resources.contains("network-vpc-1"));
        assertTrue(resources.contains("network-subnet-1"));
        assertTrue(resources.contains("network-link-1"));
        assertTrue(resources.contains("contains"));
    }

    @Test
    void rejectsApiKeysForBuiltinProviderAndRequiresKeyForByok() throws Exception {
        var diagram = mapper.readTree("""
            {"schemaVersion":1,"elementCount":0,"elements":[]}
            """);
        ChatRequest withUnexpectedKey = new ChatRequest(UUID.randomUUID(), UUID.randomUUID(), "builtin", "Explain", "this-is-a-long-enough-key-value", diagram, List.of());
        assertEquals("unexpected_api_key", assertThrows(AiApiException.class, () -> validator.validate(withUnexpectedKey)).code());
        ChatRequest withoutKey = new ChatRequest(UUID.randomUUID(), UUID.randomUUID(), "byok", "Explain", null, diagram, List.of());
        assertEquals("invalid_byok_key", assertThrows(AiApiException.class, () -> validator.validate(withoutKey)).code());
    }
}
