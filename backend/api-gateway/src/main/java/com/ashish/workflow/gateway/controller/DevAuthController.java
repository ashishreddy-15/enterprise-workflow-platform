package com.ashish.workflow.gateway.controller;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/auth")
@ConditionalOnProperty(name = "jwt.dev-token.enabled", matchIfMissing = true, havingValue = "true")
public class DevAuthController {

    public static final String COOKIE_NAME = "ewp_access_token";
    private final JwtEncoder jwtEncoder;

    public DevAuthController(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }

    public record TokenRequest(String userId, List<String> roles) {}

    @PostMapping("/dev-token")
    public Mono<Map<String, String>> generateToken(@RequestBody TokenRequest request, ServerWebExchange exchange) {
        Instant now = Instant.now();

        String resolvedUserId = request.userId() != null && !request.userId().isBlank()
                ? request.userId().trim()
                : "anonymous_user";

        List<String> resolvedRoles =
                request.roles() != null && !request.roles().isEmpty() ? request.roles() : List.of("ROLE_EMPLOYEE");

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("https://auth.ewp.ashish.com")
                .issuedAt(now)
                .expiresAt(now.plus(8, ChronoUnit.HOURS))
                .subject(resolvedUserId)
                .claim("roles", resolvedRoles)
                .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token =
                jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        // Attach secure HttpOnly cookie for production-grade browser session management
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, token)
                .httpOnly(true)
                .secure(false) // localhost dev; in production HTTPS this is true
                .path("/")
                .sameSite("Lax")
                .maxAge(Duration.ofHours(8))
                .build();
        exchange.getResponse().addCookie(cookie);

        return Mono.just(
                Map.of("access_token", token, "token_type", "Bearer", "expires_in", "28800", "userId", resolvedUserId));
    }

    @GetMapping("/me")
    public Mono<Map<String, Object>> getCurrentUser(Authentication authentication) {
        if (authentication instanceof JwtAuthenticationToken jwtAuth) {
            Jwt jwt = jwtAuth.getToken();
            List<String> roles = jwt.getClaimAsStringList("roles");
            return Mono.just(Map.of(
                    "authenticated", true,
                    "userId", jwt.getSubject() != null ? jwt.getSubject() : "",
                    "roles", roles != null ? roles : List.of()));
        }
        return Mono.just(Map.of("authenticated", false));
    }

    @PostMapping("/logout")
    public Mono<Map<String, Object>> logout(ServerWebExchange exchange) {
        // Clear HttpOnly cookie immediately
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(false)
                .path("/")
                .sameSite("Lax")
                .maxAge(Duration.ZERO)
                .build();
        exchange.getResponse().addCookie(cookie);

        return Mono.just(Map.of("message", "Logged out successfully", "authenticated", false));
    }
}
