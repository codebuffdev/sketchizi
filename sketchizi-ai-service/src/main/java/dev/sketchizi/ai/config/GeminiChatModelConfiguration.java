package dev.sketchizi.ai.config;

import com.google.genai.Client;
import org.springframework.ai.google.genai.GoogleGenAiChatModel;
import org.springframework.ai.google.genai.GoogleGenAiChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.support.RetryTemplate;

/**
 * Configures Spring AI for Gemini 3.x without legacy sampling defaults.
 * Gemini 3.x requests should omit temperature, topP, topK, and candidateCount.
 */
@Configuration(proxyBeanMethods = false)
public class GeminiChatModelConfiguration {

    @Bean
    @ConditionalOnMissingBean(GoogleGenAiChatModel.class)
    public GoogleGenAiChatModel sketchiziGoogleGenAiChatModel(
            Client genAiClient,
            RetryTemplate retryTemplate,
            @Value("${GEMINI_MODEL:gemini-3.8-flash}") String model,
            @Value("${GEMINI_MAX_OUTPUT_TOKENS:2048}") int maxOutputTokens) {
        GoogleGenAiChatOptions options = GoogleGenAiChatOptions.builder()
                .model(model)
                .maxOutputTokens(Math.max(1, maxOutputTokens))
                .build();

        return GoogleGenAiChatModel.builder()
                .genAiClient(genAiClient)
                .defaultOptions(options)
                .retryTemplate(retryTemplate)
                .build();
    }
}
