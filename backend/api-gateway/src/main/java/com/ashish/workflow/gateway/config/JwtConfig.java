package com.ashish.workflow.gateway.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;

/**
 * Production-grade JWT configuration.
 * Strictly enforces that JWT_SECRET is provided in the environment and meets cryptographic minimums (>= 32 chars).
 * Zero hardcoded fallback secrets are permitted.
 */
@Configuration
public class JwtConfig {

    private final String jwtSecret;

    public JwtConfig(@Value("${jwt.secret}") String jwtSecret) {
        if (jwtSecret == null || jwtSecret.trim().length() < 32) {
            throw new IllegalStateException(
                    "FATAL SECURITY CONFIGURATION: 'jwt.secret' / 'JWT_SECRET' environment variable must be provided and contain at least 32 characters (256 bits for HMAC-SHA256). Application refuses to boot with insecure configuration.");
        }
        this.jwtSecret = jwtSecret.trim();
    }

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

    @Bean
    @ConditionalOnProperty(name = "jwt.dev-token.enabled", matchIfMissing = true, havingValue = "true")
    public JwtEncoder jwtEncoder() {
        SecretKey key = new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }
}
