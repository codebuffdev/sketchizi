package dev.sketchizi.auth;

import jakarta.servlet.http.HttpServletResponse;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class SecurityConfig {
    @Bean
    CookieCsrfTokenRepository csrfTokenRepository() {
        CookieCsrfTokenRepository repo = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repo.setCookiePath("/");
        repo.setCookieCustomizer(cookie -> cookie.sameSite("Lax").secure(Boolean.parseBoolean(System.getenv().getOrDefault("COOKIE_SECURE", "true"))));
        return repo;
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            CookieCsrfTokenRepository csrfRepository,
            JdbcTemplate jdbc,
            ObjectMapper mapper,
            @Value("${app.frontend-origin:https://sketchizi.pages.dev}") String frontendOrigin) throws Exception {

        OidcUserService oidcUserService = new OidcUserService();

        http.csrf(
                        csrf ->
                                csrf.
                                        csrfTokenRepository(csrfRepository).
                                        csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .authorizeHttpRequests(
                        auth -> auth.requestMatchers(
                                        "/auth/login/google",
                                        "/oauth2/**",
                                        "/login/oauth2/**",
                                        "/actuator/health",
                                        "/error")
                                .permitAll()
                                .requestMatchers(
                                        "/api/auth/me",
                                        "/api/auth/csrf",
                                        "/api/auth/logout")
                                .permitAll()
                                .anyRequest()
                                .authenticated())
                .oauth2Login(
                        oauth -> oauth.userInfoEndpoint(
                                        userInfo -> userInfo.oidcUserService(oidcUserService))
                                .successHandler((request, response, authentication) -> {
                                    OidcUser user = (OidcUser) authentication.getPrincipal();
                                    jdbc.update("""
                                                      INSERT INTO sketchizi_users
                                                                    (provider, provider_subject, email, display_name,
                                                                     picture_url, last_seen_at)
                                                                VALUES ('google', ?, ?, ?, ?, CURRENT_TIMESTAMP)
                                                                ON CONFLICT (provider, provider_subject)
                                                                DO UPDATE SET
                                                                    email = EXCLUDED.email,
                                                                    display_name = EXCLUDED.display_name,
                                                                    picture_url = EXCLUDED.picture_url,
                                                                    last_seen_at = CURRENT_TIMESTAMP
                                                    """,
                                            user.getSubject(),
                                            user.getEmail(),
                                            user.getFullName(),
                                            user.getPicture());

                                    String returnTo = AuthController.safeReturnTo(
                                            (String) request.getSession()
                                                    .getAttribute(AuthController.RETURN_TO_SESSION_KEY));

                                    request.getSession().removeAttribute(AuthController.RETURN_TO_SESSION_KEY);
                                    response.setHeader("Cache-Control", "no-store");
                                    response.sendRedirect(frontendOrigin.replaceAll("/$", "") + returnTo);
                                })
                                .failureHandler(
                                        (request, response, exception) -> {
                                            response.setHeader("Cache-Control", "no-store");
                                            response.sendRedirect(frontendOrigin.replaceAll("/$", "") + "/?authError=login_failed");
                                        }
                                )
                )
                .logout(
                        logout -> logout.logoutUrl("/api/auth/logout")
                                .invalidateHttpSession(true)
                                .clearAuthentication(true)
                                .deleteCookies("SESSION", "JSESSIONID")
                                .logoutSuccessHandler(
                                        (request, response, authentication) ->
                                        {
                                            response.setStatus(204);
                                            response.setHeader("Cache-Control", "no-store");
                                        }
                                )
                )
                .exceptionHandling(
                        exceptions ->
                                exceptions.authenticationEntryPoint(
                                        (request, response, exception) ->
                                        {
                                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                                            response.setHeader("Cache-Control", "no-store");
                                            mapper.writeValue(response.getOutputStream(), Map.of("authenticated", false, "error", "unauthorized"));
                                        }
                                )
                )
                .headers(headers -> headers.cacheControl(Customizer.withDefaults()));
        return http.build();
    }

}