package dev.sketchizi.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockHttpSession;
import static org.junit.jupiter.api.Assertions.assertTrue;
import java.net.URI;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "COLLAB_HOST_TOKEN_SECRET=test-only-secret-with-more-than-32-bytes")
@Import(AuthSecurityIntegrationTest.MockOAuthClientConfig.class)
class AuthSecurityIntegrationTest {
    @Autowired MockMvc mvc;

    @TestConfiguration
    static class MockOAuthClientConfig {
        @Bean
        ClientRegistrationRepository testClientRegistrationRepository() {
            ClientRegistration registration = ClientRegistration.withRegistrationId("google")
                .clientId("test-client-id")
                .clientSecret("test-client-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "profile", "email")
                .authorizationUri("https://oauth.example.test/authorize")
                .tokenUri("https://oauth.example.test/token")
                .jwkSetUri("https://oauth.example.test/jwks")
                .userInfoUri("https://oauth.example.test/userinfo")
                .userNameAttributeName("sub")
                .clientName("Google")
                .build();
            return new InMemoryClientRegistrationRepository(registration);
        }
    }


    @Test void unauthenticatedMeReturns401Json() throws Exception {
        mvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.authenticated").value(false));
    }

    @Test void authenticatedOidcSessionReturnsValidatedPrincipalFields() throws Exception {
        mvc.perform(get("/api/auth/me").with(oidcLogin().idToken(token -> token
                .subject("google-subject-123").claim("email", "test@example.test").claim("name", "Sketchizi Tester"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.user.id").value("google-subject-123"))
            .andExpect(jsonPath("$.user.email").value("test@example.test"));
    }

    @Test void collaborationHostTokenRequiresAuthenticationAndCsrf() throws Exception {
        mvc.perform(post("/api/auth/collaboration-host-token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomId\":\"room_123456789012345678901234\"}").with(csrf()))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/collaboration-host-token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomId\":\"room_123456789012345678901234\"}").with(oidcLogin()))
            .andExpect(status().isForbidden());
    }

    @Test void authenticatedUserReceivesRoomBoundHostAuthorization() throws Exception {
        mvc.perform(post("/api/auth/collaboration-host-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"roomId\":\"room_123456789012345678901234\"}")
                .with(oidcLogin().idToken(token -> token.subject("google-subject-123").claim("email", "test@example.test").claim("name", "Sketchizi Tester")))
                .with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Sketchizi Tester"))
            .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test void logoutRequiresCsrfToken() throws Exception {
        mvc.perform(post("/api/auth/logout")).andExpect(status().isForbidden());
    }

    @Test void logoutWithCsrfInvalidatesTheAuthenticatedSession() throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/auth/logout").session(session).with(oidcLogin()).with(csrf()))
            .andExpect(status().isNoContent());
        assertTrue(session.isInvalid(), "logout should invalidate the servlet session");
    }

    @Test void protectedUnmappedEndpointRejectsAnonymousRequestsBeforeRouting() throws Exception {
        mvc.perform(get("/api/protected/test")).andExpect(status().isUnauthorized());
    }

    @Test void callbackWithoutMatchingSavedOAuthStateFailsSafely() throws Exception {
        var response = mvc.perform(get("/login/oauth2/code/google").param("code", "fake-code").param("state", "attacker-state"))
            .andReturn().getResponse();
        org.junit.jupiter.api.Assertions.assertTrue(response.getStatus() >= 300 && response.getStatus() < 400,
            "invalid OAuth callback should redirect to the recovery route");
        org.junit.jupiter.api.Assertions.assertTrue(response.getRedirectedUrl().contains("authError=login_failed"),
            "invalid OAuth state must not authenticate the browser");
    }

    @Test void oauthAuthorizationRedirectIncludesState() throws Exception {
        var response = mvc.perform(get("/oauth2/authorization/google"))
            .andExpect(status().is3xxRedirection()).andReturn().getResponse();
        String query = URI.create(response.getRedirectedUrl()).getRawQuery();
        org.junit.jupiter.api.Assertions.assertTrue(query.matches(".*(?:^|&)state=[^&]+.*"), "authorization redirect should carry OAuth state");
    }
}
