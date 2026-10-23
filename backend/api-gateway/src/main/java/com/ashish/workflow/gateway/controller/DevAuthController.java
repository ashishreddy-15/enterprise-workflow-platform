package com.ashish.workflow.gateway.controller;

import com.ashish.workflow.gateway.api.AuthApi;
import com.ashish.workflow.gateway.config.SessionTokenService;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
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

    public static final String COOKIE_NAME = SessionTokenService.COOKIE_NAME;
    private final SessionTokenService sessionTokenService;

    public DevAuthController(SessionTokenService sessionTokenService) {
        this.sessionTokenService = sessionTokenService;
    }

    @Override
    @PostMapping({"/dev-token", "/login"})
    public Mono<Map<String, String>> generateToken(@RequestBody TokenRequest request, ServerWebExchange exchange) {
        String resolvedUserId = request.userId() != null && !request.userId().isBlank()
                ? request.userId().trim()
                : "anonymous_user";

        List<String> resolvedRoles =
                request.roles() != null && !request.roles().isEmpty() ? request.roles() : List.of("ROLE_EMPLOYEE");

        String token = sessionTokenService.createSessionToken(resolvedUserId, resolvedRoles, exchange);

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
        sessionTokenService.clearSessionCookie(exchange);
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
