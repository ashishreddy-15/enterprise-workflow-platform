package com.ashish.workflow.gateway.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    private final CookieOrHeaderBearerTokenConverter cookieOrHeaderBearerTokenConverter;

    public SecurityConfig(CookieOrHeaderBearerTokenConverter cookieOrHeaderBearerTokenConverter) {
        this.cookieOrHeaderBearerTokenConverter = cookieOrHeaderBearerTokenConverter;
    }

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(
            ServerHttpSecurity http,
            OAuth2AuthenticationSuccessHandler oAuth2AuthenticationSuccessHandler,
            OAuth2AuthenticationFailureHandler oAuth2AuthenticationFailureHandler) {
        return http.csrf(ServerHttpSecurity.CsrfSpec::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeExchange(exchanges -> exchanges
                        .pathMatchers(
                                "/actuator/**",
                                "/health",
                                "/auth/**",
                                "/oauth2/**",
                                "/login/oauth2/**",
                                "/scalar",
                                "/scalar/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**",
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/templates/v3/api-docs/**",
                                "/workflows/v3/api-docs/**",
                                "/analytics/v3/api-docs/**",
                                "/templates/swagger-ui/**",
                                "/workflows/swagger-ui/**",
                                "/analytics/swagger-ui/**")
                        .permitAll()
                        .anyExchange()
                        .authenticated())
                .oauth2Login(oauth2 -> oauth2.authenticationSuccessHandler(oAuth2AuthenticationSuccessHandler)
                        .authenticationFailureHandler(oAuth2AuthenticationFailureHandler))
                .oauth2ResourceServer(oauth2 ->
                        oauth2.jwt(Customizer.withDefaults()).bearerTokenConverter(cookieOrHeaderBearerTokenConverter))
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(
                List.of("http://localhost", "http://localhost:*", "http://127.0.0.1", "http://127.0.0.1:*"));
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
