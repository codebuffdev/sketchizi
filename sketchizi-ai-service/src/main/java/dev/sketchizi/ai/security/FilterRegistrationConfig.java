package dev.sketchizi.ai.security;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FilterRegistrationConfig {
    @Bean FilterRegistrationBean<IdentityAssertionFilter> disableIdentityServletRegistration(IdentityAssertionFilter filter) {
        FilterRegistrationBean<IdentityAssertionFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
    @Bean FilterRegistrationBean<RequestRateLimitFilter> disableRateServletRegistration(RequestRateLimitFilter filter) {
        FilterRegistrationBean<RequestRateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
    @Bean FilterRegistrationBean<RequestBodyLimitFilter> disableBodyServletRegistration(RequestBodyLimitFilter filter) {
        FilterRegistrationBean<RequestBodyLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
