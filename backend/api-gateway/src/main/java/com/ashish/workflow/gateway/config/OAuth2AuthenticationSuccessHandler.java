package com.ashish.workflow.gateway.config;

import com.ashish.workflow.gateway.controller.DevAuthController;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.web.server.WebFilterExchange;
import org.springframework.security.web.server.authentication.ServerAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class OAuth2AuthenticationSuccessHandler implements ServerAuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2AuthenticationSuccessHandler.class);

    private final JwtEncoder jwtEncoder;

    @Value("${ewp.auth.frontend-url:http://localhost/}")
    private String defaultFrontendUrl;

    public OAuth2AuthenticationSuccessHandler(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }

    @Override
    public Mono<Void> onAuthenticationSuccess(WebFilterExchange webFilterExchange, Authentication authentication) {
        ServerWebExchange exchange = webFilterExchange.getExchange();

        String userId = resolveUserId(authentication);
        List<String> roles = resolveRoles(authentication);

        log.info("OAuth2 OIDC Authentication Successful for user='{}', resolved roles={}", userId, roles);

        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("https://auth.ewp.ashish.com")
                .issuedAt(now)
                .expiresAt(now.plus(8, ChronoUnit.HOURS))
                .subject(userId)
                .claim("roles", roles)
                .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        ResponseCookie cookie = ResponseCookie.from(DevAuthController.COOKIE_NAME, token)
                .httpOnly(true)
                .secure(false) // in production HTTPS: true
                .path("/")
                .sameSite("Lax")
                .maxAge(Duration.ofHours(8))
                .build();

        exchange.getResponse().addCookie(cookie);

        URI targetUri = resolveTargetUri(exchange);
        log.info("Redirecting authenticated user to: {}", targetUri);

        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
        exchange.getResponse().getHeaders().setLocation(targetUri);
        return exchange.getResponse().setComplete();
    }

    private String resolveUserId(Authentication authentication) {
        if (authentication.getPrincipal() instanceof OAuth2User oauth2User) {
            String preferredUsername = oauth2User.getAttribute("preferred_username");
            if (preferredUsername != null && !preferredUsername.isBlank()) {
                return preferredUsername.trim();
            }
            String email = oauth2User.getAttribute("email");
            if (email != null && !email.isBlank()) {
                return email.trim();
            }
        }
        return authentication.getName();
    }

    private List<String> resolveRoles(Authentication authentication) {
        Set<String> roles = new HashSet<>();

        // 1. Spring Security GrantedAuthorities
        if (authentication.getAuthorities() != null) {
            for (GrantedAuthority ga : authentication.getAuthorities()) {
                String auth = ga.getAuthority();
                if (auth != null && !auth.isBlank() && !auth.startsWith("OIDC_") && !auth.startsWith("SCOPE_")) {
                    roles.add(auth.startsWith("ROLE_") ? auth.toUpperCase() : "ROLE_" + auth.toUpperCase());
                }
            }
        }

        // 2. Keycloak realm_access.roles
        if (authentication.getPrincipal() instanceof OAuth2User oauth2User) {
            Object realmAccess = oauth2User.getAttribute("realm_access");
            if (realmAccess instanceof Map<?, ?> map) {
                Object rObj = map.get("roles");
                if (rObj instanceof Collection<?> col) {
                    for (Object item : col) {
                        String r = item.toString().trim();
                        if (!r.startsWith("default-roles") && !r.equalsIgnoreCase("offline_access") && !r.equalsIgnoreCase("uma_authorization")) {
                            roles.add(r.startsWith("ROLE_") ? r.toUpperCase() : "ROLE_" + r.toUpperCase());
                        }
                    }
                }
            }

            // 3. Direct 'roles' attribute (e.g. from protocol mapper or Azure AD)
            Object directRoles = oauth2User.getAttribute("roles");
            if (directRoles instanceof Collection<?> col) {
                for (Object item : col) {
                    String r = item.toString().trim();
                    roles.add(r.startsWith("ROLE_") ? r.toUpperCase() : "ROLE_" + r.toUpperCase());
                }
            }
        }

        if (roles.isEmpty()) {
            roles.add("ROLE_EMPLOYEE");
        }

        return new ArrayList<>(roles);
    }

    private URI resolveTargetUri(ServerWebExchange exchange) {
        List<String> refererHeaders = exchange.getRequest().getHeaders().get("Referer");
        if (refererHeaders != null && !refererHeaders.isEmpty()) {
            String ref = refererHeaders.get(0);
            if (ref.contains(":4200")) {
                return URI.create("http://localhost:4200/");
            }
        }
        return URI.create(defaultFrontendUrl);
    }
}
