package dev.sketchizi.ai.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain aiSecurityFilterChain(HttpSecurity http, IdentityAssertionFilter identityFilter,
            RequestRateLimitFilter rateLimitFilter, RequestBodyLimitFilter bodyLimitFilter) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .cors(cors -> cors.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(cache -> cache.disable())
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                .requestMatchers("/api/v1/ai/**").authenticated()
                .anyRequest().denyAll())
            .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) -> {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json");
                response.setHeader("Cache-Control", "no-store");
                response.getWriter().write("{\"error\":\"A verified Sketchizi sign-in session is required.\",\"code\":\"authentication_required\"}");
            }));
        http.addFilterBefore(identityFilter, UsernamePasswordAuthenticationFilter.class);
        http.addFilterAfter(rateLimitFilter, IdentityAssertionFilter.class);
        http.addFilterAfter(bodyLimitFilter, RequestRateLimitFilter.class);
        return http.build();
    }
}
