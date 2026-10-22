package com.ashish.workflow.gateway.controller;

import com.ashish.workflow.gateway.api.AuthApi;
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
public class DevAuthController implements AuthApi {

    public static final String COOKIE_NAME = "ewp_access_token";
    private final JwtEncoder jwtEncoder;

    public DevAuthController(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }

    @Override
    @PostMapping({"/dev-token", "/login"})
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

        return Mono.just(Map.of(
                "token",
                token,
                "status",
                "authenticated",
                "userId",
                resolvedUserId,
                "roles",
                String.join(",", resolvedRoles)));
    }

    @Override
    @PostMapping("/logout")
    public Mono<Map<String, String>> logout(ServerWebExchange exchange) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(false)
                .path("/")
                .sameSite("Lax")
                .maxAge(0)
                .build();

        exchange.getResponse().addCookie(cookie);

        return Mono.just(Map.of("status", "logged_out"));
    }

    @Override
    @GetMapping("/me")
    public Mono<Map<String, Object>> getCurrentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return Mono.just(Map.of("authenticated", false));
        }

        String userId = authentication.getName();
        List<String> roles = List.of();

        if (authentication instanceof JwtAuthenticationToken jwtToken) {
            Jwt jwt = jwtToken.getToken();
            List<String> claimRoles = jwt.getClaimAsStringList("roles");
            if (claimRoles != null) {
                roles = claimRoles;
            }
        }

        return Mono.just(Map.of("authenticated", true, "userId", userId, "roles", roles));
    }
}
