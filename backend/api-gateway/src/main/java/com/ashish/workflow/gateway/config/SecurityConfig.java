package com.ashish.workflow.gateway.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Value("${jwt.secret:ewp-enterprise-super-secret-signing-key-2026-min-32-bytes}")
    private String jwtSecret;

    private final CookieOrHeaderBearerTokenConverter cookieOrHeaderBearerTokenConverter;

    public SecurityConfig(CookieOrHeaderBearerTokenConverter cookieOrHeaderBearerTokenConverter) {
        this.cookieOrHeaderBearerTokenConverter = cookieOrHeaderBearerTokenConverter;
    }

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http.csrf(ServerHttpSecurity.CsrfSpec::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeExchange(exchanges -> exchanges
                        .pathMatchers(
                                "/actuator/**",
                                "/health",
                                "/auth/dev-token",
                                "/auth/logout",
                                "/auth/me",
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

    /**
     * Active when no external issuer-uri is configured (Local/Dev mode).
     * If spring.security.oauth2.resourceserver.jwt.issuer-uri is set,
     * Spring Boot auto-configures a ReactiveJwtDecoder connected to the IdP JWKS endpoint.
     */
    @Bean
    @ConditionalOnProperty(
            name = "spring.security.oauth2.resourceserver.jwt.issuer-uri",
            matchIfMissing = true,
            havingValue = "")
    public ReactiveJwtDecoder reactiveJwtDecoder() {
        SecretKey key = new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        return NimbusReactiveJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
    }

    /**
     * Dev token encoder for minting signed JWTs locally.
     * Can be turned off in production via jwt.dev-token.enabled=false.
     */
    @Bean
    @ConditionalOnProperty(name = "jwt.dev-token.enabled", matchIfMissing = true, havingValue = "true")
    public JwtEncoder jwtEncoder() {
        SecretKey key = new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }
}
