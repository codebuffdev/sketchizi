package dev.sketchizi.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

class AuthControllerTest {
    @Test void allowsRootAndInternalApplicationDestinations() {
        assertEquals("/", AuthController.safeReturnTo(null));
        assertEquals("/", AuthController.safeReturnTo("/"));
        assertEquals("/collab/room?view=1", AuthController.safeReturnTo("/collab/room?view=1"));
        assertEquals("/ai-ask", AuthController.safeReturnTo("/ai-ask"));
    }

    @Test void rejectsExternalAndMalformedDestinations() {
        assertEquals("/", AuthController.safeReturnTo("https://evil.example"));
        assertEquals("/", AuthController.safeReturnTo("//evil.example/path"));
        assertEquals("/", AuthController.safeReturnTo("\\\\evil.example"));
        assertEquals("/", AuthController.safeReturnTo("/\\\\evil.example"));
        assertEquals("/", AuthController.safeReturnTo("/safe\r\nLocation: https://evil.example"));
    }
}
