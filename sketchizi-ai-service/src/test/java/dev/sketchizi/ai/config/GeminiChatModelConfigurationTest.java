package dev.sketchizi.ai.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.google.genai.Client;
import org.junit.jupiter.api.Test;
import org.springframework.ai.google.genai.GoogleGenAiChatModel;
import org.springframework.ai.google.genai.GoogleGenAiChatOptions;
import org.springframework.retry.support.RetryTemplate;

class GeminiChatModelConfigurationTest {

    @Test
    void usesGemini38WithoutLegacySamplingParameters() {
        Client client = Client.builder().apiKey("unit-test-only-not-a-real-key").build();
        GoogleGenAiChatModel model = new GeminiChatModelConfiguration()
                .sketchiziGoogleGenAiChatModel(client, new RetryTemplate(), "gemini-3.8-flash", 2048);

        GoogleGenAiChatOptions options = (GoogleGenAiChatOptions) model.getDefaultOptions();
        assertEquals("gemini-3.8-flash", options.getModel());
        assertEquals(2048, options.getMaxOutputTokens());
        assertNull(options.getTemperature());
        assertNull(options.getTopP());
        assertNull(options.getTopK());
        assertNull(options.getCandidateCount());
    }
}
